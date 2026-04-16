import { Accounts } from 'meteor/accounts-base';
import { Meteor } from 'meteor/meteor';
import { Settings, Users } from '@rocket.chat/models';

import './methods';
import './polls';
import './directory';
import './jobs';
import { refreshDynamicKeywords, backfillKeywordsFromListings } from './supplierBot';
import '../../routes/hpnPollsApi';
import { registerEngagementCallbacks } from './engagementCallbacks';
import { seedHpnRoles } from './roles';
import { HPN_ROOM_ACCESS } from './roles';
import type { HpnRoleId } from './roles';
import { seedHpnRooms } from './rooms';
import { syncHpnRoomAccess, subscribeAllUsersToVisibleRooms } from './onboarding';

// Register engagement scoring callbacks immediately (not inside startup)
registerEngagementCallbacks();

// Sync HPN room subscriptions on every login.
// Handles roles assigned via Admin UI (which bypasses the onboarding flow).
Accounts.onLogin(async ({ user }: { user: any }) => {
	try {
		// Always sync visible rooms on login — defaults to hpn-free for users without an HPN role
		const hpnRoles = ((user.roles ?? []) as string[]).filter((r) => r in HPN_ROOM_ACCESS);
		const effectiveRole = (hpnRoles[0] as HpnRoleId | undefined) ?? 'hpn-free';
		await syncHpnRoomAccess(user._id, effectiveRole);
	} catch {
		// Non-critical — don't block login
	}
});

async function applyHpnSettings(): Promise<void> {
	// Force sidenav footer to HPN logo (overrides DB default)
	await Settings.updateOne(
		{ _id: 'Layout_Sidenav_Footer' },
		{ $set: { value: '<a href="/home"><img src="assets/logo.png" alt="HPN" /></a>' } },
	);
	await Settings.updateOne(
		{ _id: 'Layout_Sidenav_Footer_Dark' },
		{ $set: { value: '<a href="/home"><img src="assets/logo_dark.png" alt="HPN" /></a>' } },
	);
	// Hide Rocket.Chat branding on login page + clear enterprise gate from DB
	await Settings.updateOne({ _id: 'Layout_Login_Hide_Logo' }, { $set: { value: true }, $unset: { enterprise: 1, modules: 1 } });
	await Settings.updateOne({ _id: 'Layout_Login_Hide_Title' }, { $set: { value: true }, $unset: { enterprise: 1, modules: 1 } });
	await Settings.updateOne({ _id: 'Layout_Login_Hide_Powered_By' }, { $set: { value: true }, $unset: { enterprise: 1, modules: 1 } });
	await Settings.updateOne({ _id: 'Layout_Login_Template' }, { $unset: { enterprise: 1, modules: 1 } });
	await Settings.updateOne({ _id: 'Layout_Custom_Body_Only' }, { $unset: { enterprise: 1, modules: 1 } });
	// Enable read receipts + clear enterprise gate
	await Settings.updateOne({ _id: 'Message_Read_Receipt_Enabled' }, { $set: { value: true }, $unset: { enterprise: 1, modules: 1 } });
	await Settings.updateOne({ _id: 'Message_Read_Receipt_Store_Users' }, { $set: { value: true }, $unset: { enterprise: 1, modules: 1 } });
	// Push privacy + video mobile ringing + clear enterprise gates
	await Settings.updateOne({ _id: 'Push_request_content_from_server' }, { $set: { value: true }, $unset: { enterprise: 1, modules: 1 } });
	await Settings.updateOne({ _id: 'VideoConf_Mobile_Ringing' }, { $set: { value: true }, $unset: { enterprise: 1, modules: 1 } });
	// Video conference granular controls — clear enterprise gate so toggles are usable
	await Settings.updateMany({ _id: /^VideoConf_Enable_/ } as any, { $unset: { enterprise: 1, modules: 1 } });
	await Settings.updateOne({ _id: 'VideoConf_Persistent_Chat_Discussion_Name' }, { $unset: { enterprise: 1, modules: 1 } });
	// Hide Federation from Admin UI entirely
	await Settings.updateMany({ _id: /^Federation_/ } as any, { $set: { hidden: true } });
	// Disable NPS surveys (rocket.cat sends these to admins — not relevant for HPN)
	await Settings.updateOne({ _id: 'NPS_survey_enabled' }, { $set: { value: false } });
	// Rebrand rocket.cat as HPN Bob — RC finds this user by _id ('rocket.cat'), not username,
	// so changing the username is safe and survives updates without modifying RC's initialData.ts
	await Users.updateOne(
		{ _id: 'rocket.cat' } as any,
		{ $set: { username: 'hpn.bob', name: 'HPN Bob', _updatedAt: new Date() } },
	);
	// Disable built-in grey role badges — HPN uses its own coloured badges
	await Settings.updateOne({ _id: 'UI_DisplayRoles' }, { $set: { value: false } });
	// Fix badge color settings — change from 'color' type (broken dropdown) to 'string' (text input)
	await Settings.updateMany({ _id: /^HPN_Badge_.*_color$/ } as any, { $set: { type: 'string' } });
}

/**
 * HPN Platform Startup
 * Runs after Meteor startup to seed roles and rooms.
 */
async function seedHpnBot(): Promise<void> {
	const existing = await Users.findOneByUsername('hpn.assistant');
	if (existing) {
		// Patch existing bot if it was created without an email (Admin UI requires it)
		if (!existing.emails?.length) {
			await Users.updateOne(
				{ username: 'hpn.assistant' } as any,
				{ $set: { emails: [{ address: 'hpn.assistant@hpn.community', verified: true }], _updatedAt: new Date() } },
			);
			console.log('[HPN] Updated hpn.assistant bot user with email.');
		}
		return;
	}
	await Users.insertOne({
		_id: 'hpn-assistant-bot',
		username: 'hpn.assistant',
		name: 'HPN Assistant',
		type: 'bot',
		status: 'online',
		active: true,
		roles: ['bot'],
		emails: [{ address: 'hpn.assistant@hpn.community', verified: true }],
		createdAt: new Date(),
		_updatedAt: new Date(),
	} as any);
	console.log('[HPN] Created hpn.assistant bot user.');
}


Meteor.startup(async () => {
	try {
		console.log('[HPN] Initialising HPN platform...');
		await seedHpnRoles();
		await seedHpnRooms();
		await seedHpnBot();
		await applyHpnSettings();
		await subscribeAllUsersToVisibleRooms();
		await backfillKeywordsFromListings();
		await refreshDynamicKeywords();
		console.log('[HPN] Initialisation complete.');
	} catch (err) {
		console.error('[HPN] Startup error:', err);
	}
});
