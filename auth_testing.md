# Roobani Auth Testing Notes

## Emergent Google Auth
- Login button redirects to `https://auth.emergentagent.com/?redirect=<window.location.origin>/dashboard`
- After Google auth, user returns with `#session_id=<token>` in URL fragment
- Frontend `AppRouter` detects `session_id` in `location.hash` during render and renders `<AuthCallback>`
- `AuthCallback` POSTs `{ session_id }` to backend `POST /api/auth/session`
- Backend calls `GET https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data` with `X-Session-ID` header
- Backend creates/updates user (`user_id = user_<uuid12>`), creates session in `user_sessions` (7d expiry), sets httpOnly `session_token` cookie (`secure=True`, `samesite=none`, `path=/`)
- Frontend then navigates to `/dashboard`

## Email/Password Auth
- `POST /api/auth/register` with `{ full_name, email, password, consent }` → creates user with bcrypt hash, returns 201
- `POST /api/auth/login` with `{ email, password }` → verifies bcrypt, creates session, sets `session_token` cookie
- Account lockout after 5 failed login attempts (15-minute lockout)
- `POST /api/auth/logout` → deletes session in DB, clears cookie

## Common endpoints
- `GET /api/auth/me` → reads `session_token` cookie OR Authorization Bearer, returns user JSON or 401
- `GET /api/auth/google/start` → returns the Emergent Google Auth URL with the redirect

## Test Credentials
See `/app/memory/test_credentials.md`.
