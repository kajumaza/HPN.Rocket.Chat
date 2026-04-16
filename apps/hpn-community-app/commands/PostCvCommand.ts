import type { IHttp, IModify, IPersistence, IRead } from '@rocket.chat/apps-engine/definition/accessors';
import type { SlashCommandContext } from '@rocket.chat/apps-engine/definition/slashcommands';
import { UIKitSurfaceType } from '@rocket.chat/apps-engine/definition/uikit';

/**
 * /post-cv
 * Opens a UI Kit modal for posting a CV/profile in #hpn-recruitment.
 */
export class PostCvCommand {
	public command = 'post-cv';
	public i18nDescription = 'Post your CV / availability to the HPN recruitment channel';
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
				id: 'hpn-post-cv-modal',
				type: UIKitSurfaceType.MODAL,
				title: { type: 'plain_text', text: 'Post Your CV / Availability' },
				submit: { type: 'plain_text', text: 'Post CV' },
				close: { type: 'plain_text', text: 'Cancel' },
				blocks: [
					{
						type: 'input',
						blockId: 'current_title',
						label: { type: 'plain_text', text: 'Current / Most Recent Title' },
						element: { type: 'plain_text_input', actionId: 'current_title_input', placeholder: { type: 'plain_text', text: 'e.g. HR Manager' } },
					},
					{
						type: 'input',
						blockId: 'years_experience',
						label: { type: 'plain_text', text: 'Years of HR Experience' },
						element: { type: 'plain_text_input', actionId: 'years_input', placeholder: { type: 'plain_text', text: 'e.g. 8' } },
					},
					{
						type: 'input',
						blockId: 'specialisation',
						label: { type: 'plain_text', text: 'Key Specialisations' },
						element: { type: 'plain_text_input', actionId: 'specialisation_input', placeholder: { type: 'plain_text', text: 'e.g. Labour relations, talent acquisition, HRIS' } },
					},
					{
						type: 'input',
						blockId: 'availability',
						label: { type: 'plain_text', text: 'Availability' },
						element: { type: 'plain_text_input', actionId: 'availability_input', placeholder: { type: 'plain_text', text: 'e.g. Available immediately / Notice period 30 days' } },
					},
					{
						type: 'input',
						blockId: 'contact',
						label: { type: 'plain_text', text: 'Contact / LinkedIn' },
						element: { type: 'plain_text_input', actionId: 'contact_input' },
					},
				],
			} as any,
			{ triggerId },
			context.getSender(),
		);
	}
}
