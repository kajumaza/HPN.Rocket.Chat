# HPN Platform — Operations & Configuration Guide

This document covers every configurable aspect of the HPN platform.
For developer setup (WSL2, starting the app, etc.) see `CLAUDE.md` in the repo root.

---

## 1. PayFast Payment Gateway

PayFast is the payment provider used for HPN membership subscriptions.

### Credentials (`.env` file)
File location: `apps/meteor/.env`

| Variable | Description |
|---|---|
| `PAYFAST_MERCHANT_ID` | From PayFast dashboard → Settings → Integration |
| `PAYFAST_MERCHANT_KEY` | From PayFast dashboard → Settings → Integration |
| `PAYFAST_PASSPHRASE` | Set in PayFast dashboard → Settings → Integration → Passphrase (recommended) |
| `PAYFAST_SANDBOX` | `true` for testing, `false` for live payments |

### How to get credentials
1. Sign up at payfast.co.za → create a Merchant account
2. Go to Settings → Integration
3. Copy your **Merchant ID** and **Merchant Key**
4. Set a **Passphrase** (strongly recommended — prevents signature spoofing)
5. Update the `.env` file and restart the app

### Webhook URL to register with PayFast
PayFast needs to call your server when a payment is made. Set this in your payment form's `notify_url` field:
```
https://your-domain.com/hpn/webhooks/payfast
```
For local testing: use ngrok (`ngrok http 3000`) and set `notify_url=https://<ngrok-url>/hpn/webhooks/payfast`

### Membership plan identifiers
These are the values sent in `custom_str2` from your payment form:
| Plan | `custom_str2` value |
|---|---|
| Student | `hpn-student` |
| Manager | `hpn-manager` |
| Executive | `hpn-executive` |

### Switching sandbox → production
Change `PAYFAST_SANDBOX=false` in `.env` and restart Meteor.

---

## 2. Data Export & n8n Integration

The platform collects raw community message data weekly and stores it for export. n8n (or any HTTP client) can retrieve this data for AI-based analysis.

### How it works
Every Monday at 3am the server:
1. Collects all archived messages from the last 30 days
2. Stores them as a batch in MongoDB (`hpn_data_exports` collection)
3. POSTs a notification to your n8n webhook URL (if configured)
4. Posts a notice to the `#hpn-admin-insights` room with download links

### Environment variables (`.env` file)
| Variable | Description | Default |
|---|---|---|
| `N8N_WEBHOOK_URL` | Your n8n Webhook Trigger URL | _(blank = disabled)_ |
| `HPN_EXPORT_SECRET` | Secret key for accessing export endpoints | **Must be set** |
| `HPN_DATA_EXPORT_RETENTION_DAYS` | Days before old batches are auto-deleted | `90` |

### Setting up n8n

**Step 1 — Create a Webhook Trigger in n8n:**
1. In n8n, add a **Webhook** node (Trigger)
2. Set method to `POST`
3. Copy the webhook URL (looks like `https://your-n8n.com/webhook/abc123`)
4. Paste it into `N8N_WEBHOOK_URL` in `.env`

**Step 2 — Pull the data in n8n:**
After the webhook fires, add an **HTTP Request** node:
- Method: `GET`
- URL: use `{{ $json.pullUrl }}` from the webhook payload
- Header: `x-hpn-export-key: {{ $json.apiKey }}`

**Webhook notification payload** (what n8n receives):
```json
{
  "event": "hpn.data.ready",
  "batchId": "2026-03-24T03:00:00.000Z",
  "messageCount": 47,
  "createdAt": "2026-03-24T03:00:00.000Z",
  "pullUrl": "https://your-domain.com/hpn/export/data.json?batch=...",
  "apiKey": "<your HPN_EXPORT_SECRET value>"
}
```

### Manually downloading export data

All endpoints require the header `x-hpn-export-key: <HPN_EXPORT_SECRET>`.

**List available batches:**
```bash
curl -H "x-hpn-export-key: YOUR_SECRET" https://your-domain.com/hpn/export/batches
```

**Download a batch as JSON:**
```bash
curl -H "x-hpn-export-key: YOUR_SECRET" \
  "https://your-domain.com/hpn/export/data.json?batch=2026-03-24T03:00:00.000Z" \
  -o export.json
```

**Download a batch as plain text:**
```bash
curl -H "x-hpn-export-key: YOUR_SECRET" \
  "https://your-domain.com/hpn/export/data.txt?batch=2026-03-24T03:00:00.000Z" \
  -o export.txt
```

For local dev, replace the domain with `http://localhost:3000`.

### Changing the data retention period
Edit `HPN_DATA_EXPORT_RETENTION_DAYS` in `.env`. Batches older than this are deleted on the 1st of each month at 5am. Default is 90 days. Data is **never** deleted on export — only by the monthly cleanup job.

---

## 3. Login Page Branding

### Background image
- **File:** `apps/meteor/public/images/hpn-background.jpg`
- **To change:** Replace this file with a new image (keep the same filename), or upload via Admin UI → Assets → `background` asset
- Must be synced to WSL2: `cp "/mnt/c/Users/admin/Documents/HPN Community App/HPN.Rocket.Chat/apps/meteor/public/images/hpn-background.jpg" ~/HPN.Rocket.Chat/apps/meteor/public/images/`

### Logo on login page
- **File:** `apps/meteor/public/images/hpn-logo.jpg`
- **To change:** Replace this file with a new image (keep the same filename)
- Source: originally copied from `CI/hpn-Logo.jpg`
- Must be synced to WSL2 (same pattern as above)

### White overlay intensity
- **File:** `packages/web-ui-registration/src/template/HorizontalTemplate.tsx`
- Find: `background: 'rgba(255,255,255,0.4)'`
- Change `0.4` to adjust opacity (0 = no overlay, 1 = fully white)
- After editing, rebuild: `cd ~/HPN.Rocket.Chat/packages/web-ui-registration && yarn build`

### Logo position
- Same file as above (`HorizontalTemplate.tsx`)
- Find: `left: '25%', top: '45%'`
- Adjust percentages to reposition (relative to the full viewport)

---

## 4. Archive & Cron Schedule

### Cron jobs
| Job | Schedule | What it does |
|---|---|---|
| `hpn-archive-messages` | Daily at 2am | Moves messages >7 days old from active rooms to archive rooms |
| `hpn-mine-topics` | Monday at 3am | Collects raw data batch, stores to MongoDB, notifies n8n |
| `hpn-directory-scores` | Monday at 4am | Recalculates business directory ranking scores |
| `hpn-cleanup-exports` | 1st of month at 5am | Deletes export batches older than `HPN_DATA_EXPORT_RETENTION_DAYS` |

**File:** `apps/meteor/server/cron/hpnArchive.ts`

To change a schedule, edit the cron expression (2nd argument to `cronJobs.add()`). Format: `minute hour day month weekday`.

### Force-trigger cron jobs (dev only)
Add a temporary Meteor method to `apps/meteor/server/lib/hpn/index.ts`:
```ts
import { collectAndExportData } from '../cron/hpnArchive'; // adjust import if needed

Meteor.methods({
  async 'hpn/dev/run-archive'() { /* call archiveOldMessages */ },
  async 'hpn/dev/run-export'() { /* call collectAndExportData */ },
});
```
Then in the browser console (while logged in as admin):
```js
Meteor.call('hpn/dev/run-export', (err, res) => console.log(err, res))
```

### Active rooms being archived
Defined in `hpnArchive.ts`:
```ts
const HPN_ACTIVE_ROOMS = ['hpn-general', 'hpn-students', 'hpn-managers', 'hpn-executives'];
```
Archive rooms are created automatically with the `-archive` suffix.

### Changing the archive age (default 7 days)
In `hpnArchive.ts`, find:
```ts
const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
```
Change `7` to the desired number of days.

---

## 5. Settings Forced on Every Restart

`applyHpnSettings()` in `server/lib/hpn/index.ts` runs on every startup and forces the following values. **Do not try to change these via Admin UI** — they will revert on the next restart.

| Setting | Forced value | Why forced |
|---|---|---|
| Sidenav footer (light + dark) | HPN logo HTML | Ensures branding survives RC updates |
| Login page — hide RC logo/title/powered by | `true` | Removes RC branding |
| Read receipts | `true` | Required HPN feature |
| Push — request content from server | `true` | Required for push privacy |
| Video mobile ringing | `true` | Required HPN feature |
| NPS surveys | `false` | RC sends these via rocket.cat — not relevant for HPN |
| Role badges (built-in grey) | `false` | HPN uses its own coloured badges |
| HPN Bob username/name | `hpn.bob` / `HPN Bob` | RC's startup resets rocket.cat on every boot |
| Enterprise gate fields | cleared | Unlocks read receipts, push, video features on community edition |
| Federation settings | hidden | Not used by HPN — removed from Admin UI |
| Badge color field type | `string` | Fixes a RC bug where the dropdown is broken |

### Custom CSS
Custom CSS set via Admin → Layout → Custom CSS **does persist** across restarts. Do not add a `theme-custom-css` override to `applyHpnSettings()` — it will wipe whatever is set in the UI.

### What you can safely change via Admin UI
Everything not in the table above. Changes to those settings persist in MongoDB and survive restarts normally.

---

## 6. Admin Rooms

These private rooms are created automatically at startup:

| Room name | Purpose | Access |
|---|---|---|
| `hpn-admin-insights` | Automated reports (export notices) | Admin only |
| `hpn-admin` | Directory submission notifications | Admin only |
| `hpn-general-archive` | Archived messages from #hpn-general | Admin only |
| `hpn-students-archive` | Archived messages from #hpn-students | Admin only |
| `hpn-managers-archive` | Archived messages from #hpn-managers | Admin only |
| `hpn-executives-archive` | Archived messages from #hpn-executives | Admin only |

To access: Log in as admin → click the search icon → type the room name → join.

---

## 6. Membership Tiers & Roles

| Level | Role ID | Description |
|---|---|---|
| 0 | `hpn-free` | Free members |
| 1 | `hpn-student` | Paid — Student tier |
| 2 | `hpn-manager` | Paid — Manager tier |
| 3 | `hpn-executive` | Paid — Executive tier |
| — | `hpn-supplier` | Business directory supplier |

### Manually assigning a role (MongoDB)
In WSL2, connect via `mongosh mongodb://127.0.0.1:3001/meteor` then:
```js
// Add a role to a user
db.users.updateOne(
  { username: 'some-username' },
  { $addToSet: { roles: 'hpn-manager' } }
)

// Remove a role
db.users.updateOne(
  { username: 'some-username' },
  { $pull: { roles: 'hpn-manager' } }
)
```
After changing roles the user needs to log out and back in for room access to update.

---

## 7. Checking Data in MongoDB

Connect: `mongosh mongodb://127.0.0.1:3001/meteor` (in WSL2, while Meteor is running)

```js
// Count archived messages
db.rocketchat_message.find({ 'customFields.hpnArchived': true }).count()

// List archive rooms
db.rocketchat_room.find({ name: /archive/ }, { name: 1 }).toArray()

// List export batches
db.hpn_data_exports.find({}, { batchId: 1, messageCount: 1, createdAt: 1, notifiedN8n: 1 }).sort({ createdAt: -1 }).toArray()

// View a specific batch
db.hpn_data_exports.findOne({ _id: '2026-03-24T03:00:00.000Z' })

// List directory listings
db.hpn_directory_listings.find({}, { businessName: 1, status: 1, score: 1 }).toArray()
```

---

## 8. Pulling Rocket.Chat Updates

HPN is a fork of Rocket.Chat. When RC releases a new version, pulling it into the fork carries some risk. Follow this process to do it safely.

### Our custom files — safe (no conflict risk)
These files don't exist in upstream RC and will never conflict:
- `apps/meteor/server/lib/hpn/` — all HPN server logic
- `apps/meteor/server/routes/hpnPayments.ts`
- `apps/meteor/server/cron/hpnArchive.ts`
- `apps/meteor/client/views/admin/hpnSettings/`
- `apps/hpn-community-app/`
- `docs/HPN_OPERATIONS.md`

### RC files we modified — require manual review on update
These files exist in upstream RC and we changed them. Git will flag them as conflicts on merge:

| File | What we changed |
|---|---|
| `apps/meteor/client/sidebar/footer/SidebarFooterDefault.tsx` | Added Business Directory, Job Board, Polls nav items |
| `apps/meteor/server/startup/cron.ts` | Added `hpnArchiveCron()` call to register HPN cron jobs at startup |
| `apps/meteor/ee/app/license/server/canEnableApp.ts` | Removed enterprise gate for private apps |
| `apps/meteor/client/views/marketplace/hooks/usePrivateAppsEnabled.ts` | Always returns true |

All our changes in these files are marked with `// HPN:` comments, making them easy to find and re-apply after resolving a conflict.

### Step-by-step update process

```bash
# 1. Fetch upstream changes (don't pull yet)
cd ~/HPN.Rocket.Chat
git remote add upstream https://github.com/RocketChat/Rocket.Chat.git  # first time only
git fetch upstream

# 2. See what changed in upstream vs our fork
git log HEAD..upstream/develop --oneline | head -30

# 3. Check if our modified files were touched by RC
git diff HEAD upstream/develop -- apps/meteor/client/sidebar/footer/SidebarFooterDefault.tsx
git diff HEAD upstream/develop -- apps/meteor/server/startup/cron.ts

# 4. Merge (expect conflicts in the files listed above)
git merge upstream/develop

# 5. Resolve conflicts — keep RC's changes AND our HPN additions
# Search for <<<<<<< markers, re-apply the // HPN: sections

# 6. Restart and test
export OVERWRITE_SETTING_Site_Name=HPN
meteor --exclude-archs "web.browser.legacy,web.cordova"
```

### What to test after an update
1. HPN nav items appear in the sidebar (Business Directory, Job Board, Polls)
2. Cron jobs register at startup (check Meteor logs for `[HPN Archive]`)
3. Admin → Apps → Private Apps shows the upload button (not an upgrade wall)
4. Membership roles still exist: `hpn-free`, `hpn-student`, `hpn-manager`, `hpn-executive`
5. PayFast webhook endpoint responds at `/hpn/webhooks/payfast`
6. **Check HPN Bob avatar** — Admin → Users → search `hpn.bob` → confirm avatar is still the HPN-branded image. The username and display name are re-applied automatically on every startup, but the avatar must be restored manually if lost.

### HPN Bob (internally rocket.cat)
RC uses this user for system messages (video conference notifications, team invites, email inbox replies). We cannot disable it, so we rebrand it.

| Field | Value |
|---|---|
| Internal `_id` | `rocket.cat` (never changes — RC uses this to find the user) |
| Username | `hpn.bob` (re-applied automatically on every startup via `applyHpnSettings`) |
| Display name | `HPN Bob` (re-applied automatically on every startup) |
| Avatar | HPN-branded image — **must be restored manually after updates if lost** |

The username and name are enforced in `applyHpnSettings()` in `server/lib/hpn/index.ts`, so they survive RC updates automatically. Only the avatar needs manual attention:
1. Admin → Users → search `hpn.bob`
2. If avatar has reset: click Edit → upload HPN-branded avatar → Save

### Risk areas to watch
- **Sidebar changes** — RC updates the sidebar layout occasionally; our nav additions may need repositioning
- **Apps Engine API changes** — if RC updates `@rocket.chat/apps-engine`, slash command interfaces may change (affects `/post-job`, `/post-cv`, `/directory`)
- **Settings API** — if RC changes `settingsRegistry`, our HPN admin settings panel may need updating
