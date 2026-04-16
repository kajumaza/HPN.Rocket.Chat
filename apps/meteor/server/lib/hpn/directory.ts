import { randomUUID } from 'crypto';

import { Meteor } from 'meteor/meteor';
import { MongoInternals } from 'meteor/mongo';
import { Messages, Rooms, Users } from '@rocket.chat/models';

const getDb = () => MongoInternals.defaultRemoteCollectionDriver().mongo.db;

export const getListingsCol = () => getDb().collection('hpn_directory_listings');
export const getReviewsCol = () => getDb().collection('hpn_directory_reviews');
export const getCategoriesCol = () => getDb().collection('hpn_directory_categories');
export const getSettingsCol = () => getDb().collection('hpn_directory_settings');

async function notifyAdminRoom(msg: string): Promise<void> {
	try {
		const adminUser = await Users.findOne({ roles: 'admin' });
		const adminRoom = await Rooms.findOne({ 'customFields.hpnRoomKey': 'admin' } as any);
		if (!adminUser || !adminRoom) return;
		await Messages.insertOne({
			rid: adminRoom._id,
			msg,
			ts: new Date(),
			u: { _id: adminUser._id, username: adminUser.username ?? 'system', name: adminUser.name ?? 'System' },
			_updatedAt: new Date(),
		} as any);
	} catch {
		// Non-critical — don't fail submission if notification fails
	}
}

Meteor.methods({
	async 'hpn/directory/submit'(data: {
		businessName: string;
		categories: string[];
		services?: string[];
		briefDescription: string;
		fullDescription: string;
		contactName: string;
		contactEmail: string;
		contactPhone?: string;
		website?: string;
	}) {
		if (!this.userId) throw new Meteor.Error('unauthorized', 'Must be logged in');

		const user = await Users.findOneById(this.userId);
		if (!user?.roles?.includes('hpn-supplier')) {
			throw new Meteor.Error('forbidden', 'Only suppliers can submit directory listings');
		}

		const col = getListingsCol();
		const existing = await col.findOne({ submittedBy: this.userId, status: 'approved' });
		if (existing) throw new Meteor.Error('already-listed', 'You already have an approved listing');

		const now = new Date();
		await col.insertOne({
			_id: randomUUID(),
			businessName: data.businessName,
			categories: data.categories,
			services: data.services ?? [],
			briefDescription: data.briefDescription,
			fullDescription: data.fullDescription,
			contactName: data.contactName,
			contactEmail: data.contactEmail,
			contactPhone: data.contactPhone ?? '',
			website: data.website ?? '',
			logoUrl: '',
			status: 'pending',
			submittedBy: this.userId,
			submittedAt: now,
			approvedBy: null,
			approvedAt: null,
			rejectionReason: '',
			score: 20,
			reviewCount: 0,
			reviewAvg: 0,
			lastActivity: now,
			_updatedAt: now,
		});

		await notifyAdminRoom(
			`📋 **New listing submitted:** ${data.businessName}\n` +
				`Category: ${data.category} | Submitted by: @${user.username ?? 'unknown'}\n` +
				`Review at: /admin/hpn-directory`,
		);
	},

	async 'hpn/directory/approve'(listingId: string, approved: boolean, rejectionReason?: string) {
		if (!this.userId) throw new Meteor.Error('unauthorized');
		const user = await Users.findOneById(this.userId);
		if (!user?.roles?.includes('admin')) throw new Meteor.Error('forbidden');

		await getListingsCol().updateOne(
			{ _id: listingId },
			{
				$set: {
					status: approved ? 'approved' : 'rejected',
					approvedBy: this.userId,
					approvedAt: new Date(),
					rejectionReason: rejectionReason ?? '',
					_updatedAt: new Date(),
				},
			},
		);

		if (approved) {
			try {
				const listing = await getListingsCol().findOne({ _id: listingId });
				if (listing) {
					const { extractAndSaveKeywords, refreshDynamicKeywords } = await import('./supplierBot');
					await extractAndSaveKeywords(listing);
					await refreshDynamicKeywords();
				}
			} catch {
				// Non-critical — don't fail approval if keyword extraction fails
			}
		}
	},

	async 'hpn/directory/submit-edit'(data: {
		businessName: string;
		categories: string[];
		services?: string[];
		briefDescription: string;
		fullDescription: string;
		contactName: string;
		contactEmail: string;
		contactPhone?: string;
		website?: string;
	}) {
		if (!this.userId) throw new Meteor.Error('unauthorized');
		const user = await Users.findOneById(this.userId);
		if (!user?.roles?.includes('hpn-supplier')) throw new Meteor.Error('forbidden');

		const col = getListingsCol();
		const listing = await col.findOne({ submittedBy: this.userId, status: 'approved' });
		if (!listing) throw new Meteor.Error('not-found', 'No approved listing to edit');

		await col.updateOne(
			{ _id: listing._id },
			{
				$set: {
					pendingEdit: {
						businessName: data.businessName,
						categories: data.categories,
						services: data.services ?? [],
						briefDescription: data.briefDescription,
						fullDescription: data.fullDescription,
						contactName: data.contactName,
						contactEmail: data.contactEmail,
						contactPhone: data.contactPhone ?? '',
						website: data.website ?? '',
						submittedAt: new Date(),
					},
					editStatus: 'pending',
					_updatedAt: new Date(),
				},
			},
		);

		await notifyAdminRoom(
			`✏️ **Listing edit submitted:** ${data.businessName}\n` +
				`Submitted by: @${user.username ?? 'unknown'}\n` +
				`Review at: /admin/hpn-directory`,
		);
	},

	async 'hpn/directory/approve-edit'(listingId: string, approved: boolean, rejectionReason?: string) {
		if (!this.userId) throw new Meteor.Error('unauthorized');
		const user = await Users.findOneById(this.userId);
		if (!user?.roles?.includes('admin')) throw new Meteor.Error('forbidden');

		const col = getListingsCol();
		const listing = await col.findOne({ _id: listingId });
		if (!listing) throw new Meteor.Error('not-found');

		if (approved && listing.pendingEdit) {
			const { submittedAt, ...editFields } = listing.pendingEdit as any;
			await col.updateOne(
				{ _id: listingId },
				{
					$set: {
						...editFields,
						editStatus: null,
						lastActivity: new Date(),
						_updatedAt: new Date(),
					},
					$unset: { pendingEdit: 1 },
				},
			);
		} else {
			await col.updateOne(
				{ _id: listingId },
				{
					$set: {
						'pendingEdit.editRejectionReason': rejectionReason ?? '',
						editStatus: 'rejected',
						_updatedAt: new Date(),
					},
				},
			);
		}
	},

	async 'hpn/directory/admin/pending-edits'() {
		if (!this.userId) throw new Meteor.Error('unauthorized');
		const user = await Users.findOneById(this.userId);
		if (!user?.roles?.includes('admin')) throw new Meteor.Error('forbidden');
		return getListingsCol().find({ editStatus: 'pending' }, { sort: { _updatedAt: -1 } }).toArray();
	},

	async 'hpn/directory/review'(listingId: string, rating: number, comment: string) {
		if (!this.userId) throw new Meteor.Error('unauthorized');
		if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new Meteor.Error('invalid-rating');

		const user = await Users.findOneById(this.userId);
		if (!user) throw new Meteor.Error('unauthorized');

		const reviewsCol = getReviewsCol();
		const existing = await reviewsCol.findOne({ listingId, userId: this.userId });
		if (existing) throw new Meteor.Error('already-reviewed', 'You have already reviewed this listing');

		await reviewsCol.insertOne({
			_id: randomUUID(),
			listingId,
			userId: this.userId,
			username: user.username ?? '',
			rating,
			comment,
			createdAt: new Date(),
		});

		// Update listing review stats
		const reviews = await reviewsCol.find({ listingId }).toArray();
		const avg = reviews.reduce((sum, r) => sum + (r.rating as number), 0) / reviews.length;

		await getListingsCol().updateOne(
			{ _id: listingId },
			{
				$set: {
					reviewCount: reviews.length,
					reviewAvg: Math.round(avg * 10) / 10,
					lastActivity: new Date(),
					_updatedAt: new Date(),
				},
			},
		);
	},

	async 'hpn/directory/categories/save'(name: string, id?: string) {
		if (!this.userId) throw new Meteor.Error('unauthorized');
		const user = await Users.findOneById(this.userId);
		if (!user?.roles?.includes('admin')) throw new Meteor.Error('forbidden');

		const slug = name.toLowerCase().replace(/\s+/g, '-');
		if (id) {
			await getCategoriesCol().updateOne({ _id: id }, { $set: { name, slug, _updatedAt: new Date() } });
		} else {
			await getCategoriesCol().insertOne({ _id: randomUUID(), name, slug, order: 99, _updatedAt: new Date() });
		}
	},

	async 'hpn/directory/categories/remove'(id: string) {
		if (!this.userId) throw new Meteor.Error('unauthorized');
		const user = await Users.findOneById(this.userId);
		if (!user?.roles?.includes('admin')) throw new Meteor.Error('forbidden');
		await getCategoriesCol().deleteOne({ _id: id });
	},

	async 'hpn/directory/listings/get'(category?: string) {
		const query: Record<string, unknown> = { status: 'approved' };
		if (category) query.$or = [{ categories: { $in: [category] } }, { category }];
		return getListingsCol().find(query, { sort: { score: -1 } }).toArray();
	},

	async 'hpn/directory/categories/get'() {
		return getCategoriesCol().find({}, { sort: { order: 1, name: 1 } }).toArray();
	},

	async 'hpn/directory/admin/pending'() {
		if (!this.userId) throw new Meteor.Error('unauthorized');
		const user = await Users.findOneById(this.userId);
		if (!user?.roles?.includes('admin')) throw new Meteor.Error('forbidden');
		return getListingsCol().find({ status: 'pending' }, { sort: { submittedAt: -1 } }).toArray();
	},

	async 'hpn/directory/admin/all'() {
		if (!this.userId) throw new Meteor.Error('unauthorized');
		const user = await Users.findOneById(this.userId);
		if (!user?.roles?.includes('admin')) throw new Meteor.Error('forbidden');
		return getListingsCol().find({}, { sort: { submittedAt: -1 } }).toArray();
	},

	async 'hpn/directory/my-listing'() {
		if (!this.userId) throw new Meteor.Error('unauthorized');
		return getListingsCol().findOne({ submittedBy: this.userId });
	},

	async 'hpn/directory/reviews/get'(listingId: string) {
		return getReviewsCol().find({ listingId }, { sort: { createdAt: -1 } }).toArray();
	},

	async 'hpn/directory/settings/get'() {
		const doc = await getSettingsCol().findOne({ _id: 'config' });
		return { maxCategories: (doc as any)?.maxCategories ?? 1 };
	},

	async 'hpn/directory/settings/save'(maxCategories: number) {
		if (!this.userId) throw new Meteor.Error('unauthorized');
		const user = await Users.findOneById(this.userId);
		if (!user?.roles?.includes('admin')) throw new Meteor.Error('forbidden');
		if (!Number.isInteger(maxCategories) || maxCategories < 1 || maxCategories > 10) {
			throw new Meteor.Error('invalid', 'maxCategories must be between 1 and 10');
		}
		await getSettingsCol().updateOne(
			{ _id: 'config' },
			{ $set: { maxCategories, _updatedAt: new Date() } },
			{ upsert: true },
		);
	},
});

/** Recalculate all listing scores — called by weekly cron */
export async function recalculateDirectoryScores(): Promise<void> {
	const col = getListingsCol();
	const listings = await col.find({ status: 'approved' }).toArray();

	for (const listing of listings) {
		const reviewScore = listing.reviewAvg ? (Number(listing.reviewAvg) / 5) * 40 : 0;
		const tierScore = 20;
		const daysSince = (Date.now() - new Date(listing.lastActivity as Date).getTime()) / 86400000;
		const activityScore = Math.max(0, 10 - (daysSince / 30) * 10);
		const contributionScore = Math.min(30, Number(listing.reviewCount ?? 0) * 3);
		const score = Math.round(reviewScore + tierScore + activityScore + contributionScore);

		await col.updateOne({ _id: listing._id }, { $set: { score, _updatedAt: new Date() } });
	}

	console.log(`[HPN Directory] Recalculated scores for ${listings.length} listings`);
}
