import type { IRead } from '@rocket.chat/apps-engine/definition/accessors';

export interface DirectoryListing {
	id: string;
	name: string;
	category: string;
	description: string;
	contact: string;
	/** Composite score 0–100 */
	score: number;
	/** Number of community reviews */
	reviewCount: number;
	/** Listing subscription tier: basic | standard | premium */
	tier: 'basic' | 'standard' | 'premium';
}

const TIER_WEIGHT = 20; // Max points from listing tier
const REVIEW_WEIGHT = 40; // Max points from member reviews
const CONTRIBUTION_WEIGHT = 30; // Max points from community contribution
const ACTIVITY_WEIGHT = 10; // Max points from recency/activity

/**
 * Compute a composite ranking score for a directory listing.
 * Score is 0–100.
 */
export function computeScore(listing: {
	tier: DirectoryListing['tier'];
	reviewAverage: number; // 0–5
	reviewCount: number;
	contributionScore: number; // 0–100
	daysSinceLastActivity: number;
}): number {
	const tierPoints: Record<DirectoryListing['tier'], number> = {
		basic: 0,
		standard: 10,
		premium: 20,
	};

	const reviewPoints = Math.min((listing.reviewAverage / 5) * REVIEW_WEIGHT, REVIEW_WEIGHT);
	const contributionPoints = Math.min((listing.contributionScore / 100) * CONTRIBUTION_WEIGHT, CONTRIBUTION_WEIGHT);
	const activityPoints = Math.max(0, ACTIVITY_WEIGHT - listing.daysSinceLastActivity * 0.5);

	return Math.round(tierPoints[listing.tier] + reviewPoints + contributionPoints + activityPoints);
}

/**
 * Fetch top N listings from persistence, optionally filtered by category.
 *
 * In a real deployment this reads from the Apps Engine persistence store
 * which is populated when admins add/update listings.
 */
export class DirectoryService {
	static async getTopListings(
		read: IRead,
		category: string | null,
		limit: number,
	): Promise<DirectoryListing[]> {
		const persis = read.getPersistenceReader();

		let associations: any[];
		if (category) {
			const { RocketChatAssociationModel, RocketChatAssociationRecord } = await import(
				'@rocket.chat/apps-engine/definition/metadata'
			);
			associations = [new RocketChatAssociationRecord(RocketChatAssociationModel.MISC, `directory:category:${category.toLowerCase()}`)];
		} else {
			const { RocketChatAssociationModel, RocketChatAssociationRecord } = await import(
				'@rocket.chat/apps-engine/definition/metadata'
			);
			associations = [new RocketChatAssociationRecord(RocketChatAssociationModel.MISC, 'directory:all')];
		}

		const records = (await persis.readByAssociations(associations)) as DirectoryListing[][];
		const listings: DirectoryListing[] = records.flat();

		return listings.sort((a, b) => b.score - a.score).slice(0, limit);
	}

	static async saveListing(
		persis: any,
		listing: DirectoryListing,
	): Promise<void> {
		const { RocketChatAssociationModel, RocketChatAssociationRecord } = await import(
			'@rocket.chat/apps-engine/definition/metadata'
		);

		await persis.updateByAssociations(
			[
				new RocketChatAssociationRecord(RocketChatAssociationModel.MISC, 'directory:all'),
				new RocketChatAssociationRecord(RocketChatAssociationModel.MISC, `directory:category:${listing.category.toLowerCase()}`),
				new RocketChatAssociationRecord(RocketChatAssociationModel.MISC, `directory:listing:${listing.id}`),
			],
			listing,
			true,
		);
	}
}
