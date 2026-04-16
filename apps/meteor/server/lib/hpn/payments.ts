import { createHash } from 'node:crypto';

import { Users } from '@rocket.chat/models';

import { onPaymentConfirmed, onPaymentLapsed } from './onboarding';
import type { HpnRoleId } from './roles';

/**
 * Maps PayFast plan names (sent in custom_str2) to HPN roles.
 * Set custom_str2 to one of these values when building the payment form.
 */
const PLAN_ROLE_MAP: Record<string, HpnRoleId> = {
	'hpn-student': 'hpn-student',
	'hpn-manager': 'hpn-manager',
	'hpn-executive': 'hpn-executive',
};

/**
 * Verify a PayFast ITN signature.
 *
 * Algorithm:
 * 1. Take all POST fields except 'signature', sorted by key
 * 2. URL-encode values and join as key=value&key=value
 * 3. If PAYFAST_PASSPHRASE is set, append &passphrase=<encoded>
 * 4. MD5 hash the result and compare with data.signature
 */
export function verifyPayfastSignature(data: Record<string, string>): boolean {
	const receivedSig = data.signature;
	if (!receivedSig) {
		console.error('[HPN Payments] PayFast ITN missing signature field');
		return false;
	}

	const passphrase = process.env.PAYFAST_PASSPHRASE;

	const paramString = Object.keys(data)
		.filter((k) => k !== 'signature')
		.sort()
		.map((k) => `${k}=${encodeURIComponent(data[k]).replace(/%20/g, '+')}`)
		.join('&');

	const toHash = passphrase
		? `${paramString}&passphrase=${encodeURIComponent(passphrase).replace(/%20/g, '+')}`
		: paramString;

	const expectedSig = createHash('md5').update(toHash).digest('hex');
	return expectedSig === receivedSig;
}

/**
 * Handle a PayFast ITN (Instant Transfer Notification).
 *
 * Expected ITN fields we set on the payment form:
 *   custom_str1 — HPN user ID
 *   custom_str2 — plan name (hpn-student / hpn-manager / hpn-executive)
 *
 * PayFast payment_status values:
 *   COMPLETE   — payment successful → upgrade user
 *   CANCELLED  — subscription cancelled → downgrade user
 *   FAILED     — payment failed → warn, flag user
 */
export async function handlePayfastItn(data: Record<string, string>): Promise<void> {
	const userId = data.custom_str1;
	const plan = data.custom_str2;
	const status = data.payment_status;
	const token = data.token; // subscription token for recurring billing

	if (!userId) {
		console.warn('[HPN Payments] ITN missing custom_str1 (userId)');
		return;
	}

	switch (status) {
		case 'COMPLETE': {
			const role = PLAN_ROLE_MAP[plan];
			if (!role) {
				console.warn(`[HPN Payments] No role mapped for plan "${plan}"`);
				return;
			}

			// Store PayFast subscription token for future cancellation via API
			if (token) {
				await Users.update({ _id: userId }, {
					$set: { 'customFields.payfastToken': token },
				});
			}

			await onPaymentConfirmed(userId, role);
			console.log(`[HPN Payments] Payment confirmed — user ${userId} upgraded to ${role}`);
			break;
		}

		case 'CANCELLED': {
			await onPaymentLapsed(userId);
			console.log(`[HPN Payments] Subscription cancelled — user ${userId} downgraded to hpn-free`);
			break;
		}

		case 'FAILED': {
			// Don't immediately downgrade — PayFast may retry
			console.warn(`[HPN Payments] Payment failed for user ${userId} — awaiting PayFast retry`);
			await Users.update({ _id: userId }, {
				$set: { 'customFields.hpnPaymentStatus': 'payment_failed' },
			});
			break;
		}

		default:
			// PENDING (EFT) or unknown — safe to ignore
			break;
	}
}
