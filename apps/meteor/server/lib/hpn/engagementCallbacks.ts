import { api } from '@rocket.chat/core-services';
import type { IMessage } from '@rocket.chat/core-typings';
import { Messages, Rooms } from '@rocket.chat/models';

import { callbacks } from '../callbacks';
import { addEngagementPoints } from './engagement';
import { handleSupplierRequest, handleUnsolicitedRecommendation, isSupplierRequest, isUnsolicitedRecommendation, isModeratedRoomName, checkThreadReply } from './supplierBot';

/**
 * Register HPN engagement scoring hooks on message events.
 * Called from hpn/index.ts on startup.
 */
export function registerEngagementCallbacks(): void {
	// Award 1 point per message sent in an HPN room
	callbacks.add(
		'afterSaveMessage',
		async (message: IMessage) => {
			if (!message.u?._id) return message;
			// Skip bot messages to prevent infinite loops
			if (message.u.username === 'hpn.assistant') return message;

			const room = await Rooms.findOneById(message.rid, { projection: { name: 1, fname: 1 } });
			const roomName = room?.name || room?.fname || '';
			if (!roomName.startsWith('hpn-')) return message;

			await addEngagementPoints(message.u._id, 'message').catch((err) => {
				console.error('[HPN Engagement] Error adding message points:', err);
			});

			// HPN: supplier request detection — respond with AI-powered directory recommendations
			if (isModeratedRoomName(roomName) && isSupplierRequest(message.msg || '')) {
				handleSupplierRequest(message, roomName).catch((err) => {
					console.error('[HPN Bot] Error handling supplier request:', err);
				});
			}

			// HPN: thread reply moderation — delete replies that recommend businesses not on the bot's list.
			// Must be in afterSaveMessage (not beforeSaveMessage) because RC v8 MessageService only fires
			// afterSaveMessage for thread replies.
			if (message.tmid && isModeratedRoomName(roomName)) {
				console.log(`[HPN Bot] Thread reply in afterSaveMessage: tmid=${message.tmid} from ${message.u?.username}`);
				checkThreadReply(message.tmid, message.msg || '', message.rid, message.ts).then(async (decision) => {
					if (decision === 'block') {
						console.log(`[HPN Bot] Deleting thread reply ${message._id} from ${message.u?.username}`);
						await Messages.removeById(message._id).catch((err) => {
							console.error('[HPN Bot] Error deleting thread reply:', err);
						});
						// Broadcast real-time deletion so clients remove the message immediately without a page reload
						void api.broadcast('notify.deleteMessageBulk', message.rid, {
							rid: message.rid,
							excludePinned: false,
							ignoreDiscussion: false,
							ts: { $gt: new Date(0) },
							users: [],
							ids: [message._id],
							showDeletedStatus: false,
						});
						await handleUnsolicitedRecommendation(message).catch((err) => {
							console.error('[HPN Bot] Error handling thread moderation DM:', err);
						});
					}
				}).catch((err) => {
					console.error('[HPN Bot] Thread moderation error:', err);
				});
			}

			return message;
		},
		callbacks.priority.LOW,
		'hpn-engagement-messages',
	);

	// HPN: block unsolicited supplier recommendations before they are saved
	callbacks.add(
		'beforeSaveMessage',
		async (message: IMessage) => {
			if (message.u?.username === 'hpn.assistant') return message;
			const room = await Rooms.findOneById(message.rid, { projection: { name: 1 } });
			const roomName = room?.name || '';
			if (!isModeratedRoomName(roomName)) return message;
			if (!isUnsolicitedRecommendation(message.msg || '')) {
				return message;
			}

			await handleUnsolicitedRecommendation(message).catch((err) => {
				console.error('[HPN Bot] Error handling unsolicited recommendation:', err);
			});

			// Return message with empty text to suppress it
			return { ...message, msg: '', text: '' };
		},
		callbacks.priority.HIGH,
		'hpn-supplier-moderation',
	);
}
