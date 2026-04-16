import { Users } from '@rocket.chat/models';

import type { HpnRoleId } from './roles';

/**
 * Badge configuration for each HPN membership level.
 * Used to display visual identity in the UI.
 */
export const HPN_BADGES: Record<HpnRoleId, { label: string; color: string; textColor: string }> = {
	'hpn-free': {
		label: 'Member',
		color: '#9EA2A8', // grey
		textColor: '#FFFFFF',
	},
	'hpn-student': {
		label: 'Student',
		color: '#1D74F5', // blue
		textColor: '#FFFFFF',
	},
	'hpn-manager': {
		label: 'HR Manager',
		color: '#8E8E8E', // silver
		textColor: '#FFFFFF',
	},
	'hpn-executive': {
		label: 'HR Executive',
		color: '#C9A84C', // gold
		textColor: '#1A1A1A',
	},
};

export interface EngagementScore {
	userId: string;
	total: number;
	breakdown: {
		messages: number;
		reactions: number;
		coursesCompleted: number;
		eventsAttended: number;
	};
	updatedAt: Date;
}

/**
 * Add engagement points for a user action.
 * Points are stored in user customFields.
 */
export async function addEngagementPoints(
	userId: string,
	action: 'message' | 'reaction' | 'course' | 'event',
): Promise<void> {
	const pointsMap: Record<typeof action, number> = {
		message: 1,
		reaction: 2,
		course: 20,
		event: 15,
	};

	const points = pointsMap[action];
	const fieldKey = `hpnEngagement.${action}s`;

	await Users.update({ _id: userId }, {
		$inc: {
			[fieldKey]: points,
			'hpnEngagement.total': points,
		},
		$set: {
			'hpnEngagement.updatedAt': new Date(),
		},
	});
}

/**
 * Get the current engagement score for a user.
 */
export async function getEngagementScore(userId: string): Promise<EngagementScore | null> {
	const user = await Users.findOneById(userId, {
		projection: { 'customFields.hpnEngagement': 1 },
	});

	if (!user) return null;

	const eng = (user as any).customFields?.hpnEngagement ?? {};

	return {
		userId,
		total: eng.total ?? 0,
		breakdown: {
			messages: eng.messages ?? 0,
			reactions: eng.reactions ?? 0,
			coursesCompleted: eng.courses ?? 0,
			eventsAttended: eng.events ?? 0,
		},
		updatedAt: eng.updatedAt ?? new Date(),
	};
}
