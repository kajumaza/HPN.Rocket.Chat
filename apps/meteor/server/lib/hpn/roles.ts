import { Roles } from '@rocket.chat/models';

/**
 * HPN membership levels mapped to Rocket.Chat roles.
 * Higher index = higher level.
 */
export const HPN_ROLES = [
	{
		_id: 'hpn-free',
		name: 'HPN Free',
		description: 'Free HPN community member',
		scope: 'Users' as const,
		protected: false,
	},
	{
		_id: 'hpn-student',
		name: 'HR Student',
		description: 'Student-level HPN member (Level 1)',
		scope: 'Users' as const,
		protected: false,
	},
	{
		_id: 'hpn-manager',
		name: 'HR Managers',
		description: 'HR Manager-level HPN member (Level 2)',
		scope: 'Users' as const,
		protected: false,
	},
	{
		_id: 'hpn-executive',
		name: 'HR Executives',
		description: 'HR Executive-level HPN member (Level 3)',
		scope: 'Users' as const,
		protected: false,
	},
	{
		_id: 'hpn-supplier',
		name: 'HPN Supplier',
		description: 'Supplier/vendor account — access to all chat rooms',
		scope: 'Users' as const,
		protected: false,
	},
] as const;

export type HpnRoleId = (typeof HPN_ROLES)[number]['_id'];

/** Member-only role IDs (excludes supplier — separate track, not part of upgrade hierarchy) */
export type HpnMemberRoleId = 'hpn-free' | 'hpn-student' | 'hpn-manager' | 'hpn-executive';

/** Role hierarchy — index 0 is lowest (member tiers only, not supplier) */
export const HPN_ROLE_HIERARCHY: HpnMemberRoleId[] = ['hpn-free', 'hpn-student', 'hpn-manager', 'hpn-executive'];

/**
 * Room access matrix: which rooms each role can actively use (send messages, read content).
 * This is used for access-gate checks — NOT for sidebar visibility.
 */
export const HPN_ROOM_ACCESS: Record<HpnRoleId, string[]> = {
	'hpn-free': ['hpn-general'],
	'hpn-student': ['hpn-general', 'hpn-students', 'hpn-job-board'],
	'hpn-manager': ['hpn-general', 'hpn-students', 'hpn-managers', 'hpn-job-board'],
	'hpn-executive': ['hpn-general', 'hpn-students', 'hpn-managers', 'hpn-executives', 'hpn-job-board'],
	'hpn-supplier': ['hpn-general', 'hpn-students', 'hpn-managers', 'hpn-executives'],
};

/**
 * All HPN rooms shown in the sidebar to every member.
 * Archive rooms are excluded — they are only subscribed to users who have access.
 */
export const HPN_VISIBLE_ROOMS = [
	'hpn-general',
	'hpn-students',
	'hpn-managers',
	'hpn-executives',
];

/**
 * Minimum HPN role required to access each room (by hpnRoomKey).
 * Used client-side to render the "Access Restricted" gate.
 */
export const HPN_ROOM_MIN_ROLE: Record<string, HpnMemberRoleId> = {
	general: 'hpn-free',
	students: 'hpn-student',
	managers: 'hpn-manager',
	executives: 'hpn-executive',
	'business-directory': 'hpn-free',
	'job-board': 'hpn-student',
	recruitment: 'hpn-student',
};

/** Human-readable labels for HPN roles shown in the access gate */
export const HPN_ROLE_LABELS: Record<string, string> = {
	'hpn-free': 'Free Member',
	'hpn-student': 'HR Student (Level 1)',
	'hpn-manager': 'HR Manager (Level 2)',
	'hpn-executive': 'HR Executive (Level 3)',
};

/**
 * Seed HPN roles into the database on startup.
 * Uses upsert so it's safe to run multiple times.
 */
export async function seedHpnRoles(): Promise<void> {
	for (const role of HPN_ROLES) {
		const existing = await Roles.findOneById(role._id);
		if (!existing) {
			await Roles.insertOne({
				_id: role._id,
				name: role.name,
				description: role.description,
				scope: role.scope,
				protected: role.protected,
				mandatory2fa: false,
				_updatedAt: new Date(),
			});
			console.log(`[HPN] Created role: ${role._id}`);
		}
	}
}
