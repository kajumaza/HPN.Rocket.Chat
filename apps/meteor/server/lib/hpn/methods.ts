import { randomUUID } from 'crypto';

import { check } from 'meteor/check';
import { Meteor } from 'meteor/meteor';
import { MongoInternals } from 'meteor/mongo';
import { Settings, Users } from '@rocket.chat/models';

import { processOnboarding, syncHpnRoomAccess } from './onboarding';
import { trackDirectoryView, getLatestInsights, getInsightsHistory } from './insights';
import type { HpnOnboardingAnswers } from './onboarding';
import { HPN_ROOM_ACCESS } from './roles';
import type { HpnRoleId } from './roles';

/**
 * Meteor methods for HPN-specific client-server interactions.
 */
Meteor.methods({
	/**
	 * Submit onboarding questionnaire answers.
	 * Called from the client after a new user completes registration.
	 */
	async 'hpn/onboarding/submit'(answers: HpnOnboardingAnswers) {
		if (!this.userId) {
			throw new Meteor.Error('not-authorized', 'You must be logged in to complete onboarding');
		}

		check(answers, {
			role: String,
			yearsExperience: Number,
			activelyWorking: Boolean,
			managesTeam: Boolean,
			orgSize: String,
		});

		const result = await processOnboarding(this.userId, answers);
		return result;
	},

	/**
	 * Force-sync a user's HPN room subscriptions based on their current roles.
	 * Admin-only. Use this after assigning a role via the Admin UI.
	 */
	async 'hpn/admin/sync-user-rooms'(userId: string) {
		if (!this.userId) throw new Meteor.Error('not-authorized');
		const caller = await Users.findOneById(this.userId);
		if (!caller?.roles?.includes('admin')) throw new Meteor.Error('forbidden');

		const target = await Users.findOneById(userId);
		if (!target) throw new Meteor.Error('user-not-found');

		const hpnRoles = ((target.roles ?? []) as string[]).filter((r) => r in HPN_ROOM_ACCESS);
		for (const role of hpnRoles) {
			await syncHpnRoomAccess(userId, role as HpnRoleId);
		}
		return { synced: hpnRoles };
	},

	/**
	 * Save a single HPN badge label + color. Admin only.
	 * key is the short key: 'free' | 'student' | 'manager' | 'executive' | 'supplier' | 'admin' | 'owner' | 'moderator'
	 */
	/**
	 * Save HPN poll/survey create-permission settings. Admin only.
	 */
	async 'hpn/settings/polls/save'({
		pollPermission,
		surveyPermission,
	}: {
		pollPermission: string;
		surveyPermission: string;
	}) {
		if (!this.userId) throw new Meteor.Error('not-authorized');
		const caller = await Users.findOneById(this.userId);
		if (!caller?.roles?.includes('admin')) throw new Meteor.Error('forbidden');
		await Settings.updateOne({ _id: 'HPN_Poll_Create_Permission' }, { $set: { value: pollPermission } });
		await Settings.updateOne({ _id: 'HPN_Survey_Create_Permission' }, { $set: { value: surveyPermission } });
	},

	/**
	 * Save HPN sidebar nav colour settings. Admin only.
	 */
	async 'hpn/settings/nav/save'({
		activeBackground,
		activeBorderColor,
		activeTextColor,
		hoverBackground,
	}: {
		activeBackground: string;
		activeBorderColor: string;
		activeTextColor: string;
		hoverBackground: string;
	}) {
		if (!this.userId) throw new Meteor.Error('not-authorized');
		const caller = await Users.findOneById(this.userId);
		if (!caller?.roles?.includes('admin')) throw new Meteor.Error('forbidden');
		await Settings.updateOne({ _id: 'HPN_Nav_Active_Background' }, { $set: { value: activeBackground } });
		await Settings.updateOne({ _id: 'HPN_Nav_Active_Border_Color' }, { $set: { value: activeBorderColor } });
		await Settings.updateOne({ _id: 'HPN_Nav_Active_Text_Color' }, { $set: { value: activeTextColor } });
		await Settings.updateOne({ _id: 'HPN_Nav_Hover_Background' }, { $set: { value: hoverBackground } });
	},

	/**
	 * Save a single HPN badge label + color. Admin only.
	 * key is the short key: 'free' | 'student' | 'manager' | 'executive' | 'supplier' | 'admin' | 'owner' | 'moderator'
	 */
	async 'hpn/settings/badge/save'({ key, label, color }: { key: string; label: string; color: string }) {
		if (!this.userId) throw new Meteor.Error('not-authorized');
		const caller = await Users.findOneById(this.userId);
		if (!caller?.roles?.includes('admin')) throw new Meteor.Error('forbidden');
		check(key, String);
		check(label, String);
		check(color, String);
		await Settings.updateOne({ _id: `HPN_Badge_${key}_label` }, { $set: { value: label } });
		await Settings.updateOne({ _id: `HPN_Badge_${key}_color` }, { $set: { value: color } });
	},

	async 'hpn/bot/keywords/get'() {
		if (!this.userId) throw new Meteor.Error('not-authorized');
		const caller = await Users.findOneById(this.userId);
		if (!caller?.roles?.includes('admin')) throw new Meteor.Error('forbidden');
		const col = MongoInternals.defaultRemoteCollectionDriver().mongo.db.collection('hpn_bot_keywords');
		return col.find({}).sort({ keyword: 1 }).toArray();
	},

	async 'hpn/bot/keywords/add'(keyword: string) {
		if (!this.userId) throw new Meteor.Error('not-authorized');
		const caller = await Users.findOneById(this.userId);
		if (!caller?.roles?.includes('admin')) throw new Meteor.Error('forbidden');
		check(keyword, String);
		const clean = keyword.trim().toLowerCase();
		if (clean.length < 2) throw new Meteor.Error('invalid', 'Keyword too short');
		const col = MongoInternals.defaultRemoteCollectionDriver().mongo.db.collection('hpn_bot_keywords');
		try {
			await col.insertOne({ _id: randomUUID(), keyword: clean, source: 'manual', addedAt: new Date() });
		} catch (err: any) {
			if (err?.code === 11000) throw new Meteor.Error('duplicate', 'Keyword already exists');
			throw err;
		}
		const { refreshDynamicKeywords } = await import('./supplierBot');
		await refreshDynamicKeywords();
	},

	async 'hpn/bot/keywords/remove'(id: string) {
		if (!this.userId) throw new Meteor.Error('not-authorized');
		const caller = await Users.findOneById(this.userId);
		if (!caller?.roles?.includes('admin')) throw new Meteor.Error('forbidden');
		check(id, String);
		const col = MongoInternals.defaultRemoteCollectionDriver().mongo.db.collection('hpn_bot_keywords');
		await col.deleteOne({ _id: id });
		const { refreshDynamicKeywords } = await import('./supplierBot');
		await refreshDynamicKeywords();
	},

	async 'hpn/export/run'() {
		if (!this.userId) throw new Meteor.Error('not-authorized');
		const caller = await Users.findOneById(this.userId);
		if (!caller?.roles?.includes('admin')) throw new Meteor.Error('forbidden');
		const { hpnArchiveCron } = await import('../../cron/hpnArchive');
		await hpnArchiveCron();
	},

	// ── Insights & Analytics ────────────────────────────────────────────────────

	async 'hpn/directory/track-view'(listingId: string) {
		if (!this.userId) return; // must be logged in
		await trackDirectoryView(listingId);
	},

	async 'hpn/insights/latest'() {
		if (!this.userId) throw new Meteor.Error('unauthorized');
		const caller = await Users.findOneById(this.userId);
		if (!caller?.roles?.includes('admin')) throw new Meteor.Error('forbidden');
		return getLatestInsights();
	},

	async 'hpn/insights/history'(limit = 12) {
		if (!this.userId) throw new Meteor.Error('unauthorized');
		const caller = await Users.findOneById(this.userId);
		if (!caller?.roles?.includes('admin')) throw new Meteor.Error('forbidden');
		return getInsightsHistory(limit);
	},
});
