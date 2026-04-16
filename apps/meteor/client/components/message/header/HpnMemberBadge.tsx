import { useCallback } from 'react';
import type { ReactElement } from 'react';

import type { RoomRoles } from '../../../hooks/useRoomRolesQuery';
import { useRoomRolesQuery } from '../../../hooks/useRoomRolesQuery';
import type { UserRoles } from '../../../hooks/useUserRolesQuery';
import { useUserRolesQuery } from '../../../hooks/useUserRolesQuery';
import { useHpnBadgeConfig } from './useHpnBadgeConfig';

// Priority order — first match wins
const ROLE_PRIORITY = ['owner', 'admin', 'moderator', 'hpn-executive', 'hpn-manager', 'hpn-student', 'hpn-supplier', 'hpn-free'] as const;

type HpnMemberBadgeProps = {
	userId: string | undefined;
	roomId?: string;
};

const HpnMemberBadge = ({ userId, roomId }: HpnMemberBadgeProps): ReactElement | null => {
	const badgeConfig = useHpnBadgeConfig();

	const selectUserRoles = useCallback((records: UserRoles[]) => records.find((r) => r.uid === userId)?.roles ?? [], [userId]);
	const selectRoomRoles = useCallback((records: RoomRoles[]) => records.find((r) => r.u._id === userId)?.roles ?? [], [userId]);

	const { data: userRoles = [] } = useUserRolesQuery({ select: selectUserRoles, enabled: !!userId });
	const { data: roomRoles = [] } = useRoomRolesQuery(roomId ?? '', { select: selectRoomRoles, enabled: !!userId && !!roomId });

	const allRoles = [...userRoles, ...roomRoles];
	const matchedRole = ROLE_PRIORITY.find((r) => allRoles.includes(r));

	if (!matchedRole) return null;

	const badge = badgeConfig[matchedRole];
	if (!badge) return null;

	return (
		<span
			style={{
				display: 'inline-flex',
				alignItems: 'center',
				padding: '1px 6px',
				borderRadius: '3px',
				fontSize: '10px',
				fontWeight: 700,
				lineHeight: '16px',
				backgroundColor: badge.color,
				color: badge.textColor,
				marginLeft: '4px',
				verticalAlign: 'middle',
				textTransform: 'uppercase',
				letterSpacing: '0.5px',
				flexShrink: 0,
			}}
		>
			{badge.label}
		</span>
	);
};

export default HpnMemberBadge;
