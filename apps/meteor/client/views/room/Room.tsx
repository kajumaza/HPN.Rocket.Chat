import { isInviteSubscription } from '@rocket.chat/core-typings';
import { ContextualbarSkeleton } from '@rocket.chat/ui-client';
import { useSetting, useRoomToolbox, useUserId, useUser } from '@rocket.chat/ui-contexts';
import { useMediaCallOpenRoomTracker } from '@rocket.chat/ui-voip';
import type { ReactElement } from 'react';
import { createElement, lazy, memo, Suspense } from 'react';
import { FocusScope } from 'react-aria';
import { ErrorBoundary } from 'react-error-boundary';
import { useTranslation } from 'react-i18next';

import RoomE2EESetup from './E2EESetup/RoomE2EESetup';
import Header from './Header';
import HpnAccessRestricted from './HpnAccessRestricted';
import MessageHighlightProvider from './MessageList/providers/MessageHighlightProvider';
import RoomInvite from './RoomInvite';
import RoomBody from './body/RoomBody';
import { useRoom, useRoomSubscription } from './contexts/RoomContext';
import { useAppsContextualBar } from './hooks/useAppsContextualBar';
import RoomLayout from './layout/RoomLayout';
import ChatProvider from './providers/ChatProvider';
import { DateListProvider } from './providers/DateListProvider';
import { SelectedMessagesProvider } from './providers/SelectedMessagesProvider';

const UiKitContextualBar = lazy(() => import('./contextualBar/uikit/UiKitContextualBar'));

// HPN role hierarchy — index 0 = lowest
const HPN_ROLE_HIERARCHY = ['hpn-free', 'hpn-student', 'hpn-manager', 'hpn-executive'];

// Minimum role required per hpnRoomKey
const HPN_ROOM_MIN_ROLE: Record<string, string> = {
	general: 'hpn-free',
	students: 'hpn-student',
	managers: 'hpn-manager',
	executives: 'hpn-executive',
	'business-directory': 'hpn-free',
	'job-board': 'hpn-student',
	recruitment: 'hpn-student',
};

const HPN_ROLE_LABELS: Record<string, string> = {
	'hpn-free': 'Free Member',
	'hpn-student': 'HR Student (Level 1)',
	'hpn-manager': 'HR Manager (Level 2)',
	'hpn-executive': 'HR Executive (Level 3)',
};

function hasHpnAccess(userRoles: string[], requiredRole: string): boolean {
	const requiredIdx = HPN_ROLE_HIERARCHY.indexOf(requiredRole);
	if (requiredIdx < 0) return true; // unknown required role — allow

	// Find the user's highest HPN level; default to 0 (hpn-free) if no HPN role assigned
	let userLevel = 0;
	for (const role of userRoles) {
		const idx = HPN_ROLE_HIERARCHY.indexOf(role);
		if (idx > userLevel) userLevel = idx;
	}
	return userLevel >= requiredIdx;
}

const Room = (): ReactElement => {
	const { t } = useTranslation();
	const userId = useUserId();
	const user = useUser();
	const room = useRoom();
	const subscription = useRoomSubscription();
	const toolbox = useRoomToolbox();
	const contextualBarView = useAppsContextualBar();
	const isE2EEnabled = useSetting('E2E_Enable');
	const unencryptedMessagesAllowed = useSetting('E2E_Allow_Unencrypted_Messages');
	const shouldDisplayE2EESetup = room?.encrypted && !unencryptedMessagesAllowed && isE2EEnabled;
	const roomLabel =
		room.t === 'd' ? t('Conversation_with__roomName__', { roomName: room.name }) : t('Channel__roomName__', { roomName: room.name });

	useMediaCallOpenRoomTracker(room._id);

	if (subscription && isInviteSubscription(subscription)) {
		return (
			<FocusScope>
				<RoomInvite userId={userId} room={room} subscription={subscription} data-qa-rc-room={room._id} aria-label={roomLabel} />
			</FocusScope>
		);
	}

	// HPN: access gate — show "Access Restricted" for rooms the user's level cannot enter
	const hpnRoomKey = (room as any).customFields?.hpnRoomKey as string | undefined;
	if (hpnRoomKey && user) {
		const userRoles = (user.roles ?? []) as string[];
		const isAdmin = userRoles.includes('admin');
		if (!isAdmin) {
			const minRole = HPN_ROOM_MIN_ROLE[hpnRoomKey];
			if (minRole && !hasHpnAccess(userRoles, minRole)) {
				return (
					<HpnAccessRestricted
						roomName={(room as any).fname || room.name || ''}
						requiredRoleLabel={HPN_ROLE_LABELS[minRole] ?? minRole}
					/>
				);
			}
		}
	}

	return (
		<ChatProvider>
			<MessageHighlightProvider>
				<FocusScope>
					<DateListProvider>
						<RoomLayout
							data-qa-rc-room={room._id}
							aria-label={roomLabel}
							header={<Header room={room} />}
							body={shouldDisplayE2EESetup ? <RoomE2EESetup /> : <RoomBody />}
							aside={
								(toolbox.tab?.tabComponent && (
									<ErrorBoundary fallback={null}>
										<SelectedMessagesProvider>
											<Suspense fallback={<ContextualbarSkeleton />}>{createElement(toolbox.tab.tabComponent)}</Suspense>
										</SelectedMessagesProvider>
									</ErrorBoundary>
								)) ||
								(contextualBarView && (
									// TODO: improve fallback handling
									<ErrorBoundary fallback={null}>
										<SelectedMessagesProvider>
											<Suspense fallback={<ContextualbarSkeleton />}>
												<UiKitContextualBar key={contextualBarView.id} initialView={contextualBarView} />
											</Suspense>
										</SelectedMessagesProvider>
									</ErrorBoundary>
								))
							}
						/>
					</DateListProvider>
				</FocusScope>
			</MessageHighlightProvider>
		</ChatProvider>
	);
};

export default memo(Room);
