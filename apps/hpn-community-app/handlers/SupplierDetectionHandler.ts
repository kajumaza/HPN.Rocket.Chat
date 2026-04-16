import type { IHttp, IModify, IPersistence, IRead } from '@rocket.chat/apps-engine/definition/accessors';
import type { IMessage } from '@rocket.chat/apps-engine/definition/messages';

import { DirectoryService } from '../services/DirectoryService';

/**
 * Keywords that indicate someone is ASKING for a supplier/service recommendation.
 * When detected, the bot responds with top 3 from the directory.
 */
const SUPPLIER_REQUEST_PATTERNS = [
	// Explicit supplier/service noun
	/\b(looking for|need|seeking|recommend|who (does|provides|offers|can)|anyone know|any (good |decent |reliable )?)(a |an |some )?(supplier|vendor|provider|service|company|consultant|agency|firm|contractor)\b/i,
	// Can/does anyone help
	/\b(can anyone|does anyone|who can)\s+(help|assist|provide|offer|do)\b/i,
	// Where to find
	/\bwhere (can i|do i|should i)\s+(find|get|source)\b/i,
	// "looking for help/someone/anyone/assistance"
	/\b(looking for|need|seeking)\s+(help|someone|anyone|assistance|support|a person)\b/i,
	// "help with X" or "help on X"
	/\bhelp\s+(with|for|on)\s+\w/i,
	// "anyone that/who can"
	/\banyone (that|who) can\b/i,
	// Standalone recommend/suggest
	/\b(recommend|suggest|recommendation|suggestion)\b/i,
];

/**
 * Keywords that indicate someone is GIVING an unsolicited supplier recommendation.
 * These messages are removed to keep recommendations automated and unbiased.
 */
const SUPPLIER_RECOMMENDATION_PATTERNS = [
	/\b(i recommend|you should (try|use|contact|go with)|we use|we've used|great (supplier|vendor|company|service|provider))\b/i,
	// "try/check out/go with <name>" — allows lowercase, multi-word names (up to ~5 words), ending with punctuation or EOL
	/\b(try|contact|check out|look at|go with)\s+[A-Za-z].{1,50}(,|\.|!|\?|\n|$)/i,
	/\bhttps?:\/\/[^\s]+\s*(they|their|great|excellent|good|best|recommend)/i,
];

/** Rooms where supplier moderation is active */
const MODERATED_ROOMS = ['hpn-general', 'hpn-students', 'hpn-managers', 'hpn-executives'];

export class SupplierDetectionHandler {
	/**
	 * Returns true if this message should be intercepted (checked for supplier content).
	 * Only runs in HPN discussion rooms.
	 */
	static async shouldPrevent(message: IMessage, read: IRead): Promise<boolean> {
		if (!message.text || !message.room) return false;
		const roomName = message.room.slugifiedName || (message.room as any).name;
		return MODERATED_ROOMS.includes(roomName);
	}

	/**
	 * Handle supplier-related messages.
	 * - If it's a REQUEST: reply with top 3 suppliers from directory.
	 * - If it's an UNSOLICITED RECOMMENDATION: remove the message and send guidance.
	 * Returns true to BLOCK the original message, false to allow it through.
	 */
	static async execute(
		message: IMessage,
		read: IRead,
		http: IHttp,
		persistence: IPersistence,
		modify: IModify,
		logger: any,
	): Promise<boolean> {
		const text = message.text || '';

		const isRequest = SUPPLIER_REQUEST_PATTERNS.some((p) => p.test(text));
		const isUnsolicited = SUPPLIER_RECOMMENDATION_PATTERNS.some((p) => p.test(text));

		if (isRequest) {
			// Allow the message through, then reply with top 3 suppliers
			await this.sendDirectoryReply(message, read, modify);
			return false; // Don't block the original request
		}

		if (isUnsolicited) {
			// Block the unsolicited recommendation and guide the user
			await this.sendModerationNotice(message, read, modify);
			logger.debug(`[HPN Bot] Blocked unsolicited supplier recommendation from ${message.sender?.username}`);
			return true; // Block the message
		}

		return false;
	}

	private static detectCategory(text: string): string | null {
		const lower = text.toLowerCase();
		// Map common keywords to directory category slugs
		const categoryKeywords: Array<{ keywords: string[]; category: string }> = [
			{ keywords: ['ai', 'artificial intelligence', 'machine learning', 'automation', 'chatbot'], category: 'ai-automation' },
			{ keywords: ['hr', 'human resource', 'payroll', 'recruitment', 'talent'], category: 'hr' },
			{ keywords: ['saas', 'software', 'platform', 'app', 'tool', 'system'], category: 'saas' },
			{ keywords: ['legal', 'law', 'compliance', 'contract', 'attorney', 'lawyer'], category: 'legal' },
			{ keywords: ['labour', 'labor', 'ir ', 'industrial relation', 'union', 'bargaining'], category: 'labour law' },
			{ keywords: ['account', 'finance', 'tax', 'audit', 'bookkeep'], category: 'accounting' },
			{ keywords: ['market', 'brand', 'seo', 'social media', 'digital'], category: 'marketing' },
		];
		for (const { keywords, category } of categoryKeywords) {
			if (keywords.some((kw) => lower.includes(kw))) return category;
		}
		return null;
	}

	private static async sendDirectoryReply(message: IMessage, read: IRead, modify: IModify): Promise<void> {
		const detectedCategory = this.detectCategory(message.text || '');
		const listings = await DirectoryService.getTopListings(read, detectedCategory, 3);

		const notif = modify.getNotifier();
		let text: string;

		if (listings.length === 0) {
			text =
				'👋 It looks like you\'re looking for a supplier! Check the **#hpn-business-directory** channel for our vetted provider list. Use `/directory` to search by category.';
		} else {
			const listText = listings
				.map((l, i) => `**${i + 1}. ${l.name}** _(${l.category})_\n${l.description} — ${l.contact}`)
				.join('\n\n');

			text = `👋 Looking for a supplier? Here are our **top-rated providers** from the HPN Directory:\n\n${listText}\n\nFor more, use \`/directory [category]\` or visit **#hpn-business-directory**.`;
		}

		if (message.sender) {
			await notif.notifyUser(message.sender, {
				text,
				room: message.room,
				sender: message.sender,
			} as any);
		}
	}

	private static async sendModerationNotice(message: IMessage, read: IRead, modify: IModify): Promise<void> {
		const notif = modify.getNotifier();

		const text =
			'⚠️ **HPN Moderation Notice:** Supplier recommendations in community rooms are managed by the HPN Directory to ensure impartiality.\n\n' +
			'Your message has been removed. If you\'d like to recommend a supplier, please suggest they register at **#hpn-business-directory**.\n\n' +
			'Use `/directory` to see our ranked supplier list.';

		if (message.sender) {
			await notif.notifyUser(message.sender, {
				text,
				room: message.room,
				sender: message.sender,
			} as any);
		}
	}
}
