import { cronJobs } from '@rocket.chat/cron';
import { Messages, Rooms, Users } from '@rocket.chat/models';

import { createRoom } from '../../app/lib/server/functions/createRoom';
import { recalculateDirectoryScores } from '../lib/hpn/directory';
import { createDataExportBatch, notifyN8n, cleanupOldExports } from '../lib/hpn/dataExport';

/**
 * hpnRoomKey values for the four active rooms that get archived.
 * These keys never change even if an admin renames the rooms.
 */
const HPN_ACTIVE_ROOM_KEYS = ['general', 'students', 'managers', 'executives'];

/**
 * Look up a room by its hpnRoomKey custom field.
 * Falls back to the original `hpn-<key>` name for rooms created before this
 * system was introduced, and tags them on the way past so future lookups are instant.
 */
async function findRoomByKey(key: string) {
	const byKey = await Rooms.findOne({ 'customFields.hpnRoomKey': key } as any);
	if (byKey) return byKey;

	// Migration: room exists but was created before hpnRoomKey was introduced
	const byName = await Rooms.findOneByName(`hpn-${key}`);
	if (byName) {
		await Rooms.updateOne({ _id: byName._id } as any, { $set: { 'customFields.hpnRoomKey': key } } as any);
		return byName;
	}

	return null;
}

/**
 * Move messages older than 7 days from active HPN rooms to their archive counterparts.
 * Archive rooms are read-only and created automatically if they don't exist.
 */
async function archiveOldMessages(): Promise<void> {
	const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
	const adminUser = await Users.findOne({ roles: 'admin' });
	if (!adminUser) return;

	for (const key of HPN_ACTIVE_ROOM_KEYS) {
		const room = await findRoomByKey(key);
		if (!room) continue;

		const archiveKey = `${key}-archive`;

		// Ensure archive room exists (also keyed)
		let archiveRoom = await Rooms.findOne({ 'customFields.hpnRoomKey': archiveKey } as any);
		if (!archiveRoom) {
			// Migration: archive room may exist under original name
			const archiveName = `hpn-${archiveKey}`;
			const byName = await Rooms.findOneByName(archiveName);
			if (byName) {
				await Rooms.updateOne({ _id: byName._id } as any, { $set: { 'customFields.hpnRoomKey': archiveKey } } as any);
				archiveRoom = byName;
			} else {
				await createRoom('p', archiveName, adminUser, [], false, true, {
					fname: `${(room as any).fname || archiveName} Archive`,
					description: `Archived messages from this room (older than 7 days)`,
					customFields: { hpnManaged: true, hpnArchive: true, hpnRoomKey: archiveKey },
				});
				archiveRoom = await Rooms.findOne({ 'customFields.hpnRoomKey': archiveKey } as any);
			}
		}

		if (!archiveRoom) continue;

		// Find old messages in the active room
		const oldMessages = await Messages.find(
			{ rid: room._id, ts: { $lt: cutoff }, t: { $exists: false } },
			{ projection: { _id: 1, msg: 1, u: 1, ts: 1, attachments: 1 } },
		).toArray();

		if (oldMessages.length === 0) continue;

		console.log(`[HPN Archive] Moving ${oldMessages.length} messages from #${(room as any).name} to archive`);

		for (const msg of oldMessages) {
			await Messages.insertOne({
				...msg,
				_id: `archive_${msg._id}`,
				rid: archiveRoom._id,
				customFields: { hpnArchived: true, hpnOriginalRoomKey: key, hpnArchivedAt: new Date() },
			} as any);

			await Messages.removeById(msg._id);
		}
	}
}

/**
 * Weekly data collection: gather all archived messages from the last 30 days,
 * store as a raw export batch, and notify n8n for downstream processing.
 */
async function collectAndExportData(): Promise<void> {
	const adminUser = await Users.findOne({ roles: 'admin' });
	if (!adminUser) return;

	const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

	// Find all archive rooms by key
	const archiveRooms = await Promise.all(
		HPN_ACTIVE_ROOM_KEYS.map((key) => Rooms.findOne({ 'customFields.hpnRoomKey': `${key}-archive` } as any)),
	);

	const rids = archiveRooms.filter(Boolean).map((r) => r!._id);
	if (rids.length === 0) return;

	const rawMessages = await Messages.find(
		{ rid: { $in: rids }, ts: { $gte: since }, t: { $exists: false } },
		{ projection: { _id: 1, msg: 1, u: 1, ts: 1, customFields: 1 } },
	).toArray();

	if (rawMessages.length === 0) {
		console.log('[HPN Export] No archived messages in the last 30 days — skipping batch');
		return;
	}

	const messages = rawMessages.map((msg) => ({
		id: msg._id,
		roomKey: (msg.customFields as any)?.hpnOriginalRoomKey ?? 'unknown',
		authorUsername: msg.u?.username ?? 'unknown',
		text: msg.msg ?? '',
		timestamp: (msg.ts as Date).toISOString(),
	}));

	const batchId = await createDataExportBatch(messages as any, 30);
	console.log(`[HPN Export] Batch ${batchId} created with ${messages.length} messages`);

	await notifyN8n(batchId, messages.length);

	// Post notice to admin insights room (also looked up by key)
	let insightsRoom = await Rooms.findOne({ 'customFields.hpnRoomKey': 'admin-insights' } as any);
	if (!insightsRoom) {
		const byName = await Rooms.findOneByName('hpn-admin-insights');
		if (byName) {
			await Rooms.updateOne({ _id: byName._id } as any, { $set: { 'customFields.hpnRoomKey': 'admin-insights' } } as any);
			insightsRoom = byName;
		} else {
			await createRoom('p', 'hpn-admin-insights', adminUser, [], false, false, {
				fname: 'HPN Admin Insights',
				description: 'Automated insights and data mining reports',
				customFields: { hpnManaged: true, hpnRoomKey: 'admin-insights' },
			});
			insightsRoom = await Rooms.findOne({ 'customFields.hpnRoomKey': 'admin-insights' } as any);
		}
	}

	if (insightsRoom) {
		const rootUrl = (process.env.ROOT_URL ?? 'http://localhost:3000').replace(/\/$/, '');
		const exportSecret = process.env.HPN_EXPORT_SECRET ?? '';
		const batchParam = encodeURIComponent(batchId);
		const jsonUrl = `${rootUrl}/hpn/export/data.json?batch=${batchParam}&key=${encodeURIComponent(exportSecret)}`;
		const txtUrl = `${rootUrl}/hpn/export/data.txt?batch=${batchParam}&key=${encodeURIComponent(exportSecret)}`;
		const n8nJsonUrl = `${rootUrl}/hpn/export/data.json?batch=${batchParam}`;

		await Messages.insertOne({
			rid: insightsRoom._id,
			msg:
				`📦 **Weekly Data Export Ready** — ${messages.length} messages collected (last 30 days)\n\n` +
				`Batch ID: \`${batchId}\`\n\n` +
				`**Download:**\n` +
				`[Download JSON](${jsonUrl}) · [Download TXT](${txtUrl})\n\n` +
				`**n8n API pull** _(requires x-hpn-export-key header)_:\n` +
				`\`GET ${n8nJsonUrl}\`\n\n` +
				`_Connect n8n to process this data — see docs/HPN_OPERATIONS.md for setup._`,
			ts: new Date(),
			u: { _id: adminUser._id, username: adminUser.username || 'admin', name: adminUser.name || 'HPN Admin' },
			_updatedAt: new Date(),
			customFields: { hpnAutoGenerated: true },
		} as any);
	}

	console.log('[HPN Export] Weekly data export complete');
}

/** Register HPN archive and data mining cron jobs */
export async function hpnArchiveCron(): Promise<void> {
	// Run daily at 2am — archive messages older than 7 days
	await cronJobs.add('hpn-archive-messages', '0 2 * * *', async () => {
		try {
			await archiveOldMessages();
		} catch (err) {
			console.error('[HPN Archive] Error:', err);
		}
	});

	// Run weekly on Monday at 3am — collect raw data and notify n8n
	await cronJobs.add('hpn-mine-topics', '0 3 * * 1', async () => {
		try {
			await collectAndExportData();
		} catch (err) {
			console.error('[HPN Export] Error:', err);
		}
	});

	// Run weekly on Monday at 4am — recalculate directory ranking scores
	await cronJobs.add('hpn-directory-scores', '0 4 * * 1', async () => {
		try {
			await recalculateDirectoryScores();
		} catch (err) {
			console.error('[HPN Directory] Score recalculation error:', err);
		}
	});

	// Run on the 1st of each month at 5am — delete export batches older than retention period
	await cronJobs.add('hpn-cleanup-exports', '0 5 1 * *', async () => {
		try {
			await cleanupOldExports();
		} catch (err) {
			console.error('[HPN Export] Cleanup error:', err);
		}
	});
}
