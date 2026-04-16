import { randomUUID } from 'crypto';

import type { IMessage } from '@rocket.chat/core-typings';
import { MongoInternals } from 'meteor/mongo';

import { getListingsCol } from './directory';

// ── Keywords collection ───────────────────────────────────────────────────────

const getKeywordsCol = () => MongoInternals.defaultRemoteCollectionDriver().mongo.db.collection('hpn_bot_keywords');

// In-memory set for O(1) gate checks — loaded at startup, refreshed on change
let dynamicKeywords: Set<string> = new Set();

export async function refreshDynamicKeywords(): Promise<void> {
	try {
		const col = getKeywordsCol();
		// Ensure index exists — safe to call repeatedly, MongoDB is a no-op if already exists
		await col.createIndex({ keyword: 1 }, { unique: true } as any);
		const docs = await col.find({}).toArray();
		dynamicKeywords = new Set(docs.map((d: any) => d.keyword as string));
		console.log(`[HPN Bot] Dynamic keywords refreshed — ${dynamicKeywords.size} terms`);
	} catch (err) {
		console.error('[HPN Bot] Failed to refresh dynamic keywords:', err);
	}
}

const STOP_WORDS = new Set([
	'and', 'the', 'for', 'with', 'from', 'that', 'this', 'have', 'been', 'will',
	'your', 'more', 'also', 'into', 'than', 'them', 'they', 'some', 'when', 'well',
	'were', 'what', 'which', 'able', 'about', 'after', 'just', 'like', 'make',
	'most', 'over', 'such', 'very', 'management', 'services', 'business', 'company',
	'solutions', 'based', 'using', 'include', 'provides', 'provide', 'through',
	// Short stop words (now that min length is 3)
	'our', 'are', 'has', 'its', 'via', 'can', 'all', 'not', 'but', 'how', 'who',
	'you', 'we', 'at', 'in', 'on', 'to', 'of', 'by', 'an', 'or', 'as', 'so',
]);

export async function extractAndSaveKeywords(listing: any): Promise<void> {
	try {
		const col = getKeywordsCol();

		const sources: string[] = [
			...(Array.isArray(listing.categories) ? listing.categories : []),
			...(Array.isArray(listing.services) ? listing.services : []),
			...(listing.briefDescription ? [listing.briefDescription] : []),
		];

		const tokens = new Set<string>();
		for (const source of sources) {
			const parts = String(source).toLowerCase().split(/[\s\-_,.;:\/\\()\[\]{}!?&@#%*+=<>]+/);
			for (const part of parts) {
				if (part.length >= 3 && !STOP_WORDS.has(part) && /^[a-z]/.test(part)) {
					tokens.add(part);
				}
			}
		}

		for (const keyword of tokens) {
			await col.updateOne(
				{ keyword },
				{ $setOnInsert: { _id: randomUUID(), keyword, source: 'auto', addedAt: new Date(), listingId: listing._id } },
				{ upsert: true },
			);
		}

		console.log(`[HPN Bot] Extracted ${tokens.size} keywords from listing "${listing.businessName}"`);
	} catch (err) {
		console.error('[HPN Bot] Failed to extract keywords:', err);
	}
}

export { getKeywordsCol };

/**
 * Extracts keywords from all existing approved listings.
 * Safe to call on every startup — uses upsert so it never creates duplicates.
 * Handles listings approved before the dynamic keyword gate was added.
 */
export async function backfillKeywordsFromListings(): Promise<void> {
	try {
		const listings = await getListingsCol().find({ status: 'approved' }).toArray();
		if (listings.length === 0) return;
		for (const listing of listings) {
			await extractAndSaveKeywords(listing);
		}
		console.log(`[HPN Bot] Keyword backfill complete — processed ${listings.length} approved listings`);
	} catch (err) {
		console.error('[HPN Bot] Keyword backfill failed:', err);
	}
}

// ── Keyword gate ─────────────────────────────────────────────────────────────

// Broad keyword gate — any match sends the message to Claude for context-based judgement.
// Claude decides if it's a supplier request (respond with recommendations) or not.
const SUPPLIER_KEYWORDS =
	/\b(company|companies|business|businesses|service|services|provider|providers|vendor|vendors|supplier|suppliers|contractor|contractors|consultant|consultants|agency|agencies|firm|firms|help|assistance|support|advice|recommend|recommendation|suggestion|looking|need|seeking|require|want|buy|purchase|hire|outsource|find|source|marketing|advertising|seo|branding|digital|pr|saas|software|platform|tool|app|system|automation|ai|technology|tech|hr|payroll|recruitment|talent|training|learning|onboarding|employee|workforce|legal|compliance|contract|attorney|lawyer|popia|accounting|finance|tax|audit|bookkeeping|labour|labor|union|logistics|operations|erp|crm|lms)\b/i;

// Keywords that suggest someone is pushing an unsolicited recommendation
const UNSOLICITED_KEYWORDS =
	/\b(i recommend|try them|try us|contact them|check them out|we use|we've used|i use|best (company|service|vendor|provider|firm)|great (service|company|vendor|provider)|highly recommend)\b/i;

const MODERATED_ROOMS = ['hpn-general', 'hpn-students', 'hpn-managers', 'hpn-executives'];

// ── Thread recommendation context ─────────────────────────────────────────────

// Keyed by the original user message._id that triggered the bot recommendation.
// Stores the bot's response text so thread replies can be checked against it.
const botRecommendationContext = new Map<string, { botResponse: string; timestamp: number }>();

// Cleanup entries older than 24 hours — runs every hour
const _cleanupInterval = setInterval(() => {
	const cutoff = Date.now() - 24 * 60 * 60 * 1000;
	for (const [key, val] of botRecommendationContext) {
		if (val.timestamp < cutoff) botRecommendationContext.delete(key);
	}
}, 60 * 60 * 1000);
(_cleanupInterval as any).unref?.();

export function registerBotRecommendation(messageId: string, botResponse: string): void {
	botRecommendationContext.set(messageId, { botResponse, timestamp: Date.now() });
}

const THREAD_MODERATION_PROMPT =
	'You are a content moderator for the HPN supplier recommendation bot.\n\n' +
	'The bot has already recommended specific businesses to a community member.\n' +
	'A different community member then posted a reply in the same thread.\n\n' +
	'Your task: determine if this reply is promoting or recommending a specific business, ' +
	'person, or service that is NOT mentioned in the bot\'s recommendations.\n\n' +
	'Reply with exactly one word:\n' +
	'BLOCK — the reply recommends or promotes a business/service/person not in the bot\'s list\n' +
	'ALLOW — the reply references the bot\'s recommendations, asks a question, says thanks, or is general discussion';

export async function checkThreadReply(
	tmid: string,
	replyText: string,
	roomId: string,
	replyTs: Date,
): Promise<'block' | 'allow' | 'skip'> {
	const apiKey = process.env.CLAUDE_API_KEY;
	if (!apiKey) { console.log('[HPN Bot] Thread check: no API key'); return 'skip'; }

	// Fast path: in-memory Map (populated when bot posts a recommendation)
	let botResponse = botRecommendationContext.get(tmid)?.botResponse;
	console.log(`[HPN Bot] Thread check: tmid=${tmid} inMap=${!!botResponse} roomId=${roomId}`);

	if (!botResponse) {
		// Fallback: look up from MongoDB — works after restarts and for pre-deployment threads
		try {
			const db = MongoInternals.defaultRemoteCollectionDriver().mongo.db;

			// Confirm the thread root is a supplier request
			const rootMsg = await db.collection('rocketchat_message').findOne({ _id: tmid });
			console.log(`[HPN Bot] Thread root: "${(rootMsg as any)?.msg?.slice(0, 60)}" isSupplier=${isSupplierRequest((rootMsg as any)?.msg || '')}`);
			if (!rootMsg || !isSupplierRequest((rootMsg as any).msg || '')) return 'skip';

			// Find the most recent bot message in this room (use find+sort+limit for reliability)
			const botMsg = await db.collection('rocketchat_message')
				.find({ rid: roomId, 'u.username': 'hpn.assistant' })
				.sort({ ts: -1 })
				.limit(1)
				.next();
			console.log(`[HPN Bot] Bot msg found: ${!!botMsg} msg="${(botMsg as any)?.msg?.slice(0, 60)}"`);
			if (!(botMsg as any)?.msg) return 'skip';

			botResponse = (botMsg as any).msg;
		} catch (err) {
			console.error('[HPN Bot] Thread moderation DB lookup error:', err);
			return 'skip';
		}
	}

	try {
		const { httpCall } = await import('../http/call');
		const response = await httpCall('POST', 'https://api.anthropic.com/v1/messages', {
			headers: {
				'x-api-key': apiKey,
				'anthropic-version': '2023-06-01',
				'content-type': 'application/json',
			},
			data: {
				model: 'claude-haiku-4-5-20251001',
				max_tokens: 5,
				system: THREAD_MODERATION_PROMPT,
				messages: [{
					role: 'user',
					content: `Bot recommendations:\n"${botResponse}"\n\nReply to moderate:\n"${replyText}"`,
				}],
			},
		} as any);
		const label = ((response as any)?.data?.content?.[0]?.text || '').trim().toUpperCase();
		console.log(`[HPN Bot] Thread moderation: "${label}" for: "${replyText.slice(0, 60)}"`);
		return label === 'BLOCK' ? 'block' : 'allow';
	} catch (err) {
		console.error('[HPN Bot] Thread moderation error:', err);
		return 'skip';
	}
}

export function isSupplierRequest(text: string): boolean {
	if (SUPPLIER_KEYWORDS.test(text)) return true;
	// Layer 2: check dynamic keywords extracted from approved listings
	const words = text.toLowerCase().split(/\W+/);
	return words.some((w) => w.length >= 4 && dynamicKeywords.has(w));
}

export function isUnsolicitedRecommendation(text: string): boolean {
	return UNSOLICITED_KEYWORDS.test(text);
}

export function isModeratedRoomName(roomName: string): boolean {
	return MODERATED_ROOMS.includes(roomName);
}


// ── Directory fetch ───────────────────────────────────────────────────────────

async function getDirectoryListings(limit = 10): Promise<any[]> {
	try {
		const col = getListingsCol();
		// Fetch all approved listings — Claude handles relevance matching
		return await col.find({ status: 'approved' }).sort({ score: -1 }).limit(limit).toArray();
	} catch (err) {
		console.error('[HPN Bot] Error fetching directory listings:', err);
		return [];
	}
}

// ── Prompt 1: Intent Classifier ───────────────────────────────────────────────

const INTENT_CLASSIFIER_PROMPT =
	'You are an intent classifier for the HPN community app.\n\n' +
	'Your task is to classify the user\'s message into exactly one of these labels:\n\n' +
	'SUPPLIER_REQUEST\n' +
	'INFORMATION_DISCUSSION\n' +
	'PLATFORM_OR_CHAT\n\n' +
	'Definitions:\n\n' +
	'SUPPLIER_REQUEST\n' +
	'The user is trying to find a provider, supplier, company, consultant, agency, specialist, firm, software solution, or outside help to solve a business need.\n\n' +
	'Examples:\n' +
	'- Need help with SEO\n' +
	'- Looking for a labour lawyer\n' +
	'- Can anyone recommend someone for payroll?\n' +
	'- Who can help with HR compliance?\n' +
	'- Need support with BEE compliance\n' +
	'- Looking for training providers\n' +
	'- Need software for leave management\n' +
	'- Can someone assist with employment contracts?\n' +
	'- Struggling with recruitment and need help\n\n' +
	'INFORMATION_DISCUSSION\n' +
	'The user wants information, explanation, opinions, advice, strategy, or discussion. They are not clearly asking for a supplier.\n\n' +
	'Examples:\n' +
	'- How does SEO work?\n' +
	'- What is the best SEO strategy for a small business?\n' +
	'- Any tips for improving recruitment?\n' +
	'- How do I handle employee misconduct?\n' +
	'- What software do you use for payroll?\n' +
	'- Which CRM is better?\n' +
	'- Thoughts on outsourcing HR?\n' +
	'- Anyone else struggling with compliance?\n' +
	'- What is the difference between labour law and HR compliance?\n\n' +
	'PLATFORM_OR_CHAT\n' +
	'The message is about how to use the platform, or is general chat, greeting, banter, or opinion with no supplier need.\n\n' +
	'Examples:\n' +
	'- How do I post a CV?\n' +
	'- Where do I find the directory?\n' +
	'- How does this app work?\n' +
	'- Hello everyone\n' +
	'- Good morning\n' +
	'- Thanks\n' +
	'- I agree\n' +
	'- Anyone here from Cape Town?\n\n' +
	'Rules:\n' +
	'1. If the user is asking HOW, WHAT, WHY, or asking for TIPS / ADVICE / OPINIONS, classify as INFORMATION_DISCUSSION.\n' +
	'2. If the user is trying to find someone or something to help, do it, provide it, or solve it, classify as SUPPLIER_REQUEST.\n' +
	'3. If a short message contains a problem + service category, classify as SUPPLIER_REQUEST.\n' +
	'   Examples: Need help with SEO / Need help with payroll / Need labour law support / Struggling with marketing\n' +
	'4. Mentioning a service category alone is not enough.\n' +
	'   "SEO is difficult" = INFORMATION_DISCUSSION\n' +
	'   "Need help with SEO" = SUPPLIER_REQUEST\n' +
	'5. If uncertain, ask: "Is this person trying to learn/discuss, or find someone to help/do it?"\n' +
	'   learn/discuss = INFORMATION_DISCUSSION\n' +
	'   find someone/help/do it = SUPPLIER_REQUEST\n' +
	'6. If ambiguous but leaning toward outsourcing or external help, classify as SUPPLIER_REQUEST.\n\n' +
	'Output exactly one label only:\n' +
	'SUPPLIER_REQUEST\n' +
	'INFORMATION_DISCUSSION\n' +
	'PLATFORM_OR_CHAT';

// ── Prompt 2: Supplier Matcher ────────────────────────────────────────────────

const SUPPLIER_MATCHER_PROMPT =
	'You are the HPN Assistant — a supplier recommendation bot for a community of HR professionals in South Africa.\n\n' +
	'The user\'s message has already been classified as a supplier request.\n' +
	'Your only task is to recommend the most relevant businesses from the directory.\n\n' +
	'Evaluate every listing in this order:\n\n' +
	'1. CATEGORY\n' +
	'Does the category closely match the need?\n\n' +
	'2. DESCRIPTION\n' +
	'Does the business description clearly align with the request?\n\n' +
	'3. SERVICES\n' +
	'Do the listed services directly solve the stated need?\n\n' +
	'4. SCORE\n' +
	'Among relevant matches only, prioritise the highest-scoring listings.\n\n' +
	'Filtering rules:\n' +
	'- A listing is a match if its category, description, or services names or clearly covers what the member is asking for.\n' +
	'  Examples of a match: "SEO" in description = match for "need help with SEO". "marketing" category = match for SEO or digital marketing requests.\n' +
	'- Include a listing if it is genuinely relevant — even if it is the only one in the directory.\n' +
	'- Exclude a listing only if there is no meaningful connection between what the member needs and what the business offers.\n' +
	'- If truly no listing is relevant, respond with exactly: SILENT\n\n' +
	'Output format:\n' +
	'Return plain text only. No markdown. Maximum 3 listings.\n' +
	'For each listing use this exact format:\n' +
	'Business Name — one sentence explaining why it fits.\n' +
	'Contact: email | Link: url\n' +
	'\n' +
	'Leave a blank line between listings. Keep it concise.';

async function callIntentClassifier(userMessage: string): Promise<string> {
	const apiKey = process.env.CLAUDE_API_KEY;
	if (!apiKey) return 'SUPPLIER_REQUEST'; // no key — pass through to fallback

	try {
		const { httpCall } = await import('../http/call');
		const response = await httpCall('POST', 'https://api.anthropic.com/v1/messages', {
			headers: {
				'x-api-key': apiKey,
				'anthropic-version': '2023-06-01',
				'content-type': 'application/json',
			},
			data: {
				model: 'claude-haiku-4-5-20251001',
				max_tokens: 10,
				system: INTENT_CLASSIFIER_PROMPT,
				messages: [{ role: 'user', content: userMessage }],
			},
		} as any);

		const label = ((response as any)?.data?.content?.[0]?.text || '').trim();
		console.log(`[HPN Bot] Intent classifier: "${label}"`);
		return label;
	} catch (err) {
		console.error('[HPN Bot] Classifier error:', err);
		return 'SUPPLIER_REQUEST'; // on error, pass through
	}
}

async function callSupplierMatcher(userMessage: string, listings: any[]): Promise<string | null> {
	const apiKey = process.env.CLAUDE_API_KEY;
	if (!apiKey) return null;

	try {
		const { httpCall } = await import('../http/call');

		const rootUrl = (process.env.ROOT_URL || 'http://localhost:3000').replace(/\/$/, '');
		const listingsSummary = listings
			.map((l, i) => {
				const cats = Array.isArray(l.categories) ? l.categories.join(', ') : (l.category || '');
				const services = Array.isArray(l.services) && l.services.length ? `Services: ${l.services.join(', ')}` : '';
				const desc = l.briefDescription || l.fullDescription || l.description || '';
				const link = `${rootUrl}/hpn-directory?listing=${l._id}`;
				return `${i + 1}. ${l.businessName || l.name} | Score: ${l.score ?? 0} | Categories: ${cats} | ${desc}${services ? ` | ${services}` : ''} | Contact: ${l.contactEmail || l.contact || ''} | Link: ${link}`;
			})
			.join('\n');

		const userContent =
			`Member's message: "${userMessage}"\n\n` +
			`HPN Directory listings:\n${listingsSummary || 'No listings currently in directory.'}`;

		console.log('[HPN Bot] Sending to matcher:\n', userContent);

		const response = await httpCall('POST', 'https://api.anthropic.com/v1/messages', {
			headers: {
				'x-api-key': apiKey,
				'anthropic-version': '2023-06-01',
				'content-type': 'application/json',
			},
			data: {
				model: 'claude-haiku-4-5-20251001',
				max_tokens: 300,
				system: SUPPLIER_MATCHER_PROMPT,
				messages: [{ role: 'user', content: userContent }],
			},
		} as any);

		return (response as any)?.data?.content?.[0]?.text || null;
	} catch (err) {
		console.error('[HPN Bot] Supplier matcher error:', err);
		return null;
	}
}

// ── Send message to room ──────────────────────────────────────────────────────

async function sendBotMessage(message: IMessage, text: string): Promise<void> {
	try {
		const { Users, Rooms } = await import('@rocket.chat/models');
		const { sendMessage } = await import('../../../app/lib/server/functions/sendMessage');

		const botUser = await Users.findOneByUsername('hpn.assistant');
		const room = await Rooms.findOneById(message.rid);
		if (!botUser || !room) return;

		await sendMessage(botUser, { msg: text } as any, room);
	} catch (err) {
		console.error('[HPN Bot] Error sending bot message:', err);
	}
}

// ── Send DM moderation notice ─────────────────────────────────────────────────

async function sendModerationDm(message: IMessage): Promise<void> {
	try {
		const { Users } = await import('@rocket.chat/models');
		const { sendMessage } = await import('../../../app/lib/server/functions/sendMessage');
		const { createDirectMessage } = await import('../../../app/lib/server/functions/createDirectMessage');

		const botUser = await Users.findOneByUsername('hpn.assistant');
		const sender = message.u;
		if (!botUser || !sender?._id) return;

		const dmResult = await createDirectMessage([botUser.username, sender.username], botUser);
		if (!dmResult?.rid) return;

		const { Rooms } = await import('@rocket.chat/models');
		const dmRoom = await Rooms.findOneById(dmResult.rid);
		if (!dmRoom) return;

		const rootUrl = (process.env.ROOT_URL || 'http://localhost:3000').replace(/\/$/, '');
		const text =
			'⚠️ HPN Moderation Notice\n\n' +
			'Your message was removed because supplier recommendations in community rooms are managed centrally to ensure impartiality.\n\n' +
			`If you would like to recommend a supplier, please suggest they register at: ${rootUrl}/hpn-directory\n\n` +
			'Use /directory to see our ranked supplier list.';

		await sendMessage(botUser, { msg: text }, dmRoom);
	} catch (err) {
		console.error('[HPN Bot] Error sending moderation DM:', err);
	}
}

// ── Fallback plain-text response (no Claude API key) ─────────────────────────

function buildFallbackResponse(listings: any[]): string {
	const rootUrl = (process.env.ROOT_URL || 'http://localhost:3000').replace(/\/$/, '');
	const dirUrl = `${rootUrl}/hpn-directory`;
	if (listings.length === 0) {
		return `👋 Looking for a supplier? Browse our vetted provider list: ${dirUrl}`;
	}
	const listText = listings
		.slice(0, 3)
		.map((l, i) => {
			const cats = Array.isArray(l.categories) ? l.categories.join(', ') : (l.category || '');
			return `${i + 1}. ${l.businessName || l.name} (${cats}) — ${l.contactEmail || l.contact || ''}\n   ${rootUrl}/hpn-directory?listing=${l._id}`;
		})
		.join('\n');
	return `👋 Looking for a supplier? Here are some top-rated providers from the HPN Directory:\n\n${listText}\n\nFor more options browse the business directory: ${dirUrl}`;
}

// ── Main handler ──────────────────────────────────────────────────────────────

/**
 * Called from engagementCallbacks afterSaveMessage.
 * Handles supplier requests (responds with recommendations) after the message is saved.
 */
export async function handleSupplierRequest(message: IMessage, roomName = 'unknown'): Promise<void> {
	const text = (message as any).msg || '';

	// Stage 1: Intent classifier
	const intent = await callIntentClassifier(text);
	if (intent !== 'SUPPLIER_REQUEST') {
		console.log(`[HPN Bot] Intent = ${intent} — staying silent`);
		return;
	}

	// Stage 2: Supplier matcher
	const listings = await getDirectoryListings(10);
	console.log(`[HPN Bot] Supplier request confirmed in ${roomName} — listings: ${listings.length}`);

	const matcherResponse = await callSupplierMatcher(text, listings);

	if (matcherResponse && matcherResponse.trim() !== 'SILENT') {
		const rootUrl = (process.env.ROOT_URL || 'http://localhost:3000').replace(/\/$/, '');
		const footer = `\n\nFor more options browse the business directory: ${rootUrl}/hpn-directory`;
		const body = matcherResponse.startsWith('👋') ? matcherResponse + footer : `👋 ${matcherResponse}${footer}`;
		await sendBotMessage(message, body);
		// Register context so thread replies can be moderated against this recommendation
		registerBotRecommendation(message._id, body);
		// Log recommendation to MongoDB for analytics
		const recommendedBusinesses = listings.filter((l: any) => body.includes(l.businessName));
		const { logBotRecommendation } = await import('./insights');
		logBotRecommendation({
			query: text,
			businesses: recommendedBusinesses.map((l: any) => ({ id: l._id, name: l.businessName })),
			roomName,
			roomId: (message as any).rid ?? '',
		}).catch((err: unknown) => console.error('[HPN Bot] Error logging recommendation:', err));
		return;
	}

	// No API key or no relevant match — use plain fallback only if API key is missing
	if (!process.env.CLAUDE_API_KEY) {
		const fallback = buildFallbackResponse(listings);
		await sendBotMessage(message, fallback);
		return;
	}

	console.log('[HPN Bot] No relevant listings found — staying silent');
}

/**
 * Called from engagementCallbacks beforeSaveMessage.
 * Returns true if the message should be blocked (unsolicited recommendation).
 * Also sends a DM to the sender explaining the moderation.
 */
export async function handleUnsolicitedRecommendation(message: IMessage): Promise<boolean> {
	console.log(`[HPN Bot] Blocking unsolicited recommendation from ${message.u?.username}`);
	await sendModerationDm(message);
	return true;
}
