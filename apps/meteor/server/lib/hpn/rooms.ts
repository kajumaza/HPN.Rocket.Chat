import { Rooms, Users } from '@rocket.chat/models';

import { createRoom } from '../../../app/lib/server/functions/createRoom';

/**
 * HPN standard room definitions.
 * `key` is stored as customFields.hpnRoomKey — used for all code lookups.
 * `name` is the initial slug used only at creation time.
 * Admins can rename rooms freely without breaking any code dependencies.
 */
const HPN_ROOMS = [
	{
		key: 'general',
		name: 'hpn-general',
		fname: 'HPN General',
		description: 'Welcome to HPN — open to all members',
		type: 'c' as const, // public channel
		readOnly: false,
	},
	{
		key: 'students',
		name: 'hpn-students',
		fname: 'HPN Students',
		description: 'Student-level member discussions (Level 1+)',
		type: 'p' as const,
		readOnly: false,
	},
	{
		key: 'managers',
		name: 'hpn-managers',
		fname: 'HPN HR Managers',
		description: 'HR Manager discussions (Level 2+)',
		type: 'p' as const,
		readOnly: false,
	},
	{
		key: 'executives',
		name: 'hpn-executives',
		fname: 'HPN HR Executives',
		description: 'HR Executive discussions (Level 3)',
		type: 'p' as const,
		readOnly: false,
	},
	{
		key: 'business-directory',
		name: 'hpn-business-directory',
		fname: 'HPN Business Directory',
		description: 'Vetted suppliers and service providers — ranked by the community',
		type: 'p' as const,
		readOnly: true,
	},
	{
		key: 'job-board',
		name: 'hpn-job-board',
		fname: 'HPN Job Board',
		description: 'Post jobs and CVs — HR talent marketplace',
		type: 'p' as const,
		readOnly: false,
	},
	{
		key: 'admin',
		name: 'hpn-admin',
		fname: 'HPN Admin',
		description: 'Admin notifications and automated reports',
		type: 'p' as const,
		readOnly: false,
	},
];

/**
 * Create all standard HPN rooms on startup if they don't already exist.
 * Rooms are identified by customFields.hpnRoomKey — not by name — so they
 * can be freely renamed in the Admin UI without breaking code dependencies.
 */
export async function seedHpnRooms(): Promise<void> {
	const adminUser = await Users.findOne({ roles: 'admin' });
	if (!adminUser) {
		console.log('[HPN] No admin user found — skipping room creation. Rooms will be created on next startup after admin is set up.');
		return;
	}

	for (const room of HPN_ROOMS) {
		// Look up by hpnRoomKey first (rename-safe)
		let existing = await Rooms.findOne({ 'customFields.hpnRoomKey': room.key } as any);

		if (!existing) {
			// Migration: room may exist under original name but lack the key tag
			const byName = await Rooms.findOneByName(room.name);
			if (byName) {
				await Rooms.updateOne({ _id: byName._id } as any, { $set: { 'customFields.hpnRoomKey': room.key } } as any);
				console.log(`[HPN] Tagged existing room #${room.name} with hpnRoomKey: ${room.key}`);
				existing = byName;
			}
		}

		if (!existing) {
			try {
				await createRoom(room.type, room.name, adminUser, [], false, room.readOnly, {
					fname: room.fname,
					description: room.description,
					customFields: { hpnManaged: true, hpnRoomKey: room.key },
				});
				console.log(`[HPN] Created room: #${room.name} (key: ${room.key})`);
			} catch (err) {
				console.error(`[HPN] Failed to create room #${room.name}:`, err);
			}
		}
	}
}
