"""Shared singletons and dependencies for the Roobani backend.

This module holds:
- Mongo client/db handles
- Encryption (Fernet) + enc/dec PII helpers
- Helper utilities (now_utc, gen_id, _serialize, _make_token)
- Rate limiting (in-house token-bucket factory + slowapi limiter)
- Resend email config + _email_dispatch
- Session helpers (user + admin)
- FastAPI dependencies: current_user, require_admin, current_admin, require_access_0
- Shared business helpers: _audit, _notify, _public_user, _public_admin

The route modules under `routes/*.py` import from here. `server.py` only
imports for app construction (CORS, startup, shutdown) and includes routers.
"""
from __future__ import annotations

import asyncio
import logging
import os
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Annotated, Any

import bcrypt
import resend
from cryptography.fernet import Fernet
from dotenv import load_dotenv
from fastapi import Cookie, Depends, Header, HTTPException, Request, Response
from motor.motor_asyncio import AsyncIOMotorClient
from slowapi import Limiter
from slowapi.util import get_remote_address


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
logger = logging.getLogger("roobani")


# ---------------------------------------------------------------------------
# Mongo
# ---------------------------------------------------------------------------
mongo_url = os.environ["MONGO_URL"]
db_name = os.environ["DB_NAME"]
client = AsyncIOMotorClient(mongo_url)
db = client[db_name]


# ---------------------------------------------------------------------------
# Encryption (deterministic per deploy)
# ---------------------------------------------------------------------------
def _get_fernet() -> Fernet:
    key = os.environ.get("ROOBANI_FERNET_KEY")
    if not key:
        import base64
        import hashlib
        seed = (mongo_url + "::" + db_name + "::roobani-pii-v1").encode("utf-8")
        key = base64.urlsafe_b64encode(hashlib.sha256(seed).digest()).decode("ascii")
    return Fernet(key.encode("ascii") if isinstance(key, str) else key)


fernet = _get_fernet()


def enc(value: str) -> str:
    return fernet.encrypt(value.encode("utf-8")).decode("ascii")


def dec(value: str) -> str:
    try:
        return fernet.decrypt(value.encode("ascii")).decode("utf-8")
    except Exception:
        return ""


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def gen_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:12]}"


def _serialize(doc: dict) -> dict:
    doc.pop("_id", None)
    for k, v in list(doc.items()):
        if isinstance(v, datetime):
            doc[k] = v.isoformat()
    return doc


def _make_token(length: int = 24) -> str:
    return secrets.token_urlsafe(length)


# ---------------------------------------------------------------------------
# Rate limiting (in-house token bucket + slowapi limiter for default 429 fmt)
# ---------------------------------------------------------------------------
limiter = Limiter(key_func=get_remote_address, default_limits=["240/minute"])
_rate_buckets: dict[tuple[str, str], list[float]] = {}


def rate_limit(rule: str):
    """FastAPI dependency factory. rule is like '5/minute'."""
    count_str, _, window_str = rule.partition("/")
    max_count = int(count_str)
    window_seconds = {"second": 1, "minute": 60, "hour": 3600}.get(window_str, 60)

    def dep(request: Request) -> None:
        import time as _time
        ip = (request.client.host if request.client else "anon") or "anon"
        key = (ip, rule)
        now = _time.monotonic()
        bucket = _rate_buckets.get(key, [])
        bucket = [t for t in bucket if now - t < window_seconds]
        if len(bucket) >= max_count:
            raise HTTPException(status_code=429, detail=f"Too many requests. Limit {rule}.")
        bucket.append(now)
        _rate_buckets[key] = bucket

    return dep


# ---------------------------------------------------------------------------
# Email (Resend; falls back to logging when key absent)
# ---------------------------------------------------------------------------
RESEND_API_KEY = os.environ.get("RESEND_API_KEY", "").strip()
SENDER_EMAIL = os.environ.get("SENDER_EMAIL", "onboarding@resend.dev").strip() or "onboarding@resend.dev"
APP_PUBLIC_URL = os.environ.get("APP_PUBLIC_URL", "").rstrip("/")
if RESEND_API_KEY:
    resend.api_key = RESEND_API_KEY


def _email_dispatch(to_email: str, purpose: str, token: str) -> str:
    """Dispatch a transactional email; returns the link that was (or would be) sent."""
    base = APP_PUBLIC_URL or "https://app.roobani.local"
    if purpose == "password-reset":
        path = f"/auth/reset?token={token}"
        subject = "Reset your Roobani password"
        title = "Reset your password"
        body_html = (
            "We received a request to reset the password for your Roobani account. "
            "Click the button below to choose a new password. This link expires in two hours."
        )
        cta_label = "Set a new password"
    elif purpose == "verify-email":
        path = f"/auth/verify?token={token}"
        subject = "Verify your Roobani email"
        title = "Verify your email"
        body_html = (
            "Thank you for opening a Roobani account. Confirm this email address to enable "
            "withdrawals, reports, and account recovery. This link expires in 48 hours."
        )
        cta_label = "Verify email"
    else:
        path = f"/{purpose}?token={token}"
        subject = "Roobani notification"
        title = "Roobani"
        body_html = "Please continue using the link below."
        cta_label = "Continue"
    link = base + path
    logger.info("EMAIL :: to=%s :: purpose=%s :: link=%s", to_email, purpose, link)
    if not RESEND_API_KEY:
        return link
    html = f"""<!doctype html>
<html><body style=\"margin:0;padding:0;background:#FAFAF8;font-family:-apple-system,BlinkMacSystemFont,Inter,Arial,sans-serif;\">
<table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" style=\"background:#FAFAF8;padding:48px 16px;\">
<tr><td align=\"center\">
<table role=\"presentation\" width=\"560\" cellpadding=\"0\" cellspacing=\"0\" style=\"background:#ffffff;border:1px solid #E0DDD5;\">
<tr><td style=\"padding:36px 40px;border-bottom:1px solid #E0DDD5;\">
<div style=\"font-family:Georgia,'Times New Roman',serif;font-size:28px;color:#1A1F3D;letter-spacing:-0.01em;\">Roobani</div>
</td></tr>
<tr><td style=\"padding:36px 40px;\">
<div style=\"font-family:Georgia,'Times New Roman',serif;font-size:26px;color:#1A1F3D;line-height:1.2;margin-bottom:16px;\">{title}.</div>
<div style=\"font-size:15px;color:#1C1C1E;line-height:1.6;margin-bottom:28px;\">{body_html}</div>
<a href=\"{link}\" style=\"display:inline-block;background:#1A1F3D;color:#FAFAF8;text-decoration:none;padding:14px 22px;font-weight:500;letter-spacing:0.08em;text-transform:uppercase;font-size:12px;\">{cta_label}</a>
<div style=\"font-size:12px;color:#6B6B6B;margin-top:28px;line-height:1.6;\">If the button does not work, paste this link into your browser:<br/><span style=\"color:#1A1F3D;word-break:break-all;\">{link}</span></div>
</td></tr>
<tr><td style=\"padding:24px 40px;border-top:1px solid #E0DDD5;background:#F0EDE6;\">
<div style=\"font-size:11px;color:#6B6B6B;line-height:1.6;\">You are receiving this because of activity on your Roobani account. If this was not you, please ignore this email.</div>
</td></tr>
</table>
</td></tr>
</table>
</body></html>"""
    try:
        params = {"from": SENDER_EMAIL, "to": [to_email], "subject": subject, "html": html}
        try:
            loop = asyncio.get_running_loop()
            loop.create_task(asyncio.to_thread(resend.Emails.send, params))
        except RuntimeError:
            resend.Emails.send(params)
    except Exception as e:
        logger.warning("Resend send failed (purpose=%s): %s", purpose, e)
    return link


async def _create_email_token(user_id: str, purpose: str, ttl_hours: int = 24) -> str:
    token = _make_token(24)
    await db.email_tokens.insert_one({
        "token": token,
        "user_id": user_id,
        "purpose": purpose,
        "expires_at": (now_utc() + timedelta(hours=ttl_hours)).isoformat(),
        "used": False,
        "created_at": now_utc().isoformat(),
    })
    return token


# ---------------------------------------------------------------------------
# User sessions + dependency
# ---------------------------------------------------------------------------
SESSION_COOKIE = "session_token"
SESSION_TTL_DAYS = 7
LOCKOUT_THRESHOLD = 5
LOCKOUT_MINUTES = 15


async def _create_session(user_id: str, response: Response) -> str:
    token = uuid.uuid4().hex + uuid.uuid4().hex
    expires = now_utc() + timedelta(days=SESSION_TTL_DAYS)
    await db.user_sessions.insert_one({
        "session_token": token,
        "user_id": user_id,
        "expires_at": expires.isoformat(),
        "created_at": now_utc().isoformat(),
    })
    response.set_cookie(
        key=SESSION_COOKIE,
        value=token,
        max_age=SESSION_TTL_DAYS * 24 * 3600,
        httponly=True,
        secure=True,
        samesite="none",
        path="/",
    )
    return token


async def _resolve_user(session_token: str | None) -> dict | None:
    if not session_token:
        return None
    sess = await db.user_sessions.find_one({"session_token": session_token}, {"_id": 0})
    if not sess:
        return None
    expires_at = sess["expires_at"]
    if isinstance(expires_at, str):
        expires_at = datetime.fromisoformat(expires_at)
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at < now_utc():
        return None
    return await db.users.find_one({"user_id": sess["user_id"]}, {"_id": 0})


async def current_user(
    session_token: Annotated[str | None, Cookie(alias=SESSION_COOKIE)] = None,
    authorization: Annotated[str | None, Header()] = None,
) -> dict:
    token = session_token
    if not token and authorization and authorization.lower().startswith("bearer "):
        token = authorization.split(" ", 1)[1].strip()
    user = await _resolve_user(token)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return user


def _public_user(user: dict) -> dict:
    return {
        "user_id": user["user_id"],
        "email": dec(user["email_enc"]) if user.get("email_enc") else user.get("email", ""),
        "full_name": user.get("full_name", ""),
        "auth_provider": user.get("auth_provider", "email"),
        "email_verified": user.get("email_verified", False),
        "is_admin": bool(user.get("is_admin", False)),
        "created_at": user.get("created_at", ""),
        "picture": user.get("picture"),
    }


async def require_admin(user: dict = Depends(current_user)) -> dict:
    if not user.get("is_admin"):
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


# ---------------------------------------------------------------------------
# Admin sessions + dependency
# ---------------------------------------------------------------------------
ADMIN_SESSION_COOKIE = "admin_session_token"
ADMIN_SESSION_TTL_DAYS = 1
ACCESS_0_CAP = 5
ACCESS_1_CAP = 500
ADMIN_LOCKOUT_THRESHOLD = 5
ADMIN_LOCKOUT_MINUTES = 30


async def _create_admin_session(admin_id: str, response: Response) -> str:
    token = uuid.uuid4().hex + uuid.uuid4().hex
    expires = now_utc() + timedelta(days=ADMIN_SESSION_TTL_DAYS)
    await db.admin_sessions.insert_one({
        "session_token": token,
        "admin_id": admin_id,
        "expires_at": expires.isoformat(),
        "created_at": now_utc().isoformat(),
    })
    response.set_cookie(
        key=ADMIN_SESSION_COOKIE,
        value=token,
        max_age=ADMIN_SESSION_TTL_DAYS * 24 * 3600,
        httponly=True,
        secure=True,
        samesite="none",
        path="/",
    )
    return token


async def _resolve_admin(session_token: str | None) -> dict | None:
    if not session_token:
        return None
    sess = await db.admin_sessions.find_one({"session_token": session_token}, {"_id": 0})
    if not sess:
        return None
    expires_at = sess["expires_at"]
    if isinstance(expires_at, str):
        expires_at = datetime.fromisoformat(expires_at)
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at < now_utc():
        return None
    admin_doc = await db.admin_users.find_one({"admin_id": sess["admin_id"]}, {"_id": 0})
    if not admin_doc or not admin_doc.get("active", True):
        return None
    return admin_doc


async def current_admin(
    admin_session_token: Annotated[str | None, Cookie(alias=ADMIN_SESSION_COOKIE)] = None,
    authorization: Annotated[str | None, Header()] = None,
) -> dict:
    token = admin_session_token
    if not token and authorization and authorization.lower().startswith("admin "):
        token = authorization.split(" ", 1)[1].strip()
    admin_doc = await _resolve_admin(token)
    if not admin_doc:
        raise HTTPException(status_code=401, detail="Admin not authenticated")
    return admin_doc


async def require_access_0(admin: dict = Depends(current_admin)) -> dict:
    if int(admin.get("access_level", 1)) != 0:
        raise HTTPException(status_code=403, detail="Super admin access required")
    return admin


def _public_admin(a: dict) -> dict:
    return {
        "admin_id": a["admin_id"],
        "email": dec(a["email_enc"]) if a.get("email_enc") else "",
        "full_name": a.get("full_name", ""),
        "access_level": int(a.get("access_level", 1)),
        "active": bool(a.get("active", True)),
        "created_at": a.get("created_at", ""),
        "last_login_at": a.get("last_login_at"),
    }


# ---------------------------------------------------------------------------
# Shared business helpers (used across customer + admin route modules)
# ---------------------------------------------------------------------------
async def _audit(admin_id: str, action: str, target_type: str = "", target_id: str = "", meta: dict | None = None) -> None:
    await db.admin_audit.insert_one({
        "audit_id": gen_id("aud"),
        "admin_id": admin_id,
        "action": action,
        "target_type": target_type,
        "target_id": target_id,
        "meta": meta or {},
        "created_at": now_utc().isoformat(),
    })


async def _notify(user_id: str, kind: str, title: str, body: str, meta: dict | None = None) -> None:
    await db.notifications.insert_one({
        "notification_id": gen_id("ntf"),
        "user_id": user_id,
        "kind": kind,
        "title": title,
        "body": body,
        "meta": meta or {},
        "read": False,
        "created_at": now_utc().isoformat(),
    })
