import type { IHttp, IModify, IPersistence, IRead } from '@rocket.chat/apps-engine/definition/accessors';
import type { SlashCommandContext } from '@rocket.chat/apps-engine/definition/slashcommands';

import { DirectoryService } from '../services/DirectoryService';

/**
 * /directory [category]
 * Returns the top 3 ranked suppliers in a given category.
 * If no category is given, returns all categories.
 */
export class DirectoryCommand {
	public command = 'directory';
	public i18nDescription = 'Show the HPN business directory';
	public i18nParamsExample = '[category]';
	public providesPreview = false;

	constructor(private readonly app: any) {}

	public async executor(
		context: SlashCommandContext,
		read: IRead,
		modify: IModify,
		http: IHttp,
		persis: IPersistence,
	): Promise<void> {
		const category = context.getArguments().join(' ').trim() || null;
		const sender = context.getSender();
		const room = context.getRoom();

		const listings = await DirectoryService.getTopListings(read, category, 3);

		const messageBuilder = modify.getCreator().startMessage();
		messageBuilder.setRoom(room);
		messageBuilder.setSender(sender);

		if (listings.length === 0) {
			messageBuilder.setText(
				category
					? `No listings found in category **${category}**. Try \`/directory\` without a category to see all categories.`
					: 'The HPN business directory is currently empty. Contact an admin to add listings.',
			);
		} else {
			const header = category
				? `🏢 **HPN Business Directory — ${category}** (Top ${listings.length})\n\n`
				: `🏢 **HPN Business Directory — All Categories** (Top 3 per category)\n\n`;

			const body = listings
				.map((l, i) => {
					const stars = '⭐'.repeat(Math.round(l.score / 20));
					return `**${i + 1}. ${l.name}** ${stars}\n📋 ${l.category} | 📞 ${l.contact}\n${l.description}`;
				})
				.join('\n\n---\n\n');

			messageBuilder.setText(header + body);
		}

		await modify.getCreator().finish(messageBuilder);
	}
}
