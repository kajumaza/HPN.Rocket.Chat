import { randomUUID } from 'crypto';

import { MongoInternals } from 'meteor/mongo';

const getDb = () => MongoInternals.defaultRemoteCollectionDriver().mongo.db;

export const getBotRecsCol = () => getDb().collection('hpn_bot_recommendations');
export const getInsightsCol = () => getDb().collection('hpn_insights');
export const getDirectoryCol = () => getDb().collection('hpn_directory_listings');

/**
 * Log a bot recommendation event to MongoDB.
 * Called from supplierBot.ts after the bot posts a response.
 */
export async function logBotRecommendation(data: {
	query: string;
	businesses: Array<{ id: string; name: string }>;
	roomName: string;
	roomId: string;
}): Promise<void> {
	try {
		await getBotRecsCol().insertOne({
			_id: randomUUID(),
			query: data.query,
			businesses: data.businesses,
			roomName: data.roomName,
			roomId: data.roomId,
			ts: new Date(),
		});
	} catch (err) {
		console.error('[HPN Insights] Error logging bot recommendation:', err);
	}
}

/**
 * Increment the view count for a directory listing.
 * Called when a listing card is expanded by a user.
 */
export async function trackDirectoryView(listingId: string): Promise<void> {
	try {
		await getDirectoryCol().updateOne(
			{ _id: listingId },
			{ $inc: { viewCount: 1 }, $set: { _updatedAt: new Date() } },
		);
	} catch (err) {
		console.error('[HPN Insights] Error tracking directory view:', err);
	}
}

/**
 * Get directory stats — all approved listings with at least 1 view.
 */
export async function getDirectoryStats(): Promise<Array<{
	id: string;
	businessName: string;
	categories: string[];
	viewCount: number;
	reviewAvg: number;
	reviewCount: number;
	score: number;
}>> {
	const listings = await getDirectoryCol()
		.find({ status: 'approved', viewCount: { $gt: 0 } }, {
			projection: { _id: 1, businessName: 1, categories: 1, viewCount: 1, reviewAvg: 1, reviewCount: 1, score: 1 },
			sort: { viewCount: -1 },
		})
		.toArray();

	return listings.map((l: any) => ({
		id: l._id,
		businessName: l.businessName,
		categories: l.categories ?? [],
		viewCount: l.viewCount ?? 0,
		reviewAvg: l.reviewAvg ?? 0,
		reviewCount: l.reviewCount ?? 0,
		score: l.score ?? 0,
	}));
}

/**
 * Get bot recommendation stats — per-business recommendation counts + recent queries.
 */
export async function getBotStats(periodDays = 30): Promise<{
	totalQueries: number;
	businessCounts: Array<{ id: string; name: string; count: number }>;
	recentQueries: Array<{ query: string; businesses: string[]; roomName: string; ts: string }>;
}> {
	const since = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000);
	const recs = await getBotRecsCol()
		.find({ ts: { $gte: since } }, { sort: { ts: -1 } })
		.toArray();

	// Count per business
	const counts: Record<string, { id: string; name: string; count: number }> = {};
	for (const rec of recs) {
		for (const biz of (rec as any).businesses ?? []) {
			if (!counts[biz.id]) counts[biz.id] = { id: biz.id, name: biz.name, count: 0 };
			counts[biz.id].count++;
		}
	}

	return {
		totalQueries: recs.length,
		businessCounts: Object.values(counts).sort((a, b) => b.count - a.count),
		recentQueries: recs.slice(0, 50).map((r: any) => ({
			query: r.query,
			businesses: (r.businesses ?? []).map((b: any) => b.name),
			roomName: r.roomName,
			ts: r.ts.toISOString(),
		})),
	};
}

/**
 * Save n8n analysis results to MongoDB.
 * Called by the /hpn/insights POST endpoint after n8n processes a batch.
 */
export async function saveInsights(data: {
	batchId: string;
	weekOf: string;
	summary: Record<string, unknown>;
	themes: unknown[];
	faqs: unknown[];
	sentiment: unknown[];
	directoryViews: unknown[];
	botRecommendations: unknown[];
	engagement: unknown[];
}): Promise<void> {
	await getInsightsCol().updateOne(
		{ batchId: data.batchId },
		{
			$set: {
				...data,
				savedAt: new Date(),
			},
		},
		{ upsert: true },
	);
	console.log(`[HPN Insights] Saved insights for batch ${data.batchId}`);
}

/**
 * Get the latest insights report.
 */
export async function getLatestInsights(): Promise<Record<string, unknown> | null> {
	const result = await getInsightsCol()
		.find({}, { sort: { savedAt: -1 }, limit: 1 })
		.next();
	return result as Record<string, unknown> | null;
}

/**
 * Get the last N insights reports (for trend views).
 */
export async function getInsightsHistory(limit = 12): Promise<Array<Record<string, unknown>>> {
	return getInsightsCol()
		.find({}, { sort: { savedAt: -1 }, limit })
		.toArray() as Promise<Array<Record<string, unknown>>>;
}
