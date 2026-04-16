import type { IUser } from '@rocket.chat/core-typings';
import { Rooms, Subscriptions, Users } from '@rocket.chat/models';

import { addUserRolesAsync } from '../roles/addUserRoles';
import { removeUserFromRolesAsync } from '../roles/removeUserFromRoles';
import type { HpnRoleId } from './roles';
import { HPN_ROLE_HIERARCHY, HPN_ROOM_ACCESS, HPN_VISIBLE_ROOMS } from './roles';

/**
 * Onboarding questionnaire structure.
 * Answers are submitted after registration and determine initial level.
 */
export interface HpnOnboardingAnswers {
	/** What best describes your role? */
	role: 'student' | 'hr-practitioner' | 'hr-manager' | 'hr-executive' | 'other';
	/** Years of HR experience */
	yearsExperience: 0 | 1 | 3 | 5 | 10;
	/** Are you currently employed in an HR role? */
	activelyWorking: boolean;
	/** Do you manage a team? */
	managesTeam: boolean;
	/** Team/organisation size */
	orgSize: 'solo' | 'small' | 'medium' | 'large' | 'enterprise';
}

/**
 * Score answers and return the appropriate HPN role.
 *
 * Scoring guide:
 * - hpn-free: 0–2 points (default, free access)
 * - hpn-student: 3–5 points (student/early career)
 * - hpn-manager: 6–8 points (practitioner/manager level)
 * - hpn-executive: 9+ points (senior/executive level)
 *
 * Note: Paid tiers require payment confirmation before activation.
 * This function returns the TARGET role; actual assignment requires payment.
 */
export function scoreOnboardingAnswers(answers: HpnOnboardingAnswers): HpnRoleId {
	let score = 0;

	// Role points
	const rolePoints: Record<HpnOnboardingAnswers['role'], number> = {
		student: 2,
		'hr-practitioner': 4,
		'hr-manager': 6,
		'hr-executive': 8,
		other: 1,
	};
	score += rolePoints[answers.role];

	// Experience points
	if (answers.yearsExperience >= 10) score += 3;
	else if (answers.yearsExperience >= 5) score += 2;
	else if (answers.yearsExperience >= 3) score += 1;

	// Active work bonus
	if (answers.activelyWorking) score += 1;

	// Management bonus
	if (answers.managesTeam) score += 2;

	// Org size points
	const orgPoints: Record<HpnOnboardingAnswers['orgSize'], number> = {
		solo: 0,
		small: 1,
		medium: 2,
		large: 3,
		enterprise: 4,
	};
	score += orgPoints[answers.orgSize];

	if (score >= 9) return 'hpn-executive';
	if (score >= 6) return 'hpn-manager';
	if (score >= 3) return 'hpn-student';
	return 'hpn-free';
}

/**
 * Assign an HPN role to a user.
 * Removes all other HPN roles first (a user has exactly one HPN level).
 */
export async function assignHpnRole(userId: string, roleId: HpnRoleId): Promise<void> {
	// Remove existing HPN roles
	for (const existingRole of HPN_ROLE_HIERARCHY) {
		try {
			await removeUserFromRolesAsync(userId, [existingRole]);
		} catch {
			// Role may not be assigned — ignore
		}
	}

	// Assign the new role
	await addUserRolesAsync(userId, [roleId]);

	// Subscribe user to rooms appropriate for their level
	await syncHpnRoomAccess(userId, roleId);

	console.log(`[HPN] Assigned role ${roleId} to user ${userId}`);
}

/**
 * Subscribe a user to all HPN visible rooms.
 * All members see all non-archive rooms in the sidebar; access is gated client-side.
 * Existing subscriptions are preserved.
 */
export async function syncHpnRoomAccess(userId: string, _roleId: HpnRoleId): Promise<void> {
	for (const roomName of HPN_VISIBLE_ROOMS) {
		const room = await Rooms.findOneByName(roomName);
		if (!room) continue;

		const alreadySubscribed = await Subscriptions.findOneByRoomIdAndUserId(room._id, userId);
		if (!alreadySubscribed) {
			await Subscriptions.createWithRoomAndUser(room, { _id: userId } as IUser, {
				ts: new Date(),
				ls: new Date(),
				open: true,
			});
			console.log(`[HPN] Subscribed user ${userId} to #${roomName}`);
		}
	}
}

/**
 * Startup migration: subscribe all existing users to all visible HPN rooms.
 * Idempotent — skips users who are already subscribed.
 * Covers users with no HPN role assigned (treated as hpn-free).
 */
export async function subscribeAllUsersToVisibleRooms(): Promise<void> {
	// All real user accounts — exclude bots and system users
	const cursor = Users.find({ type: { $nin: ['bot', 'app'] }, active: true } as any, { projection: { _id: 1 } });
	const users = await cursor.toArray();
	let count = 0;
	for (const user of users) {
		await syncHpnRoomAccess(user._id, 'hpn-free');
		count++;
	}
	console.log(`[HPN] subscribeAllUsersToVisibleRooms: processed ${count} users`);
}

/**
 * Process onboarding answers for a new user.
 * - Scores answers → determines target role
 * - For free tier: assigns immediately
 * - For paid tiers: records the target role and awaits payment confirmation
 */
export async function processOnboarding(userId: string, answers: HpnOnboardingAnswers): Promise<{ targetRole: HpnRoleId; requiresPayment: boolean }> {
	const targetRole = scoreOnboardingAnswers(answers);
	const requiresPayment = targetRole !== 'hpn-free';

	// Store the target role on the user profile for payment reference
	await Users.update({ _id: userId }, {
		$set: {
			'customFields.hpnTargetRole': targetRole,
			'customFields.hpnOnboardingComplete': true,
			'customFields.hpnOnboardingAnswers': answers,
		},
	});

	if (!requiresPayment) {
		// Free tier — assign immediately
		await assignHpnRole(userId, 'hpn-free');
	} else {
		// Paid tier — assign free access while awaiting payment
		await assignHpnRole(userId, 'hpn-free');
	}

	return { targetRole, requiresPayment };
}

/**
 * Called by the payment webhook when a payment is confirmed.
 * Upgrades the user to their target (or specified) HPN role.
 */
export async function onPaymentConfirmed(userId: string, paidRole?: HpnRoleId): Promise<void> {
	const user = await Users.findOneById(userId);
	if (!user) throw new Error(`[HPN] User ${userId} not found`);

	const targetRole = paidRole ?? (user as any).customFields?.hpnTargetRole ?? 'hpn-student';
	await assignHpnRole(userId, targetRole as HpnRoleId);
	await Users.update({ _id: userId }, {
		$set: { 'customFields.hpnPaymentStatus': 'active' },
	});
}

/**
 * Called by the payment webhook when a subscription lapses.
 * Downgrades the user to free tier.
 */
export async function onPaymentLapsed(userId: string): Promise<void> {
	await assignHpnRole(userId, 'hpn-free');
	await Users.update({ _id: userId }, {
		$set: { 'customFields.hpnPaymentStatus': 'lapsed' },
	});
	console.log(`[HPN] Payment lapsed — downgraded user ${userId} to hpn-free`);
}
