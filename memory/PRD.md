# Roobani Platform — PRD

## Original problem statement
Imported https://github.com/roobani2026/Roobani. Client's IT consultant produced a
comprehensive remediation list across admin security, admin UX, public site brand,
SEO, performance, observability, and support channels. Work is being delivered in
4 phases (A→D).

## Architecture
- Backend: FastAPI (Python 3.11) + Motor MongoDB, custom session-cookie auth,
  Fernet field-level encryption, bcrypt password hashing, rate-limited via custom
  in-memory bucket (now keyed per ip+rule+path), Resend for transactional email,
  Stripe Checkout (test mode), CoinGecko quotes via httpx/websockets.
- Frontend: React 19 + CRA + React Router 6, axios with credentials, Radix UI
  primitives + Tailwind, Zod for client-side schema validation, top-level
  ErrorBoundary, sonner for toasts.
- Storage collections: users, admin_users, admin_sessions, admin_audit,
  mfa_challenges (TTL 15min), holdings, withdrawals, customer_assignments,
  site_settings.

## User personas
1. Super admin (access_level=0): root operations, manages other admins, settings,
   approves withdrawals, sees the audit log.
2. Manager admin (access_level=1): scoped to assigned customers only.
3. Customer: signs up at /signup, can view portfolio, request withdrawals.

## Core requirements (static)
- Admin gateway must enforce MFA.
- Audit log must capture every admin write with actor, IP, user-agent, and
  before/after field-level diff.
- Hard separation between admin and customer auth surfaces.
- All third-party keys/URLs in env vars only.
- Responsive + accessible UI; no client-side crashes leak past an ErrorBoundary.

## Implemented (with dates)
### 2026-06-12 — Repo import
- Cloned roobani2026/Roobani into /app, preserving .git and .emergent.
- Installed Python deps and yarn deps; both services running under supervisor.

### 2026-06-12 — Phase A: Foundations & Security
- **Env-var audit**: confirmed no hard-coded secrets/URLs in client code beyond
  intentional Emergent OAuth endpoints and Stripe sk_test fallback.
- **TOTP MFA (admin-only)**:
  - New collection `mfa_challenges` with 15-minute TTL index.
  - New fields on `admin_users`: `mfa_enabled`, `totp_secret_enc` (Fernet),
    `recovery_codes_hashed[]` (bcrypt), `mfa_enrolled_at`.
  - `POST /api/admin/auth/login` → returns `mfa_setup_required` OR `mfa_required`
    + `challenge_token`. NEVER sets session at this step.
  - `POST /api/admin/auth/mfa/setup` → first enrolment (challenge_token + 6-digit
    code) → returns admin + 8 single-use recovery codes (shown ONCE).
  - `POST /api/admin/auth/mfa/verify` → subsequent logins (accepts TOTP or a
    recovery code; recovery codes are removed on use).
  - `POST /api/admin/auth/mfa/disable` → self-disable. Requires password + code.
  - `POST /api/admin/auth/mfa/force-disable` → super-admin only; revokes target's
    sessions and resets their MFA so they re-enrol on next login.
  - `POST /api/admin/auth/mfa/recovery/regenerate` → fresh codes (password + TOTP).
- **Audit log v2**:
  - `_audit()` now captures `ip`, `user_agent`, optional field-level `diff`.
  - All 17 admin-write call sites (admins CRUD, customers CRUD/assign,
    holdings adjust, settings, withdrawals, MFA events) backfilled to pass
    `request=request` and (where applicable) `before=/after=` snapshots.
  - `GET /api/admin/audit` now supports `q`, `action`, `admin_id`, `target_type`,
    `from_date`, `to_date`, `offset`, `limit` and returns `{items, total, limit,
    offset}`. Each row carries IP, UA, diff.
  - Frontend `AdminAudit` page rebuilt: filter bar, pagination, row-level
    expansion showing diff table and UA, CSV export of visible page.
- **React ErrorBoundary**: wraps both the admin and customer route trees in
  `App.js`; renders a recovery card with retry / reload buttons.
- **Zod validation**: admin login + MFA forms wired to Zod; inline a11y-correct
  error messages with `aria-invalid` + `aria-describedby`.
- **Semantic HTML / a11y**: admin login uses `<main>` + `<aside>` (decorative
  panel marked aria-hidden), focus-trapping inherited from Radix on existing
  modals; recovery codes panel is keyboard-actionable.
- **Rate-limit fix**: buckets now keyed on `(ip, rule, path)` so unrelated
  endpoints sharing a rule string no longer evict each other (e.g. admin login
  bursts won't 429 customer logins from the same IP).

## Backlog (next phases)
### 2026-06-12 — Phase B: Admin UX overhaul
- **Server-side list endpoints** upgraded across `/admin/customers`, `/admin/admins`, `/admin/withdrawals`: pagination (offset/limit clamped), sort whitelist (per endpoint), and multi-field server-side filters. Customers gained `q / kyc / plan / blocked / manager_admin_id`; admins gained `q / access_level / active`; withdrawals gained `q / from_date / to_date` on top of the existing `status_filter`.
- **Bulk endpoints with per-item error semantics**:
  - `POST /admin/customers/bulk` (actions: block / unblock / set_kyc) — manager scope respected per item; one audit entry per success with `meta.via='bulk'`.
  - `POST /admin/admins/bulk-delete` — same guardrails as single delete (self-delete blocked, last-super-admin guard, session + assignment cleanup), per-item failures returned in `failed`.
  - `POST /admin/withdrawals/bulk-decide` (approve/reject) — only `pending` items transition; per-item failure reasons returned. Each successful approve triggers `_execute_payout`.
- **Reusable `DataTable` component** at `/app/frontend/src/components/DataTable.jsx`:
  - Server-side load callback, sort headers, paginated footer.
  - Multi-condition filter bar declared by the caller (text/select/date).
  - **Per-user persisted preferences** (localStorage scoped by `tableId`): density (comfortable/compact), column visibility, column pin-left, page size.
  - **Row selection + bulk action bar** with confirm dialogs, danger styling, partial-failure toasts.
  - **CSV + JSON export** of selected items (or current page if none selected).
  - **Responsive card stack** below `md` — each row becomes an `<article>` with `<dl>` label/value rows; works with selection.
  - Skeleton loaders during fetch, role=alert error state, role=region bulk bar.
- **Admin pages refit** to the shared component: `AdminCustomers`, `AdminManagers`, `AdminWithdrawals`. `AdminAudit` retains its own filter bar from Phase A (deliberately not refit — its filter shape is distinct enough that the refactor would have cost more credits than it saved).
- **Sidebar regrouping** in `AdminLayout`:
  - Top-level: Dashboard.
  - Groups (collapsible, persisted in `roobani.admin.nav.groups`):
    - User Management → Customers, Admins & Managers (super-only).
    - Operations → Withdrawals.
    - Platform (super-only) → Settings.
    - Data & Logs (super-only) → Audit Log.
  - Active route force-opens its group even when collapsed.
- **Mobile drawer**: below `md`, top bar with "Menu" button toggles a `role="dialog" aria-modal="true"` left drawer; Escape closes it; backdrop click closes it.
- **Sidebar footer** now surfaces a 2FA badge (green ON / red OFF + remaining recovery codes).

## Backlog (next phases)
### P0 — Phase C: Public site & brand
- Inject brand character (logo, color palette, typography, hero copy) — needs
  client-supplied assets or a temporary AI-generated brand kit.
- Wire CTAs to real flows + a CRM (HubSpot OR Mailchimp).
- SEO: per-page meta, OG tags, sitemap.xml, robots.txt, image alt-text.
- Performance: WebP/SVG, purge unused CSS, lazy-load, code-split.

### P1 — Phase D: Observability & support
- Analytics (PostHog OR GA4) + Sentry for crash tracking.
- Support channel: support@roobani.com wiring + Telegram bot + FAQ accordion.

## Open questions for the client
- Brand assets (logo SVG, palette, typography, screenshots, rewritten copy)?
- CRM choice (HubSpot vs Mailchimp)?
- Analytics choice (PostHog vs GA4)?
- Live-chat: Crisp / Intercom / Tawk.to (free) — which? And the Telegram bot
  token (from @BotFather)?
- Stripe live key + Binance Pay merchant credentials — when client is onboarded.
