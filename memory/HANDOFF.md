# Roobani — Agent Handoff

> **Purpose**: continuous handoff brief. If the current agent runs out of
> credits / context / hits an unexpected crash, the next agent reads this
> file FIRST (before re-exploring the repo) and continues from the exact
> step recorded here.

> **Read order for any incoming agent**:
> 1. This file (`/app/memory/HANDOFF.md`) — where we stopped, what's next.
> 2. `/app/memory/PRD.md` — full product context, phases, what's shipped.
> 3. `/app/memory/test_credentials.md` — credentials for testing.
> 4. The most recent `/app/test_reports/iteration_*.json` — last QA verdict.

---

## Live state — last updated 2026-06-12 (post-iteration_8 fix landed)

### Where the current agent is in the loop
**Status**: Phase C (key-free) done. iteration_8 backend 19/19 pass. The
critical-minor finding from iteration_8 (CRM endpoints on the wrong admin
auth surface) has been **fixed**:
- `POST /api/admin/crm/resync` and `GET /api/admin/crm/status` now use
  `Depends(require_access_0)` (admin_session cookie + MFA-protected
  `admin_users.access_level=0`), not the legacy `require_admin`.
- The `_audit()` call in `admin_crm_resync` now uses the correct positional
  args (`admin["admin_id"]` as the first arg, not a kwargs splat).
- Endpoint definitions physically moved to **line 1616+** in `server.py`,
  after `require_access_0` is declared (was a NameError at module import).
- Legacy `/api/admin/leads`, `/api/admin/contacts`, `/api/admin/stats`
  kept on `require_admin` for now — they're orphan endpoints not used by
  the admin UI (which calls `/api/admin/dashboard` for those counts) and
  rewiring them is out of iteration_8 scope.

The user wants me to:
1. ✅ Set up this HANDOFF.md tripwire — done.
2. 🟡 Re-test the auth-surface fix with the testing subagent.
3. Then `finish()` Phase C and stop here (Phase D needs client keys).

### Next concrete action (if I drop dead here)
1. Re-run testing subagent on the auth-surface fix — task body:
   "Re-verify `/api/admin/crm/status` and `/api/admin/crm/resync` now require
   the admin_session cookie + access_level=0 (super admin via
   `/api/admin/auth/login` + MFA at `/api/admin/auth/mfa/verify`). The
   customer-side session_token should be rejected (401 or 403). The audit
   row written by `/admin/crm/resync` must have `admin_id` matching the
   `admin_users.admin_id` (format `adm_xxxx`), not a customer `user_xxxx`.
   Update `backend/tests/test_phase_c_seo_crm.py` to use the admin_session
   fixture (see Phase B tests for the helper). Run pytest, return verdict."
2. If 19/19 again, call `finish()` with PRD summarising Phase C delivery.

### Phase C delivered this iteration (2026-06-12)
- **C3 SEO**: `<SEO/>` Helmet component on every public + auth route. JSON-LD
  on /, /plans, /contact. `public/sitemap.xml` upgraded with `<lastmod>` +
  `<image:image>`. `index.html` deduplicated. `/about` removed from sitemap +
  `/api/sitemap.json` mirror; Contact canonicalises to `/contact`.
- **C4 perf**: `.png` → `.webp` swap in `data/plans.js`, Home hero, Contact
  visual (12 assets). Image alt-text audited (all good). Admin tree already
  code-split via `React.lazy`.
- **C5 HubSpot shape**: `_crm_push_contact()` no-ops with no key.
  `POST /api/admin/crm/resync` + `GET /api/admin/crm/status` added so the
  client backfills queued submissions with one POST when the key lands.
  **Auth surface**: super admin (admin_session + access_level=0 + MFA).

### Phase C NOT yet delivered (waiting on client keys)
- **C5 HubSpot live**: needs `HUBSPOT_API_KEY` in `backend/.env`. After that:
  restart backend, hit `POST /api/admin/crm/resync` once, monitor
  `GET /api/admin/crm/status` for `configured=true` + `pending → 0`.

### Phase D (not started — P1)
- Analytics (PostHog or GA4) + Sentry crash tracking.
- Support: `support@roobani.com` wiring + Telegram bot + FAQ accordion.

---

## Next concrete action for the agent picking this up

1. **Open**: `/app/backend/server.py`.
2. **Search for**: `admin_crm_resync`, `admin_crm_status`, then `/api/admin/contacts`, `/api/admin/leads` definitions.
3. **Change**:
   - `admin: dict = Depends(require_admin)` → `admin: dict = Depends(require_access_0)` on `admin_crm_resync` and `admin_crm_status`. Same for the contacts + leads admin listing endpoints — for consistency with the rest of `/api/admin/*`.
   - In `admin_crm_resync`, the `_audit(admin=admin, ...)` call's `admin` is
     now a real `admin_users` doc whose primary key is `admin_id`. The
     existing `_audit()` helper already pulls `admin['admin_id']` — verify.
4. **Restart backend**: `sudo supervisorctl restart backend`.
5. **Smoke-test**:
   ```bash
   curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8001/api/admin/crm/status        # → 401
   # Log in as admin@roobani.com via /api/admin/auth/login → /api/admin/auth/mfa/verify
   # → then with that admin_session cookie, GET /api/admin/crm/status → 200
   ```
6. **Re-run** the Phase C suite to ensure no regression on the resync no-op
   behaviour: `pytest backend/tests/test_phase_c_seo_crm.py -v`
   (the testing agent's suite will need a small fixture tweak to log in via
   the admin_session flow now — flag to QA on re-test).
7. **Call** `testing_agent_v3` once more with the auth-surface fix as the
   only delta.
8. **Then finish()** with PRD updated.

---

## Services running

| Service | Status | Notes |
|---|---|---|
| backend (FastAPI, :8001) | RUNNING | supervisor; hot-reload on .py |
| frontend (CRA dev, :3000) | RUNNING | supervisor; hot-reload |
| mongodb | RUNNING | local, MONGO_URL/DB_NAME from `.env` |
| nginx-code-proxy | RUNNING | platform |

External URL: `https://roobani-app.preview.emergentagent.com`
Note: `/robots.txt` on the public URL is CDN-intercepted by the preview
ingress. The actual file at `/app/frontend/public/robots.txt` is correct
and will serve in production.

---

## What's mocked / deferred / waiting on client keys

| Item | Status | Unblocked by |
|---|---|---|
| HubSpot CRM live push | shape wired, no-op without key | `HUBSPOT_API_KEY` in `backend/.env`, then POST `/api/admin/crm/resync` |
| Stripe live | test key already in env | client provides live secret |
| Binance Pay | not wired | client provides merchant creds |
| Sentry / PostHog / GA4 | not wired (Phase D) | client picks one + DSN |
| Telegram bot | not wired (Phase D) | client provides BotFather token |

No code path is silently faking data — when an integration is not
configured, the endpoint deliberately returns `{ok:false, reason:'... not
configured', ...}` and logs a warning.

---

## How to verify everything still works in 60 seconds

```bash
# Backend up?
curl -s http://localhost:8001/api/ | python3 -c "import sys,json;print(json.load(sys.stdin))"
# Expected: {"service":"roobani","status":"ok","time":"..."}

# Static assets via frontend?
curl -sI http://localhost:3000/sitemap.xml | head -1     # 200 OK
curl -sI http://localhost:3000/brand/hero_visual.webp    # 200 OK image/webp

# Sitemap mirror via backend?
curl -s http://localhost:8001/api/sitemap.json | python3 -c "import sys,json;print(len(json.load(sys.stdin)['routes']))"
# Expected: 6  (/, /plans, /contact, /privacy, /terms, /cookies)
```

---

## Stack reference (for incoming agent)

- **Backend**: FastAPI 0.118 + Motor (async Mongo) + Fernet for PII at rest.
- **Frontend**: CRA + React 19 + Tailwind + shadcn/ui + react-helmet-async.
- **Auth**:
  - **Customer**: `session_token` httpOnly cookie, set by `/api/auth/login`.
    `users.is_admin=true` exists for convenience but is **legacy** — see
    iteration_8 finding above; do not extend it.
  - **Admin**: `admin_session` httpOnly cookie, set by `/api/admin/auth/login`
    (+ MFA via `/api/admin/auth/mfa/verify`). Backed by `admin_users` with
    `access_level` ∈ {0 super, 1 manager}. **This is the canonical admin auth
    surface — all new `/api/admin/*` endpoints must use
    `Depends(require_access_0)` or `Depends(current_admin)`.**
- **Audit**: every admin write fires `_audit(...)` into `db.audit_logs`.
- **PII**: encrypt with `enc()`, decrypt with `dec()` (Fernet keyed off
  `ROOBANI_FERNET_KEY`; with no key set, a derived dev key is used).

---

## Tripwire policy (this agent's promise)

This file is updated **after every meaningful step** — not just at credit
exhaustion. If the next agent reads it and the timestamp/last-step
disagrees with the actual repo, that is a real divergence that needs
investigating (most likely an unrecorded edit).

If the agent runs out of credits before completing the auth-surface fix
above, do NOT roll back any in-flight edits — finish the swap from
`require_admin` → `require_access_0` on the four endpoints listed, restart
backend, and run the smoke-test. That is a 10-line edit; safe to land
without re-testing the whole Phase C suite.
