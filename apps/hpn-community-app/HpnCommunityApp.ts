import {
	App,
} from '@rocket.chat/apps-engine/definition/App';
import type { IAppInfo } from '@rocket.chat/apps-engine/definition/metadata';
import type { IRead, IModify, IHttp, IPersistence } from '@rocket.chat/apps-engine/definition/accessors';
import type { IConfigurationExtend } from '@rocket.chat/apps-engine/definition/accessors';
import type { IMessage, IPreMessageSentPrevent } from '@rocket.chat/apps-engine/definition/messages';

import { DirectoryCommand } from './commands/DirectoryCommand';
import { PostJobCommand } from './commands/PostJobCommand';
import { PostCvCommand } from './commands/PostCvCommand';
import { SupplierDetectionHandler } from './handlers/SupplierDetectionHandler';

export class HpnCommunityApp extends App implements IPreMessageSentPrevent {
	constructor(info: IAppInfo, logger: any, accessors: any) {
		super(info, logger, accessors);
	}

	public async extendConfiguration(configuration: IConfigurationExtend): Promise<void> {
		// Register slash commands
		await configuration.slashCommands.provideSlashCommand(new DirectoryCommand(this) as any);
		await configuration.slashCommands.provideSlashCommand(new PostJobCommand(this) as any);
		await configuration.slashCommands.provideSlashCommand(new PostCvCommand(this) as any);
	}

	/**
	 * Pre-message hook — runs before every message is saved.
	 * Used to detect supplier requests and unsolicited supplier recommendations.
	 */
	public async checkPreMessageSentPrevent(
		message: IMessage,
		read: IRead,
		_http: IHttp,
	): Promise<boolean> {
		return SupplierDetectionHandler.shouldPrevent(message, read);
	}

	public async executePreMessageSentPrevent(
		message: IMessage,
		read: IRead,
		http: IHttp,
		persistence: IPersistence,
		modify?: IModify,
	): Promise<boolean> {
		return SupplierDetectionHandler.execute(message, read, http, persistence, modify as IModify, this.getLogger());
	}
}
