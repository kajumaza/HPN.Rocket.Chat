import type { IHttp, IModify, IPersistence, IRead } from '@rocket.chat/apps-engine/definition/accessors';
import type { SlashCommandContext } from '@rocket.chat/apps-engine/definition/slashcommands';
import { UIKitSurfaceType } from '@rocket.chat/apps-engine/definition/uikit';

/**
 * /post-job
 * Opens a UI Kit modal for posting a job vacancy in #hpn-recruitment.
 */
export class PostJobCommand {
	public command = 'post-job';
	public i18nDescription = 'Post a job vacancy to the HPN recruitment channel';
	public i18nParamsExample = '';
	public providesPreview = false;

	constructor(private readonly app: any) {}

	public async executor(
		context: SlashCommandContext,
		read: IRead,
		modify: IModify,
		_http?: IHttp,
		_persis?: IPersistence,
	): Promise<void> {
		const triggerId = context.getTriggerId();
		if (!triggerId) return;

		await (modify.getUiController() as any).openSurfaceView(
			{
				id: 'hpn-post-job-modal',
				type: UIKitSurfaceType.MODAL,
				title: { type: 'plain_text', text: 'Post a Job Vacancy' },
				submit: { type: 'plain_text', text: 'Post Job' },
				close: { type: 'plain_text', text: 'Cancel' },
				blocks: [
					{
						type: 'input',
						blockId: 'job_title',
						label: { type: 'plain_text', text: 'Job Title' },
						element: { type: 'plain_text_input', actionId: 'job_title_input', placeholder: { type: 'plain_text', text: 'e.g. Senior HR Business Partner' } },
					},
					{
						type: 'input',
						blockId: 'company',
						label: { type: 'plain_text', text: 'Company / Organisation' },
						element: { type: 'plain_text_input', actionId: 'company_input' },
					},
					{
						type: 'input',
						blockId: 'location',
						label: { type: 'plain_text', text: 'Location / Remote' },
						element: { type: 'plain_text_input', actionId: 'location_input', placeholder: { type: 'plain_text', text: 'e.g. Cape Town / Remote / Hybrid' } },
					},
					{
						type: 'input',
						blockId: 'description',
						label: { type: 'plain_text', text: 'Role Description' },
						element: { type: 'plain_text_input', actionId: 'description_input', multiline: true },
					},
					{
						type: 'input',
						blockId: 'contact',
						label: { type: 'plain_text', text: 'How to Apply (email or link)' },
						element: { type: 'plain_text_input', actionId: 'contact_input' },
					},
				],
			} as any,
			{ triggerId },
			context.getSender(),
		);
	}
}
