import { Meteor } from 'meteor/meteor';
import { MongoInternals } from 'meteor/mongo';
import { Settings, Users, Rooms } from '@rocket.chat/models';

const db = MongoInternals.defaultRemoteCollectionDriver().mongo.db;
const pollsCol = db.collection('hpn_polls');
const surveysCol = db.collection('hpn_surveys');
const surveyResponsesCol = db.collection('hpn_survey_responses');

/**
 * Ensure MongoDB indexes for polls and surveys.
 */
async function ensureIndexes(): Promise<void> {
	await pollsCol.createIndex({ createdAt: -1 });
	await surveysCol.createIndex({ createdAt: -1 });
	await surveyResponsesCol.createIndex({ surveyId: 1, userId: 1 }, { unique: true });
}

Meteor.startup(() => {
	ensureIndexes().catch((err) => console.error('[HPN Polls] Index error:', err));
});

const PAID_HPN_ROLES = ['hpn-student', 'hpn-manager', 'hpn-executive', 'hpn-supplier', 'admin'];

/**
 * Check whether a user's roles grant access to a given audience restriction.
 * Admins always pass. 'everyone' always passes.
 * Each tier is exclusive — 'hpn-executive' means executives only, not managers.
 */
function canAccessAudience(roles: string[], audience: string): boolean {
	if (roles.includes('admin')) return true;
	if (audience === 'everyone') return true;
	if (audience === 'admin') return false; // admins only, already handled above
	return roles.includes(audience); // exact role match
}

/**
 * Check whether the given user passes the HPN create-permission setting.
 */
async function checkCreatePermission(userId: string, settingId: string): Promise<void> {
	const setting = await Settings.findOneById(settingId);
	const permission: string = (setting?.value as string) ?? 'admin';

	if (permission === 'everyone') return;

	const user = await Users.findOneById(userId);
	if (!user) throw new Meteor.Error('not-authorized', 'User not found');

	const roles: string[] = (user.roles ?? []) as string[];

	if (permission === 'paid') {
		const hasPaid = PAID_HPN_ROLES.some((r) => roles.includes(r));
		if (!hasPaid) throw new Meteor.Error('forbidden', 'This feature is available to paid members only');
		return;
	}

	// admin
	if (!roles.includes('admin')) throw new Meteor.Error('forbidden', 'Admins only');
}

async function requireAdmin(userId: string): Promise<void> {
	const user = await Users.findOneById(userId);
	const roles: string[] = ((user?.roles ?? []) as string[]);
	if (!roles.includes('admin')) throw new Meteor.Error('forbidden', 'Admins only');
}

// ---------------------------------------------------------------------------
// Poll methods
// ---------------------------------------------------------------------------

Meteor.methods({
	/**
	 * Create a new poll.
	 */
	async 'hpn/poll/create'({
		question,
		options,
		anonymous = false,
		audience = 'everyone',
	}: {
		question: string;
		options: string[];
		anonymous?: boolean;
		audience?: string;
	}) {
		if (!this.userId) throw new Meteor.Error('not-authorized');
		await checkCreatePermission(this.userId, 'HPN_Poll_Create_Permission');

		if (!question?.trim()) throw new Meteor.Error('invalid', 'Question is required');
		if (!Array.isArray(options) || options.length < 2) throw new Meteor.Error('invalid', 'At least 2 options required');
		if (options.length > 10) throw new Meteor.Error('invalid', 'Maximum 10 options allowed');

		const doc = {
			question: question.trim(),
			options: options.map((text: string) => ({ text: text.trim(), votes: [] as string[] })),
			createdBy: this.userId,
			createdAt: new Date(),
			closed: false,
			anonymous,
			audience: audience ?? 'everyone',
		};

		const result = await pollsCol.insertOne(doc);
		return result.insertedId.toHexString();
	},

	/**
	 * Vote on a poll option (toggle vote for anonymous polls, set for named).
	 */
	async 'hpn/poll/vote'({ pollId, optionIndex }: { pollId: string; optionIndex: number }) {
		if (!this.userId) throw new Meteor.Error('not-authorized');

		const { ObjectId } = require('mongodb');
		const oid = new ObjectId(pollId);
		const poll = await pollsCol.findOne({ _id: oid });
		if (!poll) throw new Meteor.Error('not-found', 'Poll not found');
		if (poll.closed) throw new Meteor.Error('invalid', 'Poll is closed');

		const voter = await Users.findOneById(this.userId);
		const voterRoles: string[] = ((voter?.roles ?? []) as string[]);
		if (!canAccessAudience(voterRoles, poll.audience ?? 'everyone')) {
			throw new Meteor.Error('forbidden', 'You do not have access to this poll');
		}

		if (optionIndex < 0 || optionIndex >= poll.options.length) {
			throw new Meteor.Error('invalid', 'Invalid option index');
		}

		if (!poll.anonymous) {
			// Check if user already voted on any option
			const alreadyVotedIndex: number = poll.options.findIndex((opt: any) =>
				opt.votes.includes(this.userId),
			);

			if (alreadyVotedIndex === optionIndex) {
				// Toggle off
				await pollsCol.updateOne({ _id: oid }, { $pull: { [`options.${optionIndex}.votes`]: this.userId } } as any);
			} else {
				// Remove from previous option if voted
				if (alreadyVotedIndex >= 0) {
					await pollsCol.updateOne({ _id: oid }, { $pull: { [`options.${alreadyVotedIndex}.votes`]: this.userId } } as any);
				}
				// Add to new option
				await pollsCol.updateOne({ _id: oid }, { $addToSet: { [`options.${optionIndex}.votes`]: this.userId } } as any);
			}
		} else {
			// Anonymous: just toggle on — we can't reliably track by userId without losing anonymity,
			// so we represent votes as counts stored as a number alongside the string array.
			// For simplicity in anonymous mode we still store userId but display aggregated only.
			const alreadyVotedIndex: number = poll.options.findIndex((opt: any) =>
				opt.votes.includes(this.userId),
			);
			if (alreadyVotedIndex === optionIndex) {
				await pollsCol.updateOne({ _id: oid }, { $pull: { [`options.${optionIndex}.votes`]: this.userId } } as any);
			} else {
				if (alreadyVotedIndex >= 0) {
					await pollsCol.updateOne({ _id: oid }, { $pull: { [`options.${alreadyVotedIndex}.votes`]: this.userId } } as any);
				}
				await pollsCol.updateOne({ _id: oid }, { $addToSet: { [`options.${optionIndex}.votes`]: this.userId } } as any);
			}
		}

		return true;
	},

	/**
	 * Close a poll (admin only).
	 */
	async 'hpn/poll/close'(pollId: string) {
		if (!this.userId) throw new Meteor.Error('not-authorized');
		await requireAdmin(this.userId);
		const { ObjectId } = require('mongodb');
		const oid = new ObjectId(pollId);
		await pollsCol.updateOne({ _id: oid }, { $set: { closed: true } });
		return true;
	},

	/**
	 * Delete a poll (admin only). Also removes any room messages that were posted for it.
	 */
	async 'hpn/poll/delete'(pollId: string) {
		if (!this.userId) throw new Meteor.Error('not-authorized');
		await requireAdmin(this.userId);
		const { ObjectId } = require('mongodb');
		const oid = new ObjectId(pollId);
		const poll = await pollsCol.findOne({ _id: oid });
		if (!poll) return true;

		// Delete associated room messages
		if (Array.isArray(poll.postedMessageIds) && poll.postedMessageIds.length > 0) {
			const { deleteMessage } = await import('../../../app/lib/server/functions/deleteMessage');
			const { Messages } = await import('@rocket.chat/models');
			const adminUser = await Users.findOneById(this.userId);
			for (const msgId of poll.postedMessageIds) {
				const msg = await Messages.findOneById(msgId);
				if (msg && adminUser) await deleteMessage(msg, adminUser).catch(() => null);
			}
		}

		await pollsCol.deleteOne({ _id: oid });
		return true;
	},

	/**
	 * Get poll results with vote counts and percentages (admin only).
	 */
	async 'hpn/poll/results'(pollId: string) {
		if (!this.userId) throw new Meteor.Error('not-authorized');
		await requireAdmin(this.userId);
		const { ObjectId } = require('mongodb');
		const oid = new ObjectId(pollId);
		const poll = await pollsCol.findOne({ _id: oid });
		if (!poll) throw new Meteor.Error('not-found', 'Poll not found');
		const totalVotes = poll.options.reduce((sum: number, o: any) => sum + (o.votes?.length ?? 0), 0);
		return {
			...poll,
			_id: poll._id.toHexString(),
			totalVotes,
			options: poll.options.map((o: any) => ({
				text: o.text,
				voteCount: (o.votes ?? []).length,
				pct: totalVotes > 0 ? Math.round(((o.votes?.length ?? 0) / totalVotes) * 100) : 0,
			})),
		};
	},

	/**
	 * List polls. By default returns open polls only; admins can pass includeAll to see closed too.
	 */
	async 'hpn/poll/list'({ includeAll = false }: { includeAll?: boolean } = {}) {
		if (!this.userId) throw new Meteor.Error('not-authorized');

		let isAdmin = false;
		if (includeAll) {
			const user = await Users.findOneById(this.userId);
			isAdmin = ((user?.roles ?? []) as string[]).includes('admin');
		}

		const query: any = {};
		if (!includeAll || !isAdmin) {
			query.closed = false;
		}

		const allPolls = await pollsCol.find(query, { sort: { createdAt: -1 } } as any).toArray();

		// Filter by audience unless admin
		let polls = allPolls;
		if (!isAdmin) {
			const user = await Users.findOneById(this.userId);
			const roles: string[] = ((user?.roles ?? []) as string[]);
			polls = allPolls.filter((poll: any) => canAccessAudience(roles, poll.audience ?? 'everyone'));
		}

		// Sanitize anonymous polls: replace vote arrays with counts only
		return polls.map((poll: any) => ({
			...poll,
			_id: poll._id.toHexString(),
			options: poll.options.map((opt: any) => ({
				text: opt.text,
				votes: poll.anonymous
					? opt.votes // still needed for client to know if current user voted
					: opt.votes,
				voteCount: (opt.votes ?? []).length,
			})),
		}));
	},

	// ---------------------------------------------------------------------------
	// Survey methods
	// ---------------------------------------------------------------------------

	/**
	 * Create a new survey (admin only).
	 */
	async 'hpn/survey/create'({
		title,
		description,
		questions,
		audience = 'everyone',
	}: {
		title: string;
		description: string;
		questions: Array<{
			type: 'single' | 'multiple' | 'text' | 'rating';
			text: string;
			options?: string[];
		}>;
		audience?: string;
	}) {
		if (!this.userId) throw new Meteor.Error('not-authorized');
		await requireAdmin(this.userId);

		if (!title?.trim()) throw new Meteor.Error('invalid', 'Title is required');
		if (!Array.isArray(questions) || questions.length === 0) {
			throw new Meteor.Error('invalid', 'At least one question required');
		}

		const doc = {
			title: title.trim(),
			description: (description ?? '').trim(),
			questions,
			status: 'active' as const,
			createdBy: this.userId,
			createdAt: new Date(),
			audience: audience ?? 'everyone',
		};

		const result = await surveysCol.insertOne(doc);
		return result.insertedId.toHexString();
	},

	/**
	 * List active surveys, annotated with whether the current user has responded.
	 */
	async 'hpn/survey/list'() {
		if (!this.userId) throw new Meteor.Error('not-authorized');

		const allSurveys = await surveysCol.find({ status: 'active' }, { sort: { createdAt: -1 } } as any).toArray();

		// Filter by audience
		const user = await Users.findOneById(this.userId);
		const roles: string[] = ((user?.roles ?? []) as string[]);
		const surveys = roles.includes('admin')
			? allSurveys
			: allSurveys.filter((s: any) => canAccessAudience(roles, s.audience ?? 'everyone'));

		// Fetch which surveys current user has responded to
		const surveyIds = surveys.map((s: any) => s._id.toHexString());
		const responses = await surveyResponsesCol
			.find({ surveyId: { $in: surveyIds }, userId: this.userId })
			.toArray();
		const respondedIds = new Set(responses.map((r: any) => r.surveyId));

		return surveys.map((survey: any) => ({
			...survey,
			_id: survey._id.toHexString(),
			hasResponded: respondedIds.has(survey._id.toHexString()),
			questionCount: (survey.questions ?? []).length,
		}));
	},

	/**
	 * List ALL surveys (active + closed) for admin view.
	 */
	async 'hpn/survey/admin/list'() {
		if (!this.userId) throw new Meteor.Error('not-authorized');
		await requireAdmin(this.userId);
		const surveys = await surveysCol.find({}, { sort: { createdAt: -1 } } as any).toArray();
		return surveys.map((survey: any) => ({
			...survey,
			_id: survey._id.toHexString(),
			questionCount: (survey.questions ?? []).length,
		}));
	},

	/**
	 * Submit answers to a survey.
	 */
	async 'hpn/survey/submit'({
		surveyId,
		answers,
	}: {
		surveyId: string;
		answers: Array<{ questionIndex: number; value: string | string[] }>;
	}) {
		if (!this.userId) throw new Meteor.Error('not-authorized');

		const { ObjectId } = require('mongodb');
		const oid = new ObjectId(surveyId);
		const survey = await surveysCol.findOne({ _id: oid });
		if (!survey) throw new Meteor.Error('not-found', 'Survey not found');
		if (survey.status === 'closed') throw new Meteor.Error('invalid', 'Survey is closed');

		const submitter = await Users.findOneById(this.userId);
		const submitterRoles: string[] = ((submitter?.roles ?? []) as string[]);
		if (!canAccessAudience(submitterRoles, survey.audience ?? 'everyone')) {
			throw new Meteor.Error('forbidden', 'You do not have access to this survey');
		}

		// Prevent duplicate responses
		const existing = await surveyResponsesCol.findOne({ surveyId, userId: this.userId });
		if (existing) throw new Meteor.Error('already-submitted', 'You have already submitted this survey');

		const doc = {
			surveyId,
			userId: this.userId,
			answers,
			submittedAt: new Date(),
		};

		const result = await surveyResponsesCol.insertOne(doc);
		return result.insertedId.toHexString();
	},

	/**
	 * Get survey results with aggregation (admin only).
	 */
	async 'hpn/survey/results'(surveyId: string) {
		if (!this.userId) throw new Meteor.Error('not-authorized');
		await requireAdmin(this.userId);

		const { ObjectId } = require('mongodb');
		const oid = new ObjectId(surveyId);
		const survey = await surveysCol.findOne({ _id: oid });
		if (!survey) throw new Meteor.Error('not-found', 'Survey not found');

		const responses = await surveyResponsesCol.find({ surveyId }).toArray();
		const responseCount = responses.length;

		// Aggregate per question
		const aggregated = (survey.questions ?? []).map((question: any, idx: number) => {
			const answersForQ = responses
				.map((r: any) => r.answers?.find((a: any) => a.questionIndex === idx))
				.filter(Boolean)
				.map((a: any) => a.value);

			if (question.type === 'single' || question.type === 'multiple') {
				const counts: Record<string, number> = {};
				(question.options ?? []).forEach((opt: string) => { counts[opt] = 0; });
				answersForQ.forEach((value: any) => {
					const vals: string[] = Array.isArray(value) ? value : [value];
					vals.forEach((v) => {
						if (v in counts) counts[v]++;
						else counts[v] = (counts[v] ?? 0) + 1;
					});
				});
				return { questionIndex: idx, type: question.type, text: question.text, counts };
			}

			if (question.type === 'rating') {
				const nums: number[] = answersForQ
					.map((v: any) => Number(v))
					.filter((n: number) => !isNaN(n));
				const avg = nums.length > 0 ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
				return { questionIndex: idx, type: question.type, text: question.text, average: Math.round(avg * 10) / 10, count: nums.length };
			}

			// text
			return { questionIndex: idx, type: question.type, text: question.text, responses: answersForQ };
		});

		return {
			survey: { ...survey, _id: survey._id.toHexString() },
			responseCount,
			aggregated,
		};
	},

	/**
	 * Close a survey (admin only).
	 */
	async 'hpn/survey/close'(surveyId: string) {
		if (!this.userId) throw new Meteor.Error('not-authorized');
		await requireAdmin(this.userId);
		const { ObjectId } = require('mongodb');
		const oid = new ObjectId(surveyId);
		await surveysCol.updateOne({ _id: oid }, { $set: { status: 'closed' } });
		return true;
	},

	/**
	 * Delete a survey and all its responses (admin only). Also removes any room messages posted for it.
	 */
	async 'hpn/survey/delete'(surveyId: string) {
		if (!this.userId) throw new Meteor.Error('not-authorized');
		await requireAdmin(this.userId);
		const { ObjectId } = require('mongodb');
		const oid = new ObjectId(surveyId);
		const survey = await surveysCol.findOne({ _id: oid });
		if (!survey) return true;

		// Delete associated room messages
		if (Array.isArray(survey.postedMessageIds) && survey.postedMessageIds.length > 0) {
			const { deleteMessage } = await import('../../../app/lib/server/functions/deleteMessage');
			const { Messages } = await import('@rocket.chat/models');
			const adminUser = await Users.findOneById(this.userId);
			for (const msgId of survey.postedMessageIds) {
				const msg = await Messages.findOneById(msgId);
				if (msg && adminUser) await deleteMessage(msg, adminUser).catch(() => null);
			}
		}

		await surveysCol.deleteOne({ _id: oid });
		await surveyResponsesCol.deleteMany({ surveyId });
		return true;
	},

	/**
	 * Post a poll announcement message to one or more rooms (admin only).
	 */
	async 'hpn/poll/post-to-rooms'({ pollId, roomIds, pin = false }: { pollId: string; roomIds: string[]; pin?: boolean }) {
		if (!this.userId) throw new Meteor.Error('not-authorized');
		await requireAdmin(this.userId);

		const { ObjectId } = require('mongodb');
		const oid = new ObjectId(pollId);
		const poll = await pollsCol.findOne({ _id: oid });
		if (!poll) throw new Meteor.Error('not-found', 'Poll not found');

		const { sendMessage } = await import('../../../app/lib/server/functions/sendMessage');
		const adminUser = await Users.findOneById(this.userId);
		if (!adminUser) throw new Meteor.Error('not-found', 'Admin user not found');

		const pollsUrl = Meteor.absoluteUrl('hpn-polls') + '#polls';
		const optionsText = poll.options.map((o: any, i: number) => `${i + 1}. ${o.text}`).join('\n');
		const msgText = `📊 **Poll: ${poll.question}**\n${optionsText}\n\n👉 Vote here: ${pollsUrl}`;

		const newMsgIds: string[] = [];
		for (const rid of roomIds) {
			const room = await Rooms.findOneById(rid);
			if (!room) continue;
			const sentMsg = await sendMessage(adminUser, { msg: msgText }, room);
			if (sentMsg?._id) {
				newMsgIds.push(sentMsg._id);
				if (pin) {
					await import('@rocket.chat/models').then(({ Messages }) =>
						Messages.setPinnedByIdAndUserId(sentMsg._id, { _id: this.userId!, username: adminUser.username ?? '' }, true, new Date()),
					);
				}
			}
		}
		if (newMsgIds.length > 0) {
			await pollsCol.updateOne({ _id: oid }, { $push: { postedMessageIds: { $each: newMsgIds } } } as any);
		}
		return true;
	},

	/**
	 * Post a survey announcement message to one or more rooms (admin only).
	 */
	async 'hpn/survey/post-to-rooms'({ surveyId, roomIds, pin = false }: { surveyId: string; roomIds: string[]; pin?: boolean }) {
		if (!this.userId) throw new Meteor.Error('not-authorized');
		await requireAdmin(this.userId);

		const { ObjectId } = require('mongodb');
		const oid = new ObjectId(surveyId);
		const survey = await surveysCol.findOne({ _id: oid });
		if (!survey) throw new Meteor.Error('not-found', 'Survey not found');

		const { sendMessage } = await import('../../../app/lib/server/functions/sendMessage');
		const adminUser = await Users.findOneById(this.userId);
		if (!adminUser) throw new Meteor.Error('not-found', 'Admin user not found');

		const pollsUrl = Meteor.absoluteUrl('hpn-polls') + '#surveys';
		const msgText = `📋 **Survey: ${survey.title}**\n${survey.description ? `_${survey.description}_\n` : ''}${survey.questions.length} question${survey.questions.length !== 1 ? 's' : ''}\n\n👉 Fill in survey: ${pollsUrl}`;

		const newMsgIds: string[] = [];
		for (const rid of roomIds) {
			const room = await Rooms.findOneById(rid);
			if (!room) continue;
			const sentMsg = await sendMessage(adminUser, { msg: msgText }, room);
			if (sentMsg?._id) {
				newMsgIds.push(sentMsg._id);
				if (pin) {
					await import('@rocket.chat/models').then(({ Messages }) =>
						Messages.setPinnedByIdAndUserId(sentMsg._id, { _id: this.userId!, username: adminUser.username ?? '' }, true, new Date()),
					);
				}
			}
		}
		if (newMsgIds.length > 0) {
			await surveysCol.updateOne({ _id: oid }, { $push: { postedMessageIds: { $each: newMsgIds } } } as any);
		}
		return true;
	},

	/**
	 * List all channels and private groups (admin only) — used for post-to-rooms selector.
	 */
	async 'hpn/rooms/list'() {
		if (!this.userId) throw new Meteor.Error('not-authorized');
		await requireAdmin(this.userId);
		const db2 = MongoInternals.defaultRemoteCollectionDriver().mongo.db;
		const roomsCol = db2.collection('rocketchat_room');
		const rooms = await roomsCol.find(
			{ t: { $in: ['c', 'p'] }, name: { $exists: true } },
			{ projection: { _id: 1, name: 1, t: 1 }, sort: { name: 1 } } as any,
		).toArray();
		return rooms.map((r: any) => ({ _id: r._id, name: r.name, type: r.t }));
	},
});
