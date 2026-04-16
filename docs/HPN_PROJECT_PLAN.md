# HPN Platform — Project Plan

Living document. Update as work progresses.
For configuration/operations details see `docs/HPN_OPERATIONS.md`.
For dev environment setup see `CLAUDE.md`.

---

## Phase Status

| Phase | Description | Status |
|-------|-------------|--------|
| 1 | Infrastructure (Docker, MongoDB, NATS) | ✅ Done |
| 2 | Rebranding (web) | ✅ Done |
| 3+4 | Membership levels + room structure | ✅ Done |
| 5+6 | Business directory + supplier bot | ✅ Done |
| 7 | Badges + engagement scoring | ✅ Done |
| 8 | Payments (PayFast) | ✅ Done |
| 9 | Recruitment channel | ✅ Done |
| 10 | Polls / broadcast | ✅ Done |
| 11 | Archive + raw data export + n8n | ✅ Done |
| 12 | Mobile apps (Android + iOS) | ⏳ Pending |
| 13 | Onboarding UI | ⏳ Pending |
| 14 | n8n data analysis workflows | ⏳ Pending |
| 15 | Admin insights from n8n → app | ⏳ Pending |

---

## Completed Work (detail)

### Phase 1 — Infrastructure
- `docker-compose.dev.yml` — MongoDB + NATS via Docker
- `.env` at `apps/meteor/.env`
- `start-dev.sh` helper script

### Phase 2 — Rebranding
- App name: HPN (forced via `OVERWRITE_SETTING_Site_Name`)
- Sidebar background: `#1A1A1A`
- Login page background: `apps/meteor/public/images/hpn-background.jpg` (from `CI/Background.jpeg`)
- Login page logo: `apps/meteor/public/images/hpn-logo.jpg` (from `CI/hpn-Logo.jpg`)
- Login page white overlay: 40% opacity over background, behind the login card
- Logo position: center-left of login page (`left: 25%, top: 45%` fixed)
- Package: `packages/web-ui-registration/src/template/HorizontalTemplate.tsx`
  - Requires `yarn build` in `packages/web-ui-registration/` after changes

### Phase 3+4 — Membership & Rooms
- Roles: `hpn-free`, `hpn-student`, `hpn-manager`, `hpn-executive`, `hpn-supplier`
- Rooms auto-seeded on startup: `#hpn-general`, `#hpn-students`, `#hpn-managers`, `#hpn-executives`, `#hpn-business-directory`, `#hpn-recruitment`
- Files: `server/lib/hpn/roles.ts`, `server/lib/hpn/rooms.ts`, `server/lib/hpn/onboarding.ts`

### Phase 5+6 — Business Directory + Bot
- Directory submission, approval, editing, reviews
- Category management
- Admin panel at `/admin/hpn-directory` (tabs: Pending, Edits, All Listings, Categories, Bot Keywords)
- Full description field uses `RichTextarea` (from `HpnJobBoardPage.tsx`)
- HTML rendered with `dangerouslySetInnerHTML` + DOMPurify in directory cards and admin panel
- **Supplier bot** (`server/lib/hpn/supplierBot.ts`) — built directly in Meteor server (not apps-engine)
  - Two-stage pipeline: keyword gate → Claude Haiku intent classifier → Claude Haiku supplier matcher
  - Keyword gate is two-layer: static regex (`SUPPLIER_KEYWORDS`) + dynamic `Set<string>` from MongoDB
  - Dynamic keywords auto-extracted from approved listing `categories` and `services` on approval
  - Admin can add/remove keywords manually via Admin → Directory → Bot Keywords tab
  - Keywords stored in `hpn_bot_keywords` MongoDB collection (unique index on `keyword`)
  - In-memory Set refreshed at startup and on every add/remove/approve
  - Unsolicited recommendation blocking via `beforeSaveMessage` callback + DM notice to sender
  - **Thread reply moderation** — when bot posts supplier recommendations, replies recommending businesses NOT on the bot's list are deleted in real time
    - Uses `afterSaveMessage` (not `beforeSaveMessage` — RC v8 `MessageService` only fires `afterSaveMessage` for thread replies)
    - Fast path: in-memory `botRecommendationContext` Map keyed by original message `_id` (24h TTL)
    - DB fallback: queries `rocketchat_message` for thread root → confirms supplier request → finds most recent bot message in room
    - Claude Haiku classifies reply as `BLOCK` or `ALLOW` given bot's recommendation text as context
    - Deletion uses `Messages.removeById` + `api.broadcast('notify.deleteMessageBulk', ...)` for immediate real-time client update
    - Sender receives the same DM as top-level unsolicited recommendations
  - Moderated rooms: `hpn-general`, `hpn-students`, `hpn-managers`, `hpn-executives`
  - Requires `CLAUDE_API_KEY` in env — falls back to plain directory listing if absent
  - Dev startup: use `~/start-hpn.sh` to ensure `CLAUDE_API_KEY` is exported before Meteor starts

### Phase 7 — Badges + Engagement
- Badge definitions and engagement points in `server/lib/hpn/engagement.ts`
- Message callback in `server/lib/hpn/engagementCallbacks.ts`

### Phase 8 — Payments (PayFast)
- Replaced Stripe (not available in SA) with PayFast
- ITN webhook at `POST /hpn/webhooks/payfast`
- Signature: MD5 of form fields + passphrase
- User identity via `custom_str1` (userId), plan via `custom_str2`
- Files: `server/lib/hpn/payments.ts`, `server/routes/hpnPayments.ts`
- Credentials: set in `.env` (`PAYFAST_MERCHANT_ID`, `PAYFAST_MERCHANT_KEY`, `PAYFAST_PASSPHRASE`)

### Phase 9 — Recruitment Channel
- `/post-job` and `/post-cv` slash commands
- Uses `RichTextarea` for multi-line input
- Files in `apps/hpn-community-app/`

### Phase 10 — Polls / Broadcast
- Uses Rocket.Chat's built-in announcement + poll app (no custom code)

### Phase 11 — Archive + Data Export + n8n
- Daily at 2am: messages >7 days old moved from active rooms to `-archive` rooms
- Monday at 3am: raw message data collected and stored as export batch in `hpn_data_exports` MongoDB collection
- Monday at 4am: business directory scores recalculated
- 1st of month at 5am: export batches older than `HPN_DATA_EXPORT_RETENTION_DAYS` (default 90 days) deleted
- n8n notification: POST to `N8N_WEBHOOK_URL` with batch ID + pull URL
- Export endpoints: `/hpn/export/batches`, `/hpn/export/data.json`, `/hpn/export/data.txt`
- Files: `server/cron/hpnArchive.ts`, `server/lib/hpn/dataExport.ts`, `server/routes/hpnDataExport.ts`

---

## Pending Work

### Phase 12 — Mobile Apps
- Clone Rocket.Chat React Native repo (separate from this monorepo)
- Replace bundle ID → `com.hpn.community`, app name → `HPN`
- Replace icons, splash screens, brand colors
- Configure default server URL to HPN production server
- Requires: Apple Developer account ($99/yr) + Google Play Developer account
- Push notifications: FCM (Android) + APNs (iOS) — configure in RC Admin → Push

### Phase 13 — Onboarding UI
- Client-side registration questionnaire (runs after account creation)
- Calls `hpn/onboarding/submit` Meteor method (already built in `server/lib/hpn/methods.ts`)
- Fields: role/seniority, industry, interests → determines HPN tier assignment
- Needs: new React page/modal, probably at `/onboarding` route

### Phase 14 — n8n Data Analysis Workflows
- Build n8n workflow triggered by `hpn.data.ready` webhook
- Pull JSON from `/hpn/export/data.json`
- AI-based analysis: recurring questions, trends, topics, sentiment
- Output: structured insights JSON
- See `docs/HPN_OPERATIONS.md` → Section 2 for n8n setup guide

### Phase 15 — Admin Insights (n8n → App)
- Pull analysis results from n8n back into `#hpn-admin-insights` room
- OR build a dedicated admin insights dashboard page
- Depends on: Phase 14 being complete and producing a stable output format

---

## Known Issues / Tech Debt
- No end-to-end tests exist — nothing has been formally tested yet
- PayFast credentials still `REPLACE_ME` — needs real merchant account
- Logo SVGs in email templates are still code-generated placeholders — replace with actual CI assets
- `HPN_EXPORT_SECRET` still `REPLACE_ME` — must be set before export endpoints work
- `OVERWRITE_SETTING_theme-color-sidebar-background` cannot be set via `.env` (hyphen issue) — set manually in Admin UI → Layout → Colors
- Mobile app (Phase 12) requires Apple + Google developer accounts — budget and timeline TBD

---

## External Integrations (post-MVP)
| Integration | Purpose | Status |
|---|---|---|
| PayFast | Membership payments | ✅ Integrated (awaiting credentials) |
| n8n | Data analysis workflow | 🔧 Endpoints ready, workflow not built yet |
| Flink | Recruitment / job listings | ⏳ Pending — REST API whitelabel |
| Zora | TBD | ⏳ Pending |
| Legicheck | TBD | ⏳ Pending |
