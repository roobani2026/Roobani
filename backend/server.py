"""Roobani backend API. FastAPI + MongoDB. Sharp, secure, light theme website backend.

Routes (all prefixed with /api):
- POST /auth/register        email + password registration
- POST /auth/login           email + password login (lockout after 5 attempts)
- POST /auth/logout          clears session
- GET  /auth/me              returns current user (cookie or bearer)
- GET  /auth/google/start    returns Emergent Google OAuth URL builder hint
- POST /auth/session         exchanges Emergent session_id for a session_token
- POST /leads                lead generation form intake (encrypted PII)
- POST /contact              contact form intake
- GET  /market/crypto        live crypto quotes via CoinGecko
- GET  /market/stocks        stock index, commodity, and forex quotes via Yahoo
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import re
import secrets
import uuid
import base64
import io
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Annotated, Any, Literal

import bcrypt
import httpx
import pyotp
import qrcode
import qrcode.image.svg
import resend
import websockets
from cryptography.fernet import Fernet
from dotenv import load_dotenv
from emergentintegrations.payments.stripe.checkout import (
    CheckoutSessionRequest,
    CheckoutSessionResponse,
    CheckoutStatusResponse,
    StripeCheckout,
)
from fastapi import APIRouter, Cookie, Depends, FastAPI, File, Form, Header, HTTPException, Request, Response, UploadFile, WebSocket, WebSocketDisconnect, status
from fastapi.responses import FileResponse
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, EmailStr, Field, field_validator
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from slowapi.util import get_remote_address
from starlette.middleware.cors import CORSMiddleware


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
logger = logging.getLogger("roobani")


# Mongo setup
mongo_url = os.environ["MONGO_URL"]
db_name = os.environ["DB_NAME"]
client = AsyncIOMotorClient(mongo_url)
db = client[db_name]


# Encryption for PII (deterministic per deploy)
def _get_fernet() -> Fernet:
    key = os.environ.get("ROOBANI_FERNET_KEY")
    if not key:
        # Derive a stable key from MONGO_URL + DB_NAME so PII can be decrypted later.
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


# App + router
app = FastAPI(title="Roobani API")
api = APIRouter(prefix="/api")

# Rate limiting (in-house token bucket per client IP).
# We avoid slowapi's decorator because it corrupts FastAPI's body-parameter inference
# on POST endpoints. SlowAPIMiddleware is still registered for default limits and 429 formatting.
limiter = Limiter(key_func=get_remote_address, default_limits=["240/minute"])
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)

_rate_buckets: dict[tuple[str, str], list[float]] = {}


def rate_limit(rule: str):
    """FastAPI dependency factory. rule is like '5/minute' or '10/minute'."""
    count_str, _, window_str = rule.partition("/")
    max_count = int(count_str)
    window_seconds = {"second": 1, "minute": 60, "hour": 3600}.get(window_str, 60)

    def dep(request: Request) -> None:
        import time as _time
        ip = (request.client.host if request.client else "anon") or "anon"
        # Bucket per (ip, rule, path) so unrelated endpoints sharing a rule
        # string (e.g. customer login + admin login both '10/minute') don't
        # share a bucket and 429 each other from the same office IP.
        path = request.url.path
        key = (ip, rule, path)
        now = _time.monotonic()
        bucket = _rate_buckets.get(key, [])
        # drop expired hits
        bucket = [t for t in bucket if now - t < window_seconds]
        if len(bucket) >= max_count:
            raise HTTPException(status_code=429, detail=f"Too many requests. Limit {rule}.")
        bucket.append(now)
        _rate_buckets[key] = bucket

    return dep

# Email (Resend). When RESEND_API_KEY is unset, we fall back to mock dispatch.
RESEND_API_KEY = os.environ.get("RESEND_API_KEY", "").strip()
SENDER_EMAIL = os.environ.get("SENDER_EMAIL", "onboarding@resend.dev").strip() or "onboarding@resend.dev"
APP_PUBLIC_URL = os.environ.get("APP_PUBLIC_URL", "").rstrip("/")
if RESEND_API_KEY:
    resend.api_key = RESEND_API_KEY


# Helpers
def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def gen_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:12]}"


SESSION_COOKIE = "session_token"
SESSION_TTL_DAYS = 7
LOCKOUT_THRESHOLD = 5
LOCKOUT_MINUTES = 15


def _serialize(doc: dict) -> dict:
    doc.pop("_id", None)
    for k, v in list(doc.items()):
        if isinstance(v, datetime):
            doc[k] = v.isoformat()
    return doc


# Models
class RegisterIn(BaseModel):
    full_name: str = Field(min_length=2, max_length=120)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    consent: bool

    @field_validator("password")
    @classmethod
    def strong(cls, v: str) -> str:
        if not re.search(r"[A-Za-z]", v) or not re.search(r"\d", v):
            raise ValueError("Password must contain letters and digits")
        return v


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class SessionExchangeIn(BaseModel):
    session_id: str


class PasswordResetRequestIn(BaseModel):
    email: EmailStr


class PasswordResetConfirmIn(BaseModel):
    token: str
    new_password: str = Field(min_length=8, max_length=128)

    @field_validator("new_password")
    @classmethod
    def strong(cls, v: str) -> str:
        if not re.search(r"[A-Za-z]", v) or not re.search(r"\d", v):
            raise ValueError("Password must contain letters and digits")
        return v


class EmailVerifyIn(BaseModel):
    token: str


class HoldingIn(BaseModel):
    plan_slug: Literal["foundation", "growth", "accelerator", "elite"]
    amount: float = Field(gt=0)


class CheckoutFundIn(BaseModel):
    plan_slug: Literal["foundation", "growth", "accelerator", "elite"]
    amount: float = Field(gt=0)
    origin_url: str
    payment_method: Literal["card", "crypto", "card_and_crypto", "all_methods"] = "card_and_crypto"
    currency: str = Field(default="usd", min_length=3, max_length=3)


class LeadIn(BaseModel):
    full_name: str = Field(min_length=2, max_length=120)
    email: EmailStr
    phone: str = Field(min_length=4, max_length=40)
    country_code: str = Field(min_length=1, max_length=8)
    budget_range: Literal[
        "under_5k",
        "5k_25k",
        "25k_100k",
        "100k_500k",
        "500k_plus",
    ]
    investment_goal: Literal[
        "wealth_preservation",
        "steady_growth",
        "aggressive_growth",
        "retirement_planning",
        "passive_income",
    ]
    preferred_contact: Literal["email", "phone", "whatsapp"]
    consent: bool
    source_page: str = "home"


class ContactIn(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    email: EmailStr
    subject: str = Field(min_length=2, max_length=200)
    message: str = Field(min_length=4, max_length=4000)
    country_code: str | None = Field(default=None, max_length=8)
    phone: str | None = Field(default=None, max_length=32)


class UserOut(BaseModel):
    user_id: str
    email: EmailStr
    full_name: str
    auth_provider: str
    email_verified: bool
    created_at: str


# Customer dashboard models
class CustomerWithdrawalIn(BaseModel):
    amount: float = Field(gt=0)
    currency: str = Field(default="usd", min_length=3, max_length=8)
    destination_type: Literal["bank", "crypto"]
    # Bank fields
    bank_account_name: str | None = None
    bank_name: str | None = None
    bank_account_number: str | None = None
    bank_swift_iban: str | None = None
    bank_country: str | None = None
    # Crypto fields
    crypto_asset: str | None = None  # BTC, USDC, ETH
    crypto_network: str | None = None  # ERC20, TRC20, BTC, etc
    crypto_wallet_address: str | None = None
    note: str | None = Field(default=None, max_length=400)


class ProfileUpdateIn(BaseModel):
    full_name: str | None = Field(default=None, min_length=2, max_length=120)
    phone: str | None = Field(default=None, max_length=40)
    country: str | None = Field(default=None, max_length=80)
    address: str | None = Field(default=None, max_length=300)


# DB indexes
@app.on_event("startup")
async def startup() -> None:
    await db.users.create_index("email_lookup", unique=True)
    await db.users.create_index("user_id", unique=True)
    await db.user_sessions.create_index("session_token", unique=True)
    await db.user_sessions.create_index("user_id")
    await db.holdings.create_index([("user_id", 1), ("plan_slug", 1)])
    await db.payment_transactions.create_index("session_id", unique=True)
    await db.email_tokens.create_index("token", unique=True)
    await db.email_tokens.create_index("expires_at")
    # Admin panel indexes
    await db.admin_users.create_index("admin_id", unique=True)
    await db.admin_users.create_index("email_lookup", unique=True)
    await db.admin_sessions.create_index("session_token", unique=True)
    await db.admin_sessions.create_index("admin_id")
    await db.customer_assignments.create_index("customer_user_id", unique=True)
    await db.customer_assignments.create_index("manager_admin_id")
    await db.admin_audit.create_index([("created_at", -1)])
    await db.admin_audit.create_index("admin_id")
    await db.mfa_challenges.create_index("challenge_token", unique=True)
    await db.mfa_challenges.create_index("expires_at", expireAfterSeconds=900)
    await db.withdrawals.create_index([("status", 1), ("created_at", -1)])
    await db.withdrawals.create_index("withdrawal_id", unique=True)
    await db.withdrawals.create_index([("customer_user_id", 1), ("created_at", -1)])
    await db.kyc_documents.create_index([("user_id", 1), ("uploaded_at", -1)])
    await db.notifications.create_index([("user_id", 1), ("created_at", -1)])
    await db.notifications.create_index("notification_id", unique=True)
    # Seed Access 0 super admin (idempotent)
    super_admin_email = "admin@roobani.com"
    if not await db.admin_users.find_one({"email_lookup": super_admin_email}, {"_id": 0}):
        pw = bcrypt.hashpw(b"Admin@Roobani2026!", bcrypt.gensalt(rounds=12)).decode("utf-8")
        await db.admin_users.insert_one({
            "admin_id": gen_id("adm"),
            "email_lookup": super_admin_email,
            "email_enc": enc(super_admin_email),
            "full_name": "Roobani Super Admin",
            "password_hash": pw,
            "access_level": 0,
            "active": True,
            "failed_attempts": 0,
            "locked_until": None,
            "created_by": "system",
            "created_at": now_utc().isoformat(),
            "updated_at": now_utc().isoformat(),
        })
        logger.info("Seeded Access 0 super admin: %s", super_admin_email)
    # Seed admin user (idempotent)
    admin_email = "admin@roobani.dev"
    if not await db.users.find_one({"email_lookup": admin_email}, {"_id": 0}):
        pw = bcrypt.hashpw(b"RoobaniAdmin#2026", bcrypt.gensalt(rounds=12)).decode("utf-8")
        await db.users.insert_one({
            "user_id": gen_id("user"),
            "email_lookup": admin_email,
            "email_enc": enc(admin_email),
            "full_name": "Roobani Admin",
            "password_hash": pw,
            "auth_provider": "email",
            "email_verified": True,
            "is_admin": True,
            "failed_attempts": 0,
            "locked_until": None,
            "created_at": now_utc().isoformat(),
            "updated_at": now_utc().isoformat(),
        })
        logger.info("Seeded admin@roobani.dev")
    logger.info("Mongo indexes ensured.")


@app.on_event("shutdown")
async def shutdown() -> None:
    client.close()


# Session helpers
async def _create_session(user_id: str, response: Response) -> str:
    token = uuid.uuid4().hex + uuid.uuid4().hex
    expires = now_utc() + timedelta(days=SESSION_TTL_DAYS)
    await db.user_sessions.insert_one(
        {
            "session_token": token,
            "user_id": user_id,
            "expires_at": expires.isoformat(),
            "created_at": now_utc().isoformat(),
        }
    )
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
    user = await db.users.find_one({"user_id": sess["user_id"]}, {"_id": 0})
    return user


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


def _make_token(length: int = 24) -> str:
    return secrets.token_urlsafe(length)


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


def _email_dispatch(to_email: str, purpose: str, token: str) -> str:
    """Dispatch a transactional email. Uses Resend when RESEND_API_KEY is set,
    otherwise logs and returns the link so the dev_token flow continues to work.
    Returns the link that was sent (or would have been sent)."""
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
        # Mock mode. Token is still surfaced in the API response for dev flows.
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
        # resend SDK is synchronous - run in a thread.
        try:
            loop = asyncio.get_running_loop()
            loop.create_task(asyncio.to_thread(resend.Emails.send, params))
        except RuntimeError:
            resend.Emails.send(params)
    except Exception as e:
        logger.warning("Resend send failed (purpose=%s): %s", purpose, e)
    return link


# Routes
@api.get("/")
async def root() -> dict:
    return {"service": "roobani", "status": "ok", "time": now_utc().isoformat()}


@api.post("/auth/register", status_code=201)
async def register(payload: RegisterIn, response: Response, _rl: None = Depends(rate_limit("5/minute"))) -> dict:
    if not payload.consent:
        raise HTTPException(status_code=400, detail="Consent is required")
    email_lower = payload.email.lower().strip()
    existing = await db.users.find_one({"email_lookup": email_lower}, {"_id": 0})
    if existing:
        raise HTTPException(status_code=409, detail="An account with this email already exists")
    pw_hash = bcrypt.hashpw(payload.password.encode("utf-8"), bcrypt.gensalt(rounds=12)).decode("utf-8")
    user_id = gen_id("user")
    doc = {
        "user_id": user_id,
        "email_lookup": email_lower,
        "email_enc": enc(email_lower),
        "full_name": payload.full_name.strip(),
        "password_hash": pw_hash,
        "auth_provider": "email",
        "email_verified": False,
        "failed_attempts": 0,
        "locked_until": None,
        "created_at": now_utc().isoformat(),
        "updated_at": now_utc().isoformat(),
    }
    await db.users.insert_one(doc)
    await _create_session(user_id, response)
    # Issue email verification (real email when configured, mock otherwise)
    verify_token = await _create_email_token(user_id, "verify-email", ttl_hours=48)
    _email_dispatch(email_lower, "verify-email", verify_token)
    result: dict[str, Any] = {"user": _public_user(doc)}
    if not RESEND_API_KEY:
        result["email_verification_token"] = verify_token
    return result


@api.post("/auth/login")
async def login(payload: LoginIn, response: Response, _rl: None = Depends(rate_limit("10/minute"))) -> dict:
    email_lower = payload.email.lower().strip()
    user = await db.users.find_one({"email_lookup": email_lower}, {"_id": 0})
    generic = HTTPException(status_code=401, detail="Invalid email or password")
    if not user or not user.get("password_hash"):
        raise generic
    locked_until = user.get("locked_until")
    if locked_until:
        lu = datetime.fromisoformat(locked_until) if isinstance(locked_until, str) else locked_until
        if lu.tzinfo is None:
            lu = lu.replace(tzinfo=timezone.utc)
        if lu > now_utc():
            raise HTTPException(status_code=423, detail="Account temporarily locked. Try again later.")
    if not bcrypt.checkpw(payload.password.encode("utf-8"), user["password_hash"].encode("utf-8")):
        attempts = int(user.get("failed_attempts", 0)) + 1
        update: dict[str, Any] = {"failed_attempts": attempts, "updated_at": now_utc().isoformat()}
        if attempts >= LOCKOUT_THRESHOLD:
            update["locked_until"] = (now_utc() + timedelta(minutes=LOCKOUT_MINUTES)).isoformat()
            update["failed_attempts"] = 0
        await db.users.update_one({"user_id": user["user_id"]}, {"$set": update})
        raise generic
    await db.users.update_one(
        {"user_id": user["user_id"]},
        {"$set": {"failed_attempts": 0, "locked_until": None, "updated_at": now_utc().isoformat()}},
    )
    await _create_session(user["user_id"], response)
    return {"user": _public_user(user)}


@api.post("/auth/logout")
async def logout(
    response: Response,
    session_token: Annotated[str | None, Cookie(alias=SESSION_COOKIE)] = None,
) -> dict:
    if session_token:
        await db.user_sessions.delete_one({"session_token": session_token})
    response.delete_cookie(SESSION_COOKIE, path="/")
    return {"ok": True}


@api.get("/auth/me")
async def me(user: dict = Depends(current_user)) -> dict:
    return _public_user(user)


@api.post("/auth/session")
async def exchange_session(payload: SessionExchangeIn, response: Response) -> dict:
    """Exchange an Emergent Auth session_id for a Roobani session cookie."""
    if not payload.session_id or len(payload.session_id) < 4:
        raise HTTPException(status_code=400, detail="Missing session_id")
    url = "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data"
    try:
        async with httpx.AsyncClient(timeout=10) as hx:
            r = await hx.get(url, headers={"X-Session-ID": payload.session_id})
    except Exception as e:
        logger.exception("Emergent session lookup failed")
        raise HTTPException(status_code=502, detail="Auth provider unreachable") from e
    if r.status_code != 200:
        raise HTTPException(status_code=401, detail="Invalid session")
    data = r.json()
    email_lower = (data.get("email") or "").lower().strip()
    if not email_lower:
        raise HTTPException(status_code=400, detail="Auth provider returned no email")
    name = data.get("name") or email_lower.split("@", 1)[0]
    picture = data.get("picture")
    existing = await db.users.find_one({"email_lookup": email_lower}, {"_id": 0})
    if existing:
        user_id = existing["user_id"]
        await db.users.update_one(
            {"user_id": user_id},
            {
                "$set": {
                    "full_name": name,
                    "picture": picture,
                    "email_verified": True,
                    "updated_at": now_utc().isoformat(),
                }
            },
        )
        user_doc = {**existing, "full_name": name, "picture": picture, "email_verified": True}
    else:
        user_id = gen_id("user")
        user_doc = {
            "user_id": user_id,
            "email_lookup": email_lower,
            "email_enc": enc(email_lower),
            "full_name": name,
            "password_hash": None,
            "auth_provider": "google",
            "email_verified": True,
            "picture": picture,
            "created_at": now_utc().isoformat(),
            "updated_at": now_utc().isoformat(),
        }
        await db.users.insert_one(user_doc)
    await _create_session(user_id, response)
    return {"user": _public_user(user_doc)}


# Password reset (mock email - token returned in response for dev)
@api.post("/auth/password/reset/request")
async def password_reset_request(payload: PasswordResetRequestIn, _rl: None = Depends(rate_limit("5/minute"))) -> dict:
    email_lower = payload.email.lower().strip()
    user = await db.users.find_one({"email_lookup": email_lower}, {"_id": 0})
    # Always return ok=True to avoid email enumeration
    if user and user.get("password_hash"):
        token = await _create_email_token(user["user_id"], "password-reset", ttl_hours=2)
        _email_dispatch(email_lower, "password-reset", token)
        if not RESEND_API_KEY:
            return {"ok": True, "dev_token": token}
    return {"ok": True}


@api.post("/auth/password/reset/confirm")
async def password_reset_confirm(payload: PasswordResetConfirmIn, _rl: None = Depends(rate_limit("10/minute"))) -> dict:
    tok = await db.email_tokens.find_one({"token": payload.token, "purpose": "password-reset"}, {"_id": 0})
    if not tok or tok.get("used"):
        raise HTTPException(status_code=400, detail="Invalid or used token")
    exp = tok["expires_at"]
    if isinstance(exp, str):
        exp = datetime.fromisoformat(exp)
    if exp.tzinfo is None:
        exp = exp.replace(tzinfo=timezone.utc)
    if exp < now_utc():
        raise HTTPException(status_code=400, detail="Token expired")
    pw_hash = bcrypt.hashpw(payload.new_password.encode("utf-8"), bcrypt.gensalt(rounds=12)).decode("utf-8")
    await db.users.update_one(
        {"user_id": tok["user_id"]},
        {"$set": {"password_hash": pw_hash, "failed_attempts": 0, "locked_until": None, "updated_at": now_utc().isoformat()}},
    )
    await db.email_tokens.update_one({"token": payload.token}, {"$set": {"used": True, "used_at": now_utc().isoformat()}})
    return {"ok": True}


# Email verification
@api.post("/auth/email/verify/request")
async def email_verify_request(user: dict = Depends(current_user)) -> dict:
    if user.get("email_verified"):
        return {"ok": True, "already_verified": True}
    token = await _create_email_token(user["user_id"], "verify-email", ttl_hours=48)
    _email_dispatch(dec(user.get("email_enc", "")) or "", "verify-email", token)
    if not RESEND_API_KEY:
        return {"ok": True, "dev_token": token}
    return {"ok": True}


@api.post("/auth/email/verify/confirm")
async def email_verify_confirm(payload: EmailVerifyIn) -> dict:
    tok = await db.email_tokens.find_one({"token": payload.token, "purpose": "verify-email"}, {"_id": 0})
    if not tok or tok.get("used"):
        raise HTTPException(status_code=400, detail="Invalid or used token")
    exp = tok["expires_at"]
    if isinstance(exp, str):
        exp = datetime.fromisoformat(exp)
    if exp.tzinfo is None:
        exp = exp.replace(tzinfo=timezone.utc)
    if exp < now_utc():
        raise HTTPException(status_code=400, detail="Token expired")
    await db.users.update_one(
        {"user_id": tok["user_id"]},
        {"$set": {"email_verified": True, "updated_at": now_utc().isoformat()}},
    )
    await db.email_tokens.update_one({"token": payload.token}, {"$set": {"used": True, "used_at": now_utc().isoformat()}})
    return {"ok": True}


# Holdings
@api.get("/holdings")
async def list_holdings(user: dict = Depends(current_user)) -> dict:
    cursor = db.holdings.find({"user_id": user["user_id"]}, {"_id": 0}).sort("created_at", -1)
    items = [doc async for doc in cursor]
    total = sum(float(it.get("amount", 0)) for it in items)
    return {"items": items, "total_invested": total}


# Stripe checkout (Plans funding)
PLAN_MINIMUMS = {
    "foundation": 1000.0,
    "growth": 5000.0,
    "accelerator": 25000.0,
    "elite": 100000.0,
}
PLAN_MAXIMUMS = {
    "foundation": 50000.0,
    "growth": 250000.0,
    "accelerator": 1000000.0,
    "elite": 5000000.0,
}

# Comprehensive Stripe-supported currencies (ISO 4217 codes). Stripe accepts 135+ currencies;
# this list covers the major + African + Asian + Latam + Middle East + European set used in practice.
STRIPE_CURRENCIES = {
    "usd", "eur", "gbp", "kes", "ngn", "zar", "ghs", "ugx", "tzs", "rwf", "etb", "egp", "mad", "xof", "xaf",
    "aed", "sar", "qar", "kwd", "bhd", "omr", "jod", "ils", "try",
    "inr", "pkr", "bdt", "lkr", "npr",
    "jpy", "krw", "cny", "hkd", "twd", "sgd", "thb", "php", "myr", "idr", "vnd", "khr", "mmk", "lao",
    "aud", "nzd", "fjd",
    "cad", "mxn", "brl", "ars", "clp", "cop", "pen", "uyu", "bob", "gtq", "crc", "dop", "hnl", "pyg", "bbd",
    "chf", "sek", "nok", "dkk", "pln", "czk", "huf", "ron", "bgn", "isk", "hrk", "rsd", "all", "mkd", "bam",
    "rub", "uah", "gel", "amd", "azn", "kzt", "uzs",
    "mzn", "zmw", "mwk", "bif", "bwp", "lsl", "szl", "nad", "mur", "sll", "lrd", "djf", "scr", "mga", "cdf",
    "yer", "lyd", "tnd", "dzd", "irr", "iqd", "syp",
    "mnt", "afn", "btn", "mvr", "kgs", "tjs", "tmt",
    "bsd", "bzd", "bmd", "kyd", "xcd", "ttd", "jmd", "htg", "ang", "awg", "srd", "gyd",
    "gmd", "gnf", "kmf", "stn", "cve", "sos", "ssp",
}

# Zero-decimal currencies (amount passed as whole units, not divided by 100)
STRIPE_ZERO_DECIMAL = {"bif", "clp", "djf", "gnf", "jpy", "kmf", "krw", "mga", "pyg", "rwf", "ugx", "vnd", "vuv", "xaf", "xof", "xpf"}


def _validate_currency(code: str) -> str:
    c = (code or "usd").lower().strip()
    if c not in STRIPE_CURRENCIES:
        raise HTTPException(status_code=400, detail=f"Currency '{c}' not supported. Use a valid ISO 4217 code (e.g. usd, eur, kes, ngn, inr, jpy).")
    return c


@api.post("/checkout/fund")
async def checkout_fund(payload: CheckoutFundIn, request: Request, user: dict = Depends(current_user)) -> dict:
    currency = _validate_currency(payload.currency)
    # USD min/max are enforced as guardrails; for non-USD, Stripe enforces its own minimums.
    if currency == "usd":
        if payload.amount < PLAN_MINIMUMS[payload.plan_slug]:
            raise HTTPException(status_code=400, detail=f"Below minimum for {payload.plan_slug}: ${PLAN_MINIMUMS[payload.plan_slug]:,.0f}")
        if payload.amount > PLAN_MAXIMUMS[payload.plan_slug]:
            raise HTTPException(status_code=400, detail=f"Above maximum for {payload.plan_slug}: ${PLAN_MAXIMUMS[payload.plan_slug]:,.0f}")
    else:
        if payload.amount <= 0:
            raise HTTPException(status_code=400, detail="Amount must be greater than zero")
    api_key = os.environ.get("STRIPE_API_KEY") or "sk_test_emergent"
    host_url = str(request.base_url).rstrip("/")
    webhook_url = f"{host_url}/api/webhook/stripe"
    sc = StripeCheckout(api_key=api_key, webhook_url=webhook_url)
    origin = payload.origin_url.rstrip("/")
    success_url = f"{origin}/dashboard?fund_session_id={{CHECKOUT_SESSION_ID}}"
    cancel_url = f"{origin}/plans#{payload.plan_slug}"
    methods_map = {
        "card": ["card"],
        "crypto": ["crypto"],
        "card_and_crypto": ["card", "crypto"],
        # Maximum payment methods enabled on the Stripe account.
        # (PayPal/Link/WeChat are not activated on the Emergent test account so are intentionally omitted.)
        "all_methods": ["card", "crypto", "klarna", "afterpay_clearpay", "affirm", "cashapp", "us_bank_account", "alipay", "amazon_pay"],
    }
    payment_methods = methods_map[payload.payment_method]
    # Currency compatibility filter — most BNPL/wallets are USD-only on Stripe.
    USD_ONLY_METHODS = {"affirm", "cashapp", "us_bank_account", "amazon_pay"}
    EUR_GBP_USD_METHODS = {"klarna", "afterpay_clearpay"}
    if currency != "usd":
        payment_methods = [m for m in payment_methods if m not in USD_ONLY_METHODS]
        if currency not in {"eur", "gbp", "aud", "cad", "nzd", "sek"}:
            payment_methods = [m for m in payment_methods if m not in EUR_GBP_USD_METHODS]
    # Always keep at least `card`
    if not payment_methods:
        payment_methods = ["card"]
    req = CheckoutSessionRequest(
        amount=float(payload.amount),
        currency=currency,
        success_url=success_url,
        cancel_url=cancel_url,
        metadata={
            "user_id": user["user_id"],
            "plan_slug": payload.plan_slug,
            "source": "roobani_fund",
            "currency": currency,
        },
        payment_methods=payment_methods,
    )
    sess: CheckoutSessionResponse = await sc.create_checkout_session(req)
    await db.payment_transactions.insert_one({
        "session_id": sess.session_id,
        "user_id": user["user_id"],
        "plan_slug": payload.plan_slug,
        "amount": float(payload.amount),
        "currency": currency,
        "payment_status": "initiated",
        "status": "pending",
        "metadata": req.metadata,
        "created_at": now_utc().isoformat(),
        "updated_at": now_utc().isoformat(),
    })
    return {"url": sess.url, "session_id": sess.session_id, "currency": currency}


@api.get("/checkout/status/{session_id}")
async def checkout_status(session_id: str, request: Request, user: dict = Depends(current_user)) -> dict:
    rec = await db.payment_transactions.find_one({"session_id": session_id, "user_id": user["user_id"]}, {"_id": 0})
    if not rec:
        raise HTTPException(status_code=404, detail="Transaction not found")
    if rec.get("payment_status") == "paid":
        return {"payment_status": "paid", "status": rec.get("status", "complete"), "amount": rec.get("amount"), "plan_slug": rec.get("plan_slug")}
    api_key = os.environ.get("STRIPE_API_KEY") or "sk_test_emergent"
    host_url = str(request.base_url).rstrip("/")
    sc = StripeCheckout(api_key=api_key, webhook_url=f"{host_url}/api/webhook/stripe")
    s: CheckoutStatusResponse = await sc.get_checkout_status(session_id)
    update: dict[str, Any] = {
        "payment_status": s.payment_status,
        "status": s.status,
        "updated_at": now_utc().isoformat(),
    }
    await db.payment_transactions.update_one({"session_id": session_id}, {"$set": update})
    # On first paid observation, create the holding (idempotent via session_id check)
    if s.payment_status == "paid" and rec.get("payment_status") != "paid":
        await db.holdings.insert_one({
            "holding_id": gen_id("hold"),
            "user_id": user["user_id"],
            "plan_slug": rec["plan_slug"],
            "amount": float(rec["amount"]),
            "currency": rec.get("currency", "usd"),
            "session_id": session_id,
            "created_at": now_utc().isoformat(),
        })
        await _notify(
            user["user_id"],
            "deposit",
            "Funding completed",
            f"Your deposit of {float(rec['amount']):,.2f} {rec.get('currency','usd').upper()} into {rec['plan_slug']} is now live.",
            {"session_id": session_id, "plan_slug": rec["plan_slug"]},
        )
    return {"payment_status": s.payment_status, "status": s.status, "amount": s.amount_total / 100.0 if s.amount_total else rec.get("amount"), "plan_slug": rec.get("plan_slug"), "currency": rec.get("currency", "usd")}


@app.post("/api/webhook/stripe")
async def stripe_webhook(request: Request) -> dict:
    body = await request.body()
    api_key = os.environ.get("STRIPE_API_KEY") or "sk_test_emergent"
    host_url = str(request.base_url).rstrip("/")
    sc = StripeCheckout(api_key=api_key, webhook_url=f"{host_url}/api/webhook/stripe")
    try:
        evt = await sc.handle_webhook(body, request.headers.get("Stripe-Signature"))
    except Exception as e:
        logger.warning("stripe webhook handle failed: %s", e)
        return {"ok": False}
    if evt.session_id:
        rec = await db.payment_transactions.find_one({"session_id": evt.session_id}, {"_id": 0})
        if rec:
            await db.payment_transactions.update_one(
                {"session_id": evt.session_id},
                {"$set": {"payment_status": evt.payment_status, "updated_at": now_utc().isoformat()}},
            )
            if evt.payment_status == "paid" and rec.get("payment_status") != "paid":
                await db.holdings.insert_one({
                    "holding_id": gen_id("hold"),
                    "user_id": rec["user_id"],
                    "plan_slug": rec["plan_slug"],
                    "amount": float(rec["amount"]),
                    "currency": rec.get("currency", "usd"),
                    "session_id": evt.session_id,
                    "created_at": now_utc().isoformat(),
                })
    return {"ok": True}


# Admin endpoints (role-based)
def _admin_lead(doc: dict) -> dict:
    return {
        "lead_id": doc.get("lead_id"),
        "full_name": doc.get("full_name"),
        "email": dec(doc.get("email_enc", "")),
        "phone": dec(doc.get("phone_enc", "")),
        "budget_range": doc.get("budget_range"),
        "investment_goal": doc.get("investment_goal"),
        "preferred_contact": doc.get("preferred_contact"),
        "source_page": doc.get("source_page"),
        "created_at": doc.get("created_at"),
    }


def _admin_contact(doc: dict) -> dict:
    return {
        "contact_id": doc.get("contact_id"),
        "name": doc.get("name"),
        "email": dec(doc.get("email_enc", "")),
        "subject": doc.get("subject"),
        "message": doc.get("message"),
        "created_at": doc.get("created_at"),
    }


@api.get("/admin/leads")
async def admin_leads(admin: dict = Depends(require_admin)) -> dict:
    cursor = db.leads.find({}, {"_id": 0}).sort("created_at", -1).limit(500)
    return {"items": [_admin_lead(doc) async for doc in cursor]}


@api.get("/admin/contacts")
async def admin_contacts(admin: dict = Depends(require_admin)) -> dict:
    cursor = db.contact_submissions.find({}, {"_id": 0}).sort("created_at", -1).limit(500)
    return {"items": [_admin_contact(doc) async for doc in cursor]}


@api.get("/admin/stats")
async def admin_stats(admin: dict = Depends(require_admin)) -> dict:
    leads = await db.leads.count_documents({})
    contacts = await db.contact_submissions.count_documents({})
    users = await db.users.count_documents({})
    holdings = await db.holdings.count_documents({})
    pipeline = [{"$group": {"_id": None, "total": {"$sum": "$amount"}}}]
    total_invested = 0.0
    async for d in db.holdings.aggregate(pipeline):
        total_invested = float(d.get("total", 0))
    return {
        "leads": leads,
        "contacts": contacts,
        "users": users,
        "holdings": holdings,
        "total_invested_usd": total_invested,
    }


# Leads
@api.post("/leads", status_code=201)
async def create_lead(payload: LeadIn, request: Request, _rl: None = Depends(rate_limit("10/minute"))) -> dict:
    if not payload.consent:
        raise HTTPException(status_code=400, detail="Consent is required")
    lead_id = gen_id("lead")
    doc = {
        "lead_id": lead_id,
        "full_name": payload.full_name.strip(),
        "email_enc": enc(payload.email.lower().strip()),
        "phone_enc": enc(f"{payload.country_code} {payload.phone}"),
        "budget_range": payload.budget_range,
        "investment_goal": payload.investment_goal,
        "preferred_contact": payload.preferred_contact,
        "consent": True,
        "source_page": payload.source_page,
        "created_at": now_utc().isoformat(),
        "source_ip": _client_ip(request),
        "crm_synced": False,
        "crm_synced_at": None,
    }
    await db.leads.insert_one(doc)
    # Best-effort HubSpot push. Same approach as /contact: store first, push
    # async, no-op when key isn't set yet.
    asyncio.create_task(_crm_push_contact(lead_id, {
        "email": payload.email.lower().strip(),
        "firstname": payload.full_name.strip().split(" ", 1)[0],
        "lastname": (payload.full_name.strip().split(" ", 1)[1] if " " in payload.full_name.strip() else ""),
        "phone": f"{payload.country_code} {payload.phone}",
        "preferred_channel": payload.preferred_contact,
        "investment_goal__c": payload.investment_goal,
        "budget_range__c": payload.budget_range,
        "hs_lead_status": "NEW",
        "lifecyclestage": "marketingqualifiedlead",
        "source": payload.source_page or "leadform",
    }))
    return {"lead_id": lead_id, "received_at": doc["created_at"]}


# Contact
@api.post("/contact", status_code=201)
async def create_contact(payload: ContactIn, request: Request, _rl: None = Depends(rate_limit("10/minute"))) -> dict:
    cid = gen_id("ct")
    doc = {
        "contact_id": cid,
        "name": payload.name.strip(),
        "email_enc": enc(payload.email.lower().strip()),
        "subject": payload.subject.strip(),
        "message": payload.message.strip(),
        "country_code": (payload.country_code or "").strip() or None,
        "phone_enc": enc(payload.phone.strip()) if payload.phone and payload.phone.strip() else None,
        "created_at": now_utc().isoformat(),
        "source_ip": _client_ip(request),
        "source_user_agent": _user_agent(request),
        "crm_synced": False,
        "crm_synced_at": None,
    }
    await db.contact_submissions.insert_one(doc)
    # Best-effort push to CRM (HubSpot). Failures don't break the form — the
    # record sits in db.contact_submissions and the cron job picks it up.
    asyncio.create_task(_crm_push_contact(cid, {
        "email": payload.email.lower().strip(),
        "firstname": payload.name.strip().split(" ", 1)[0],
        "lastname": (payload.name.strip().split(" ", 1)[1] if " " in payload.name.strip() else ""),
        "phone": (payload.phone or "").strip(),
        "country": (payload.country_code or "").strip(),
        "message": payload.message.strip(),
        "hs_lead_status": "NEW",
        "lifecyclestage": "lead",
        "source": "contact_form",
    }))
    return {"contact_id": cid, "received_at": doc["created_at"]}


async def _crm_push_contact(local_id: str, props: dict) -> None:
    """Push a contact submission to HubSpot if HUBSPOT_API_KEY is set.

    No-op (logged) when the key is absent so we never block the form on
    third-party availability. Maps our internal field names to HubSpot's
    standard contact properties (email, firstname, lastname, phone, country,
    hs_lead_status, lifecyclestage). The original submission stays in Mongo
    regardless — that's the source of truth, HubSpot is the projection.
    """
    api_key = os.environ.get("HUBSPOT_API_KEY", "").strip()
    if not api_key:
        logger.info("HUBSPOT_API_KEY not set; queued contact %s for later sync.", local_id)
        return
    try:
        # HubSpot Contacts API. We use upsert-by-email to avoid creating
        # duplicates if the same user re-submits the form.
        url = "https://api.hubapi.com/crm/v3/objects/contacts"
        headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
        # Strip empty values — HubSpot rejects nulls on some properties.
        clean = {k: v for k, v in props.items() if v not in (None, "", [])}
        async with httpx.AsyncClient(timeout=10) as hx:
            r = await hx.post(url, headers=headers, json={"properties": clean})
        if r.status_code in (200, 201):
            await db.contact_submissions.update_one(
                {"contact_id": local_id},
                {"$set": {"crm_synced": True, "crm_synced_at": now_utc().isoformat(), "crm_remote_id": r.json().get("id")}},
            )
        elif r.status_code == 409:
            # Existing contact -> update via PATCH on the contact id from the conflict response.
            remote_id = (r.json().get("message") or "").split("ID: ")[-1].split(" ")[0].strip(".") if r.json() else ""
            if remote_id:
                await hx.patch(f"{url}/{remote_id}", headers=headers, json={"properties": clean})
                await db.contact_submissions.update_one(
                    {"contact_id": local_id},
                    {"$set": {"crm_synced": True, "crm_synced_at": now_utc().isoformat(), "crm_remote_id": remote_id}},
                )
        else:
            logger.warning("HubSpot push for %s returned %s: %s", local_id, r.status_code, r.text[:300])
    except Exception as e:  # noqa: BLE001
        logger.warning("HubSpot push for %s failed: %s", local_id, e)


# NOTE: admin CRM resync + status endpoints are defined further down, after
# require_access_0 is declared (around the admin-auth block). They need
# super-admin (admin_session + access_level=0) auth and would NameError if
# defined here.


@app.get("/api/sitemap.json", include_in_schema=False)
async def sitemap_json() -> dict:
    """Machine-readable sitemap mirror under /api. The frontend serves the
    canonical /sitemap.xml and /robots.txt as static files so they're
    reachable at the site root (search engines expect them there)."""
    public_url = os.environ.get("APP_PUBLIC_URL", "https://roobani.com").rstrip("/")
    routes = [
        {"loc": "/", "priority": 1.0, "changefreq": "weekly"},
        {"loc": "/plans", "priority": 0.9, "changefreq": "weekly"},
        {"loc": "/contact", "priority": 0.7, "changefreq": "monthly"},
        {"loc": "/privacy", "priority": 0.3, "changefreq": "yearly"},
        {"loc": "/terms", "priority": 0.3, "changefreq": "yearly"},
        {"loc": "/cookies", "priority": 0.3, "changefreq": "yearly"},
    ]
    return {"base_url": public_url, "routes": routes, "last_updated": now_utc().isoformat()}


# Market data
_MARKET_CACHE: dict[str, tuple[float, Any]] = {}
_CACHE_TTL = 45.0


def _cache_get(key: str) -> Any:
    item = _MARKET_CACHE.get(key)
    if not item:
        return None
    ts, val = item
    if (asyncio.get_event_loop().time() - ts) > _CACHE_TTL:
        return None
    return val


def _cache_set(key: str, val: Any) -> None:
    _MARKET_CACHE[key] = (asyncio.get_event_loop().time(), val)


@api.get("/market/crypto")
async def crypto_quotes() -> dict:
    cached = _cache_get("crypto")
    if cached:
        return cached
    ids = "bitcoin,ethereum,solana,binancecoin,cardano,ripple"
    url = f"https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids={ids}&price_change_percentage=24h&sparkline=true"
    try:
        async with httpx.AsyncClient(timeout=10) as hx:
            r = await hx.get(url, headers={"accept": "application/json"})
        r.raise_for_status()
        rows = r.json()
        out = {
            "source": "CoinGecko",
            "updated_at": now_utc().isoformat(),
            "items": [
                {
                    "symbol": (it.get("symbol") or "").upper(),
                    "name": it.get("name"),
                    "price": it.get("current_price"),
                    "change_pct_24h": it.get("price_change_percentage_24h"),
                    "sparkline": (it.get("sparkline_in_7d") or {}).get("price", [])[-24:],
                }
                for it in rows
            ],
        }
        _cache_set("crypto", out)
        return out
    except Exception as e:
        logger.warning("crypto fetch failed: %s", e)
        return {"source": "CoinGecko", "updated_at": now_utc().isoformat(), "items": [], "error": "unavailable"}


# Yahoo Finance quote endpoint via public chart API (no auth, public)
YAHOO_SYMBOLS = {
    "indices": [
        ("^GSPC", "S&P 500"),
        ("^IXIC", "NASDAQ"),
        ("^FTSE", "FTSE 100"),
        ("^DJI", "Dow Jones"),
    ],
    "commodities": [
        ("GC=F", "Gold"),
        ("SI=F", "Silver"),
        ("CL=F", "Crude Oil"),
    ],
    "forex": [
        ("EURUSD=X", "EUR / USD"),
        ("GBPUSD=X", "GBP / USD"),
        ("USDJPY=X", "USD / JPY"),
    ],
}


async def _yahoo_one(hx: httpx.AsyncClient, symbol: str, label: str) -> dict | None:
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}?interval=1d&range=5d"
    try:
        r = await hx.get(url, headers={"User-Agent": "Mozilla/5.0"})
        r.raise_for_status()
        data = r.json()
        result = (data.get("chart") or {}).get("result") or []
        if not result:
            return None
        meta = result[0].get("meta") or {}
        price = meta.get("regularMarketPrice")
        prev = meta.get("chartPreviousClose") or meta.get("previousClose")
        change_pct = None
        if price is not None and prev:
            change_pct = ((price - prev) / prev) * 100.0
        spark: list[float] = []
        indicators = (result[0].get("indicators") or {}).get("quote") or [{}]
        closes = indicators[0].get("close") or []
        spark = [c for c in closes if isinstance(c, (int, float))]
        return {
            "symbol": symbol,
            "name": label,
            "price": price,
            "change_pct_24h": change_pct,
            "sparkline": spark[-24:],
        }
    except Exception as e:
        logger.info("yahoo %s failed: %s", symbol, e)
        return None


@api.get("/market/stocks")
async def stocks_quotes() -> dict:
    cached = _cache_get("stocks")
    if cached:
        return cached
    out: dict[str, Any] = {"source": "Yahoo Finance", "updated_at": now_utc().isoformat(), "groups": {}}
    async with httpx.AsyncClient(timeout=10) as hx:
        for group, pairs in YAHOO_SYMBOLS.items():
            items = await asyncio.gather(*[_yahoo_one(hx, s, n) for s, n in pairs])
            out["groups"][group] = [i for i in items if i]
    _cache_set("stocks", out)
    return out


# FX rates for sitewide currency switcher (KES, USD, EUR, GBP)
# Returns USD-base rates: how many units of currency you get for 1 USD.
# Source: Yahoo Finance public chart API. Cached for 30s.
_FX_CACHE: dict[str, tuple[float, Any]] = {}
_FX_TTL = 30.0
SUPPORTED_CURRENCIES = ["USD", "EUR", "GBP", "KES"]


async def _yahoo_fx(hx: httpx.AsyncClient, symbol: str) -> float | None:
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}?interval=1d&range=2d"
    try:
        r = await hx.get(url, headers={"User-Agent": "Mozilla/5.0"})
        r.raise_for_status()
        data = r.json()
        result = (data.get("chart") or {}).get("result") or []
        if not result:
            return None
        meta = result[0].get("meta") or {}
        price = meta.get("regularMarketPrice")
        return float(price) if isinstance(price, (int, float)) else None
    except Exception as e:
        logger.info("yahoo fx %s failed: %s", symbol, e)
        return None


@api.get("/fx/rates")
async def fx_rates() -> dict:
    """Return USD-base rates: {USD:1, EUR:..., GBP:..., KES:...}.

    Falls back to a sane static set if Yahoo is unreachable, so the UI never
    breaks. Cached for 30s.
    """
    cached = _FX_CACHE.get("rates")
    if cached and (asyncio.get_event_loop().time() - cached[0]) < _FX_TTL:
        return cached[1]

    fallback = {"USD": 1.0, "EUR": 0.92, "GBP": 0.79, "KES": 129.0}

    rates: dict[str, float] = {"USD": 1.0}
    try:
        async with httpx.AsyncClient(timeout=8) as hx:
            # Yahoo: EURUSD=X means "1 EUR = X USD" (USD per EUR)
            # We want "USD->EUR" = 1 / (USD per EUR)
            eur_in_usd, gbp_in_usd, usd_per_kes_pair = await asyncio.gather(
                _yahoo_fx(hx, "EURUSD=X"),
                _yahoo_fx(hx, "GBPUSD=X"),
                _yahoo_fx(hx, "KES=X"),  # KES=X is "USD/KES" = KES per 1 USD
            )
        if eur_in_usd and eur_in_usd > 0:
            rates["EUR"] = round(1.0 / eur_in_usd, 6)
        if gbp_in_usd and gbp_in_usd > 0:
            rates["GBP"] = round(1.0 / gbp_in_usd, 6)
        if usd_per_kes_pair and usd_per_kes_pair > 0:
            rates["KES"] = round(float(usd_per_kes_pair), 4)
    except Exception as e:
        logger.warning("fx fetch failed: %s", e)

    # Fill any missing with fallback
    for k, v in fallback.items():
        rates.setdefault(k, v)

    out = {
        "source": "Yahoo Finance",
        "base": "USD",
        "rates": rates,
        "supported": SUPPORTED_CURRENCIES,
        "updated_at": now_utc().isoformat(),
    }
    _FX_CACHE["rates"] = (asyncio.get_event_loop().time(), out)
    return out


# Mount router and CORS
# ============================================================
# Admin Panel V2 - Access 0 (super admin, cap 5) + Access 1 (manager, cap 500)
# Separate auth surface (admin_session_token cookie) from customer auth.
# ============================================================
ADMIN_SESSION_COOKIE = "admin_session_token"
ADMIN_SESSION_TTL_DAYS = 1
ACCESS_0_CAP = 5
ACCESS_1_CAP = 500
ADMIN_LOCKOUT_THRESHOLD = 5
ADMIN_LOCKOUT_MINUTES = 30

# MFA / TOTP
MFA_ISSUER = os.environ.get("MFA_ISSUER", "Roobani Admin")
MFA_CHALLENGE_TTL_MINUTES = 5
MFA_RECOVERY_CODE_COUNT = 8


def _gen_recovery_code() -> str:
    raw = secrets.token_hex(6).upper()  # 12 hex chars
    return f"{raw[0:4]}-{raw[4:8]}-{raw[8:12]}"


def _hash_recovery_code(code: str) -> str:
    return bcrypt.hashpw(code.strip().upper().encode("utf-8"), bcrypt.gensalt(rounds=10)).decode("utf-8")


def _verify_recovery_code(code: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(code.strip().upper().encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


def _qr_svg_data_uri(otpauth_uri: str) -> str:
    """Render the TOTP provisioning URI as an inline SVG QR (base64 data URI)."""
    factory = qrcode.image.svg.SvgImage
    img = qrcode.make(otpauth_uri, image_factory=factory, box_size=10, border=2)
    buf = io.BytesIO()
    img.save(buf)
    svg_bytes = buf.getvalue()
    return "data:image/svg+xml;base64," + base64.b64encode(svg_bytes).decode("ascii")


async def _new_mfa_challenge(admin_id: str, purpose: Literal["login", "setup"], secret_tmp: str | None = None) -> str:
    """Issue a short-lived challenge token bound to an admin + purpose."""
    token = secrets.token_urlsafe(32)
    await db.mfa_challenges.insert_one({
        "challenge_token": token,
        "admin_id": admin_id,
        "purpose": purpose,
        "secret_tmp": secret_tmp,  # only for "setup" — discarded once enrolled
        "expires_at": (now_utc() + timedelta(minutes=MFA_CHALLENGE_TTL_MINUTES)).isoformat(),
        "consumed": False,
        "created_at": now_utc().isoformat(),
    })
    return token


async def _resolve_mfa_challenge(token: str, purpose: str) -> dict | None:
    if not token:
        return None
    ch = await db.mfa_challenges.find_one({"challenge_token": token, "purpose": purpose, "consumed": False}, {"_id": 0})
    if not ch:
        return None
    exp = ch["expires_at"]
    if isinstance(exp, str):
        exp = datetime.fromisoformat(exp)
    if exp.tzinfo is None:
        exp = exp.replace(tzinfo=timezone.utc)
    if exp < now_utc():
        return None
    return ch


async def _consume_mfa_challenge(token: str) -> None:
    await db.mfa_challenges.update_one({"challenge_token": token}, {"$set": {"consumed": True, "consumed_at": now_utc().isoformat()}})


def _client_ip(request: Request | None) -> str:
    if not request:
        return ""
    xff = request.headers.get("x-forwarded-for", "")
    if xff:
        return xff.split(",")[0].strip()
    return (request.client.host if request.client else "") or ""


def _user_agent(request: Request | None) -> str:
    if not request:
        return ""
    return (request.headers.get("user-agent") or "")[:300]


def _redact(d: dict | None) -> dict:
    """Strip sensitive keys before persisting to the audit log."""
    if not d:
        return {}
    redacted: dict[str, Any] = {}
    sensitive = {"password", "password_hash", "totp_secret", "totp_secret_enc", "secret_tmp", "recovery_codes", "recovery_codes_hashed", "session_token", "challenge_token"}
    for k, v in d.items():
        if k in sensitive:
            redacted[k] = "***"
        elif isinstance(v, dict):
            redacted[k] = _redact(v)
        else:
            redacted[k] = v
    return redacted


def _diff_dicts(before: dict | None, after: dict | None) -> dict:
    """Produce a compact {field: {from, to}} diff between two flat dicts."""
    before = before or {}
    after = after or {}
    out: dict[str, Any] = {}
    for k in set(list(before.keys()) + list(after.keys())):
        b = before.get(k, None)
        a = after.get(k, None)
        if b != a:
            out[k] = {"from": b, "to": a}
    return _redact(out)


class AdminLoginIn(BaseModel):
    email: EmailStr
    password: str


class AdminCreateIn(BaseModel):
    full_name: str = Field(min_length=2, max_length=120)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    access_level: int = Field(ge=0, le=1)

    @field_validator("password")
    @classmethod
    def strong(cls, v: str) -> str:
        if not re.search(r"[A-Za-z]", v) or not re.search(r"\d", v):
            raise ValueError("Password must contain letters and digits")
        return v


class AdminUpdateIn(BaseModel):
    full_name: str | None = None
    active: bool | None = None
    password: str | None = None


class AssignmentIn(BaseModel):
    manager_admin_id: str | None = None


class CustomerPatchIn(BaseModel):
    plan_slug: Literal["foundation", "growth", "accelerator", "elite"] | None = None
    kyc_status: Literal["pending", "verified", "rejected"] | None = None
    notes: str | None = None
    blocked: bool | None = None


class HoldingAdjustIn(BaseModel):
    plan_slug: Literal["foundation", "growth", "accelerator", "elite"]
    amount: float
    reason: str = Field(min_length=2, max_length=400)


class SiteSettingsIn(BaseModel):
    maintenance_mode: bool | None = None
    maintenance_message: str | None = None


class WithdrawalRequestIn(BaseModel):
    customer_user_id: str
    amount: float = Field(gt=0)
    reason: str = Field(min_length=2, max_length=400)
    bank_beneficiary: str = Field(min_length=2, max_length=200)


class WithdrawalDecisionIn(BaseModel):
    approve: bool
    note: str | None = None


# MFA models
class MfaSetupVerifyIn(BaseModel):
    challenge_token: str = Field(min_length=10, max_length=128)
    code: str = Field(min_length=6, max_length=6)


class MfaLoginVerifyIn(BaseModel):
    challenge_token: str = Field(min_length=10, max_length=128)
    code: str = Field(min_length=6, max_length=20)  # 6 for TOTP or 14 for "XXXX-XXXX-XXXX"


class MfaDisableIn(BaseModel):
    password: str
    code: str = Field(min_length=6, max_length=20)


class MfaForceDisableIn(BaseModel):
    target_admin_id: str = Field(min_length=2, max_length=64)


class MfaRegenerateRecoveryIn(BaseModel):
    password: str
    code: str = Field(min_length=6, max_length=20)


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
        "mfa_enabled": bool(a.get("mfa_enabled", False)),
        "recovery_codes_remaining": len(a.get("recovery_codes_hashed") or []),
    }


async def _audit(
    admin_id: str,
    action: str,
    target_type: str = "",
    target_id: str = "",
    meta: dict | None = None,
    *,
    request: Request | None = None,
    before: dict | None = None,
    after: dict | None = None,
) -> None:
    """Persist an admin audit event with IP, UA, and before/after diff.

    Backwards-compatible: existing 5-arg callsites still work. The new keyword-only
    args (`request`, `before`, `after`) are optional. When `before` or `after` is
    provided, a redacted field-level diff is included alongside the explicit meta.
    """
    entry: dict[str, Any] = {
        "audit_id": gen_id("aud"),
        "admin_id": admin_id,
        "action": action,
        "target_type": target_type,
        "target_id": target_id,
        "meta": _redact(meta) if meta else {},
        "ip": _client_ip(request),
        "user_agent": _user_agent(request),
        "created_at": now_utc().isoformat(),
    }
    if before is not None or after is not None:
        entry["diff"] = _diff_dicts(before, after)
    await db.admin_audit.insert_one(entry)


# ──────────────────────────────────────────────────────────────────────────
# CRM (HubSpot) admin endpoints
# Defined here (after require_access_0 + _audit) rather than next to
# _crm_push_contact because they need the super-admin dependency, which is
# declared above this line.
# ──────────────────────────────────────────────────────────────────────────
@api.post("/admin/crm/resync")
async def admin_crm_resync(
    request: Request,
    admin: dict = Depends(require_access_0),
    limit: int = 200,
) -> dict:
    """Backfill HubSpot for all queued (crm_synced=false) contact + lead
    submissions. Idempotent — re-runs are safe because _crm_push_contact uses
    upsert-by-email. Returns counters for monitoring.

    Trigger this once after HUBSPOT_API_KEY lands in the environment, then
    leave it on a daily cron if you prefer a belt-and-braces backfill.
    `limit` is applied per-collection (contacts and leads each scan up to
    `limit` queued docs per call), so the absolute max work per call is
    2 × limit (capped at 1000 each → 2000).
    """
    api_key = os.environ.get("HUBSPOT_API_KEY", "").strip()
    if not api_key:
        # Still audit the click — operator visibility into who tried to
        # backfill while the key was missing is useful for incident review.
        await _audit(
            admin["admin_id"],
            "crm.resync.skipped",
            "crm",
            "hubspot",
            {"reason": "no_key", "synced": 0, "queued": 0},
            request=request,
        )
        return {"ok": False, "reason": "HUBSPOT_API_KEY not configured", "synced": 0, "queued": 0}

    limit = max(1, min(1000, int(limit)))
    contacts_synced = 0
    leads_synced = 0
    failed: list[dict] = []

    contact_cursor = db.contact_submissions.find({"crm_synced": False}).limit(limit)
    async for doc in contact_cursor:
        try:
            await _crm_push_contact(doc["contact_id"], {
                "email": dec(doc["email_enc"]),
                "firstname": (doc.get("name") or "").split(" ", 1)[0],
                "lastname": ((doc.get("name") or "").split(" ", 1)[1] if " " in (doc.get("name") or "") else ""),
                "phone": dec(doc["phone_enc"]) if doc.get("phone_enc") else "",
                "country": doc.get("country_code") or "",
                "message": doc.get("message") or "",
                "hs_lead_status": "NEW",
                "lifecyclestage": "lead",
                "source": "contact_form_backfill",
            })
            contacts_synced += 1
        except Exception as e:  # noqa: BLE001
            failed.append({"type": "contact", "id": doc.get("contact_id"), "reason": str(e)[:200]})

    lead_cursor = db.leads.find({"crm_synced": False}).limit(limit)
    async for doc in lead_cursor:
        try:
            await _crm_push_contact(doc["lead_id"], {
                "email": dec(doc["email_enc"]),
                "firstname": (doc.get("full_name") or "").split(" ", 1)[0],
                "lastname": ((doc.get("full_name") or "").split(" ", 1)[1] if " " in (doc.get("full_name") or "") else ""),
                "phone": dec(doc["phone_enc"]) if doc.get("phone_enc") else "",
                "preferred_channel": doc.get("preferred_contact") or "",
                "investment_goal__c": doc.get("investment_goal") or "",
                "budget_range__c": doc.get("budget_range") or "",
                "hs_lead_status": "NEW",
                "lifecyclestage": "marketingqualifiedlead",
                "source": (doc.get("source_page") or "leadform") + "_backfill",
            })
            leads_synced += 1
        except Exception as e:  # noqa: BLE001
            failed.append({"type": "lead", "id": doc.get("lead_id"), "reason": str(e)[:200]})

    # Audit so we have a paper trail of who hit the backfill button.
    await _audit(
        admin["admin_id"],
        "crm.resync",
        "crm",
        "hubspot",
        {"contacts_synced": contacts_synced, "leads_synced": leads_synced, "failed_count": len(failed), "limit": limit},
        request=request,
    )

    pending_contacts = await db.contact_submissions.count_documents({"crm_synced": False})
    pending_leads = await db.leads.count_documents({"crm_synced": False})

    return {
        "ok": True,
        "synced": contacts_synced + leads_synced,
        "contacts_synced": contacts_synced,
        "leads_synced": leads_synced,
        "pending_after": pending_contacts + pending_leads,
        "failed": failed,
    }


@api.get("/admin/crm/status")
async def admin_crm_status(admin: dict = Depends(require_access_0)) -> dict:
    """Snapshot of CRM connectivity + how much is queued."""
    api_key = os.environ.get("HUBSPOT_API_KEY", "").strip()
    pending_contacts = await db.contact_submissions.count_documents({"crm_synced": False})
    pending_leads = await db.leads.count_documents({"crm_synced": False})
    synced_contacts = await db.contact_submissions.count_documents({"crm_synced": True})
    synced_leads = await db.leads.count_documents({"crm_synced": True})
    return {
        "provider": "hubspot",
        "configured": bool(api_key),
        "pending": {"contacts": pending_contacts, "leads": pending_leads},
        "synced": {"contacts": synced_contacts, "leads": synced_leads},
    }



async def _scope_customer_ids(admin: dict) -> list[str]:
    cursor = db.customer_assignments.find({"manager_admin_id": admin["admin_id"]}, {"_id": 0, "customer_user_id": 1})
    return [d["customer_user_id"] async for d in cursor]


async def _ensure_can_see_customer(admin: dict, user_id: str) -> None:
    if int(admin.get("access_level", 1)) == 0:
        return
    a = await db.customer_assignments.find_one(
        {"manager_admin_id": admin["admin_id"], "customer_user_id": user_id}, {"_id": 0}
    )
    if not a:
        raise HTTPException(status_code=403, detail="Customer not assigned to you")


async def _customer_card(u: dict) -> dict:
    user_id = u["user_id"]
    pipeline = [{"$match": {"user_id": user_id}}, {"$group": {"_id": None, "total": {"$sum": "$amount"}}}]
    total_invested = 0.0
    async for d in db.holdings.aggregate(pipeline):
        total_invested = float(d.get("total", 0))
    assignment = await db.customer_assignments.find_one({"customer_user_id": user_id}, {"_id": 0})
    manager = None
    if assignment:
        m = await db.admin_users.find_one({"admin_id": assignment["manager_admin_id"]}, {"_id": 0})
        if m:
            manager = {
                "admin_id": m["admin_id"],
                "full_name": m.get("full_name", ""),
                "email": dec(m.get("email_enc", "")),
            }
    return {
        "user_id": user_id,
        "email": dec(u.get("email_enc", "")) if u.get("email_enc") else u.get("email", ""),
        "full_name": u.get("full_name", ""),
        "auth_provider": u.get("auth_provider", "email"),
        "email_verified": bool(u.get("email_verified", False)),
        "kyc_status": u.get("kyc_status", "pending"),
        "blocked": bool(u.get("blocked", False)),
        "notes": u.get("notes", ""),
        "plan_slug": u.get("plan_slug"),
        "total_invested": total_invested,
        "currency": "USD",
        "manager": manager,
        "created_at": u.get("created_at", ""),
    }


# ---------------- Admin auth ----------------
@api.post("/admin/auth/login")
async def admin_auth_login(
    payload: AdminLoginIn,
    request: Request,
    response: Response,
    _rl: None = Depends(rate_limit("10/minute")),
) -> dict:
    """Step 1 of admin login. Verifies password and returns a short-lived MFA challenge.

    Responses:
      - {"mfa_setup_required": true, "challenge_token": "...", "otpauth_uri": "...", "qr_svg_data_uri": "...", "secret": "..."}
        when the admin has not yet enrolled in TOTP.
      - {"mfa_required": true, "challenge_token": "..."} when MFA is already enabled.

    A full session cookie is NEVER set here. The session is only minted after a
    successful TOTP/recovery verification at /admin/auth/mfa/verify or /setup.
    """
    email_lower = payload.email.lower().strip()
    admin_doc = await db.admin_users.find_one({"email_lookup": email_lower}, {"_id": 0})
    if not admin_doc:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if not admin_doc.get("active", True):
        raise HTTPException(status_code=403, detail="Account disabled")
    locked_until = admin_doc.get("locked_until")
    if locked_until:
        if isinstance(locked_until, str):
            locked_until_dt = datetime.fromisoformat(locked_until)
        else:
            locked_until_dt = locked_until
        if locked_until_dt.tzinfo is None:
            locked_until_dt = locked_until_dt.replace(tzinfo=timezone.utc)
        if locked_until_dt > now_utc():
            raise HTTPException(status_code=423, detail="Account locked. Try again later.")
    if not bcrypt.checkpw(payload.password.encode("utf-8"), admin_doc["password_hash"].encode("utf-8")):
        attempts = int(admin_doc.get("failed_attempts", 0)) + 1
        upd: dict[str, Any] = {"failed_attempts": attempts, "updated_at": now_utc().isoformat()}
        if attempts >= ADMIN_LOCKOUT_THRESHOLD:
            upd["locked_until"] = (now_utc() + timedelta(minutes=ADMIN_LOCKOUT_MINUTES)).isoformat()
            upd["failed_attempts"] = 0
        await db.admin_users.update_one({"admin_id": admin_doc["admin_id"]}, {"$set": upd})
        raise HTTPException(status_code=401, detail="Invalid credentials")
    # Password accepted; gate on MFA.
    await db.admin_users.update_one(
        {"admin_id": admin_doc["admin_id"]},
        {"$set": {"failed_attempts": 0, "locked_until": None}},
    )
    if admin_doc.get("mfa_enabled") and admin_doc.get("totp_secret_enc"):
        token = await _new_mfa_challenge(admin_doc["admin_id"], "login")
        return {"mfa_required": True, "challenge_token": token, "ttl_minutes": MFA_CHALLENGE_TTL_MINUTES}
    # Not enrolled yet — issue a setup challenge with a freshly generated secret.
    secret = pyotp.random_base32()
    email = dec(admin_doc["email_enc"]) if admin_doc.get("email_enc") else email_lower
    otpauth = pyotp.TOTP(secret).provisioning_uri(name=email, issuer_name=MFA_ISSUER)
    qr_data_uri = _qr_svg_data_uri(otpauth)
    token = await _new_mfa_challenge(admin_doc["admin_id"], "setup", secret_tmp=secret)
    return {
        "mfa_setup_required": True,
        "challenge_token": token,
        "otpauth_uri": otpauth,
        "qr_svg_data_uri": qr_data_uri,
        "secret": secret,
        "issuer": MFA_ISSUER,
        "ttl_minutes": MFA_CHALLENGE_TTL_MINUTES,
    }


@api.post("/admin/auth/mfa/setup")
async def admin_auth_mfa_setup(
    payload: MfaSetupVerifyIn,
    request: Request,
    response: Response,
    _rl: None = Depends(rate_limit("10/minute")),
) -> dict:
    """Step 2a: first-time TOTP enrollment. Verifies the user's code against the
    challenge's secret, enables MFA, generates recovery codes, and mints a session."""
    ch = await _resolve_mfa_challenge(payload.challenge_token, "setup")
    if not ch or not ch.get("secret_tmp"):
        raise HTTPException(status_code=400, detail="Invalid or expired challenge")
    secret = ch["secret_tmp"]
    totp = pyotp.TOTP(secret)
    if not totp.verify(payload.code.strip(), valid_window=1):
        raise HTTPException(status_code=401, detail="Invalid authenticator code")
    # Generate recovery codes (returned ONCE in plaintext).
    plain_codes = [_gen_recovery_code() for _ in range(MFA_RECOVERY_CODE_COUNT)]
    hashed_codes = [_hash_recovery_code(c) for c in plain_codes]
    await db.admin_users.update_one(
        {"admin_id": ch["admin_id"]},
        {"$set": {
            "mfa_enabled": True,
            "totp_secret_enc": enc(secret),
            "recovery_codes_hashed": hashed_codes,
            "mfa_enrolled_at": now_utc().isoformat(),
            "last_login_at": now_utc().isoformat(),
            "updated_at": now_utc().isoformat(),
        }},
    )
    await _consume_mfa_challenge(payload.challenge_token)
    await _create_admin_session(ch["admin_id"], response)
    await _audit(ch["admin_id"], "admin.mfa.enroll", "admin", ch["admin_id"], request=request)
    await _audit(ch["admin_id"], "admin.login", request=request, meta={"via": "mfa_setup"})
    admin_doc = await db.admin_users.find_one({"admin_id": ch["admin_id"]}, {"_id": 0})
    return {
        "admin": _public_admin(admin_doc),
        "recovery_codes": plain_codes,
        "warning": "Save these recovery codes now. They cannot be shown again.",
    }


@api.post("/admin/auth/mfa/verify")
async def admin_auth_mfa_verify(
    payload: MfaLoginVerifyIn,
    request: Request,
    response: Response,
    _rl: None = Depends(rate_limit("10/minute")),
) -> dict:
    """Step 2b: subsequent login verification. Accepts TOTP code or recovery code."""
    ch = await _resolve_mfa_challenge(payload.challenge_token, "login")
    if not ch:
        raise HTTPException(status_code=400, detail="Invalid or expired challenge")
    admin_doc = await db.admin_users.find_one({"admin_id": ch["admin_id"]}, {"_id": 0})
    if not admin_doc or not admin_doc.get("active", True) or not admin_doc.get("mfa_enabled"):
        raise HTTPException(status_code=400, detail="MFA not configured for this account")
    code_raw = payload.code.strip()
    is_totp = len(code_raw) == 6 and code_raw.isdigit()
    accepted = False
    via = ""
    if is_totp:
        secret = dec(admin_doc.get("totp_secret_enc", ""))
        if secret and pyotp.TOTP(secret).verify(code_raw, valid_window=1):
            accepted = True
            via = "totp"
    if not accepted:
        # Try recovery codes (single-use; remove on success).
        codes = list(admin_doc.get("recovery_codes_hashed") or [])
        for i, h in enumerate(codes):
            if _verify_recovery_code(code_raw, h):
                codes.pop(i)
                await db.admin_users.update_one(
                    {"admin_id": admin_doc["admin_id"]},
                    {"$set": {"recovery_codes_hashed": codes, "updated_at": now_utc().isoformat()}},
                )
                accepted = True
                via = "recovery"
                break
    if not accepted:
        await _audit(admin_doc["admin_id"], "admin.mfa.fail", request=request)
        raise HTTPException(status_code=401, detail="Invalid authenticator code")
    await _consume_mfa_challenge(payload.challenge_token)
    await db.admin_users.update_one(
        {"admin_id": admin_doc["admin_id"]},
        {"$set": {"last_login_at": now_utc().isoformat()}},
    )
    await _create_admin_session(admin_doc["admin_id"], response)
    await _audit(admin_doc["admin_id"], "admin.login", request=request, meta={"via": via})
    return {"admin": _public_admin(admin_doc), "via": via, "remaining_recovery_codes": len(admin_doc.get("recovery_codes_hashed") or []) - (1 if via == "recovery" else 0)}


@api.post("/admin/auth/mfa/disable")
async def admin_auth_mfa_disable(
    payload: MfaDisableIn,
    request: Request,
    admin: dict = Depends(current_admin),
    _rl: None = Depends(rate_limit("5/minute")),
) -> dict:
    """Self-service MFA disable. Requires fresh password + current TOTP/recovery code."""
    if not bcrypt.checkpw(payload.password.encode("utf-8"), admin["password_hash"].encode("utf-8")):
        raise HTTPException(status_code=401, detail="Invalid password")
    if not admin.get("mfa_enabled"):
        raise HTTPException(status_code=400, detail="MFA is not enabled")
    code_raw = payload.code.strip()
    ok = False
    if len(code_raw) == 6 and code_raw.isdigit():
        secret = dec(admin.get("totp_secret_enc", ""))
        ok = bool(secret and pyotp.TOTP(secret).verify(code_raw, valid_window=1))
    if not ok:
        for h in (admin.get("recovery_codes_hashed") or []):
            if _verify_recovery_code(code_raw, h):
                ok = True
                break
    if not ok:
        raise HTTPException(status_code=401, detail="Invalid authenticator code")
    await db.admin_users.update_one(
        {"admin_id": admin["admin_id"]},
        {"$set": {"mfa_enabled": False, "totp_secret_enc": None, "recovery_codes_hashed": [], "updated_at": now_utc().isoformat()}},
    )
    await _audit(admin["admin_id"], "admin.mfa.disable", "admin", admin["admin_id"], request=request, meta={"by": "self"})
    return {"ok": True}


@api.post("/admin/auth/mfa/force-disable")
async def admin_auth_mfa_force_disable(
    payload: MfaForceDisableIn,
    request: Request,
    admin: dict = Depends(require_access_0),
) -> dict:
    """Super-admin force-disables MFA on another admin account (e.g. lost authenticator).
    The target admin will be prompted to re-enroll on next login."""
    target = await db.admin_users.find_one({"admin_id": payload.target_admin_id}, {"_id": 0})
    if not target:
        raise HTTPException(status_code=404, detail="Admin not found")
    if payload.target_admin_id == admin["admin_id"]:
        raise HTTPException(status_code=400, detail="Use /admin/auth/mfa/disable for self-disable")
    await db.admin_users.update_one(
        {"admin_id": payload.target_admin_id},
        {"$set": {"mfa_enabled": False, "totp_secret_enc": None, "recovery_codes_hashed": [], "updated_at": now_utc().isoformat()}},
    )
    # Revoke all active sessions for the target so they re-enroll next login.
    await db.admin_sessions.delete_many({"admin_id": payload.target_admin_id})
    await _audit(admin["admin_id"], "admin.mfa.force_disable", "admin", payload.target_admin_id, request=request, meta={"by": "super_admin"})
    return {"ok": True}


@api.post("/admin/auth/mfa/recovery/regenerate")
async def admin_auth_mfa_regenerate_recovery(
    payload: MfaRegenerateRecoveryIn,
    request: Request,
    admin: dict = Depends(current_admin),
    _rl: None = Depends(rate_limit("5/minute")),
) -> dict:
    """Re-generate recovery codes. Requires fresh password + current TOTP."""
    if not bcrypt.checkpw(payload.password.encode("utf-8"), admin["password_hash"].encode("utf-8")):
        raise HTTPException(status_code=401, detail="Invalid password")
    if not admin.get("mfa_enabled"):
        raise HTTPException(status_code=400, detail="MFA is not enabled")
    code_raw = payload.code.strip()
    if not (len(code_raw) == 6 and code_raw.isdigit()):
        raise HTTPException(status_code=400, detail="A 6-digit authenticator code is required")
    secret = dec(admin.get("totp_secret_enc", ""))
    if not (secret and pyotp.TOTP(secret).verify(code_raw, valid_window=1)):
        raise HTTPException(status_code=401, detail="Invalid authenticator code")
    plain_codes = [_gen_recovery_code() for _ in range(MFA_RECOVERY_CODE_COUNT)]
    hashed_codes = [_hash_recovery_code(c) for c in plain_codes]
    await db.admin_users.update_one(
        {"admin_id": admin["admin_id"]},
        {"$set": {"recovery_codes_hashed": hashed_codes, "updated_at": now_utc().isoformat()}},
    )
    await _audit(admin["admin_id"], "admin.mfa.recovery.regenerate", "admin", admin["admin_id"], request=request)
    return {"recovery_codes": plain_codes, "warning": "Save these recovery codes now. They cannot be shown again."}


@api.post("/admin/auth/logout")
async def admin_auth_logout(
    response: Response,
    admin_session_token: Annotated[str | None, Cookie(alias=ADMIN_SESSION_COOKIE)] = None,
) -> dict:
    if admin_session_token:
        await db.admin_sessions.delete_one({"session_token": admin_session_token})
    response.delete_cookie(key=ADMIN_SESSION_COOKIE, path="/")
    return {"ok": True}


@api.get("/admin/auth/me")
async def admin_auth_me(admin: dict = Depends(current_admin)) -> dict:
    return _public_admin(admin)


# ---------------- Admin user CRUD (Access 0 only) ----------------
@api.get("/admin/admins")
async def admin_list_admins(
    admin: dict = Depends(require_access_0),
    q: str = "",
    access_level: str = "",
    active: str = "",
    sort: str = "created_at",
    order: str = "desc",
    offset: int = 0,
    limit: int = 50,
) -> dict:
    f: dict[str, Any] = {}
    if q:
        f["$or"] = [
            {"full_name": {"$regex": re.escape(q), "$options": "i"}},
            {"email_lookup": {"$regex": re.escape(q.lower()), "$options": "i"}},
            {"admin_id": {"$regex": re.escape(q), "$options": "i"}},
        ]
    if access_level in ("0", "1"):
        f["access_level"] = int(access_level)
    if active in ("true", "false"):
        f["active"] = (active == "true")

    SORTABLE = {"created_at", "full_name", "email_lookup", "access_level", "active", "last_login_at"}
    sort_field = sort if sort in SORTABLE else "created_at"
    sort_dir = -1 if order != "asc" else 1
    limit = max(1, min(int(limit), 500))
    offset = max(0, int(offset))

    total = await db.admin_users.count_documents(f)
    cursor = db.admin_users.find(f, {"_id": 0}).sort(sort_field, sort_dir).skip(offset).limit(limit)
    items = [_public_admin(a) async for a in cursor]

    # Caps + counts are global (not filter-affected).
    counts = {
        "access_0": await db.admin_users.count_documents({"access_level": 0}),
        "access_1": await db.admin_users.count_documents({"access_level": 1}),
    }
    return {
        "items": items,
        "total": total,
        "limit": limit,
        "offset": offset,
        "caps": {"access_0": ACCESS_0_CAP, "access_1": ACCESS_1_CAP},
        "counts": counts,
    }


class AdminBulkDeleteIn(BaseModel):
    admin_ids: list[str] = Field(min_length=1, max_length=50)


@api.post("/admin/admins/bulk-delete")
async def admin_bulk_delete_admins(payload: AdminBulkDeleteIn, request: Request, admin: dict = Depends(require_access_0)) -> dict:
    """Bulk-delete admins. Same guardrails as the single-delete path apply
    per-item: cannot self-delete, cannot drop below 1 active super admin.
    Returns per-item success/failure so the UI can highlight partials."""
    succeeded: list[str] = []
    failed: list[dict] = []
    for tid in payload.admin_ids:
        if tid == admin["admin_id"]:
            failed.append({"admin_id": tid, "reason": "Cannot delete your own account"})
            continue
        target = await db.admin_users.find_one({"admin_id": tid}, {"_id": 0})
        if not target:
            failed.append({"admin_id": tid, "reason": "Not found"})
            continue
        if int(target.get("access_level", 1)) == 0:
            active_a0 = await db.admin_users.count_documents({"access_level": 0, "active": True})
            if active_a0 <= 1:
                failed.append({"admin_id": tid, "reason": "Cannot delete the last super admin"})
                continue
        await db.admin_users.delete_one({"admin_id": tid})
        await db.admin_sessions.delete_many({"admin_id": tid})
        await db.customer_assignments.delete_many({"manager_admin_id": tid})
        await _audit(
            admin["admin_id"],
            "admin.delete",
            "admin",
            tid,
            {"via": "bulk"},
            request=request,
            before={"email_lookup": target.get("email_lookup"), "full_name": target.get("full_name"), "access_level": target.get("access_level"), "active": target.get("active")},
        )
        succeeded.append(tid)
    return {"succeeded": succeeded, "failed": failed}


@api.post("/admin/admins", status_code=201)
async def admin_create_admin(payload: AdminCreateIn, request: Request, admin: dict = Depends(require_access_0)) -> dict:
    email_lower = payload.email.lower().strip()
    if await db.admin_users.find_one({"email_lookup": email_lower}, {"_id": 0}):
        raise HTTPException(status_code=409, detail="Admin with this email already exists")
    cap = ACCESS_0_CAP if payload.access_level == 0 else ACCESS_1_CAP
    count = await db.admin_users.count_documents({"access_level": payload.access_level})
    if count >= cap:
        raise HTTPException(status_code=400, detail=f"Cap reached for access level {payload.access_level} (max {cap})")
    pw = bcrypt.hashpw(payload.password.encode("utf-8"), bcrypt.gensalt(rounds=12)).decode("utf-8")
    aid = gen_id("adm")
    doc = {
        "admin_id": aid,
        "email_lookup": email_lower,
        "email_enc": enc(email_lower),
        "full_name": payload.full_name.strip(),
        "password_hash": pw,
        "access_level": int(payload.access_level),
        "active": True,
        "failed_attempts": 0,
        "locked_until": None,
        "created_by": admin["admin_id"],
        "created_at": now_utc().isoformat(),
        "updated_at": now_utc().isoformat(),
    }
    await db.admin_users.insert_one(doc)
    await _audit(admin["admin_id"], "admin.create", "admin", aid, {"email": email_lower, "access_level": payload.access_level}, request=request, after={"email": email_lower, "full_name": payload.full_name.strip(), "access_level": int(payload.access_level), "active": True})
    return _public_admin(doc)


@api.patch("/admin/admins/{target_id}")
async def admin_update_admin(target_id: str, payload: AdminUpdateIn, request: Request, admin: dict = Depends(require_access_0)) -> dict:
    target = await db.admin_users.find_one({"admin_id": target_id}, {"_id": 0})
    if not target:
        raise HTTPException(status_code=404, detail="Admin not found")
    before_snapshot = {
        "full_name": target.get("full_name"),
        "active": target.get("active"),
        "access_level": target.get("access_level"),
    }
    upd: dict[str, Any] = {"updated_at": now_utc().isoformat()}
    if payload.full_name is not None:
        upd["full_name"] = payload.full_name.strip()
    if payload.active is not None:
        if target_id == admin["admin_id"] and not payload.active:
            raise HTTPException(status_code=400, detail="Cannot disable your own account")
        if target["access_level"] == 0 and not payload.active:
            active_a0 = await db.admin_users.count_documents({"access_level": 0, "active": True})
            if active_a0 <= 1:
                raise HTTPException(status_code=400, detail="Cannot disable the last active super admin")
        upd["active"] = bool(payload.active)
        if not payload.active:
            await db.admin_sessions.delete_many({"admin_id": target_id})
    if payload.password is not None:
        if len(payload.password) < 8 or not re.search(r"[A-Za-z]", payload.password) or not re.search(r"\d", payload.password):
            raise HTTPException(status_code=400, detail="Password too weak")
        upd["password_hash"] = bcrypt.hashpw(payload.password.encode("utf-8"), bcrypt.gensalt(rounds=12)).decode("utf-8")
        upd["failed_attempts"] = 0
        upd["locked_until"] = None
    await db.admin_users.update_one({"admin_id": target_id}, {"$set": upd})
    fresh = await db.admin_users.find_one({"admin_id": target_id}, {"_id": 0})
    after_snapshot = {
        "full_name": fresh.get("full_name"),
        "active": fresh.get("active"),
        "access_level": fresh.get("access_level"),
    }
    if "password_hash" in upd:
        after_snapshot["password_changed"] = True
    await _audit(
        admin["admin_id"],
        "admin.update",
        "admin",
        target_id,
        {k: (True if k == "password_hash" else v) for k, v in upd.items() if k != "updated_at"},
        request=request,
        before=before_snapshot,
        after=after_snapshot,
    )
    return _public_admin(fresh)


@api.delete("/admin/admins/{target_id}")
async def admin_delete_admin(target_id: str, request: Request, admin: dict = Depends(require_access_0)) -> dict:
    if target_id == admin["admin_id"]:
        raise HTTPException(status_code=400, detail="Cannot delete your own account")
    target = await db.admin_users.find_one({"admin_id": target_id}, {"_id": 0})
    if not target:
        raise HTTPException(status_code=404, detail="Admin not found")
    if target["access_level"] == 0:
        active_a0 = await db.admin_users.count_documents({"access_level": 0, "active": True})
        if active_a0 <= 1:
            raise HTTPException(status_code=400, detail="Cannot delete the last super admin")
    await db.admin_users.delete_one({"admin_id": target_id})
    await db.admin_sessions.delete_many({"admin_id": target_id})
    await db.customer_assignments.delete_many({"manager_admin_id": target_id})
    await _audit(admin["admin_id"], "admin.delete", "admin", target_id, request=request, before={"email_lookup": target.get("email_lookup"), "full_name": target.get("full_name"), "access_level": target.get("access_level"), "active": target.get("active")})
    return {"ok": True}


# ---------------- Customer management ----------------
@api.get("/admin/customers")
async def admin_list_customers(
    admin: dict = Depends(current_admin),
    q: str = "",
    kyc: str = "",
    plan: str = "",
    blocked: str = "",
    manager_admin_id: str = "",
    sort: str = "created_at",
    order: str = "desc",
    offset: int = 0,
    limit: int = 50,
) -> dict:
    """Server-side paginated + filterable customer list."""
    base_filter: dict[str, Any] = {}
    if int(admin.get("access_level", 1)) == 1:
        ids = await _scope_customer_ids(admin)
        base_filter["user_id"] = {"$in": ids}
    if q:
        base_filter["$or"] = [
            {"full_name": {"$regex": re.escape(q), "$options": "i"}},
            {"email_lookup": {"$regex": re.escape(q.lower()), "$options": "i"}},
        ]
    if kyc:
        base_filter["kyc_status"] = kyc
    if plan:
        base_filter["plan_slug"] = plan
    if blocked in ("true", "false"):
        base_filter["blocked"] = (blocked == "true")
    # Manager filter (super admin only — managers are already scoped)
    if manager_admin_id and int(admin.get("access_level", 1)) == 0:
        assigned_ids = [a["customer_user_id"] async for a in db.customer_assignments.find({"manager_admin_id": manager_admin_id}, {"_id": 0, "customer_user_id": 1})]
        existing = base_filter.get("user_id", {}).get("$in", None) if isinstance(base_filter.get("user_id"), dict) else None
        if existing is not None:
            base_filter["user_id"] = {"$in": list(set(existing) & set(assigned_ids))}
        else:
            base_filter["user_id"] = {"$in": assigned_ids}

    SORTABLE = {"created_at", "full_name", "email_lookup", "plan_slug", "kyc_status"}
    sort_field = sort if sort in SORTABLE else "created_at"
    sort_dir = -1 if order != "asc" else 1
    limit = max(1, min(int(limit), 500))
    offset = max(0, int(offset))

    total = await db.users.count_documents(base_filter)
    cursor = (
        db.users.find(base_filter, {"_id": 0, "password_hash": 0})
        .sort(sort_field, sort_dir)
        .skip(offset)
        .limit(limit)
    )
    items = [await _customer_card(u) async for u in cursor]
    return {
        "items": items,
        "total": total,
        "limit": limit,
        "offset": offset,
        "scope": "all" if int(admin.get("access_level", 1)) == 0 else "assigned",
    }


class CustomerBulkIn(BaseModel):
    action: Literal["block", "unblock", "set_kyc"]
    user_ids: list[str] = Field(min_length=1, max_length=500)
    kyc_status: str | None = None  # used when action == "set_kyc"


@api.post("/admin/customers/bulk")
async def admin_bulk_customers(payload: CustomerBulkIn, request: Request, admin: dict = Depends(current_admin)) -> dict:
    """Apply a single change to many customers in one call. Per-item errors are
    captured in `failed` so the UI can highlight partial failures."""
    if payload.action == "set_kyc" and payload.kyc_status not in ("pending", "verified", "rejected"):
        raise HTTPException(status_code=400, detail="Invalid kyc_status")
    succeeded: list[str] = []
    failed: list[dict] = []
    for uid in payload.user_ids:
        try:
            # Manager scope check
            await _ensure_can_see_customer(admin, uid)
            u = await db.users.find_one({"user_id": uid}, {"_id": 0})
            if not u:
                failed.append({"user_id": uid, "reason": "not_found"})
                continue
            before = {"blocked": u.get("blocked"), "kyc_status": u.get("kyc_status")}
            upd: dict[str, Any] = {"updated_at": now_utc().isoformat()}
            if payload.action == "block":
                upd["blocked"] = True
                await db.user_sessions.delete_many({"user_id": uid})
            elif payload.action == "unblock":
                upd["blocked"] = False
            elif payload.action == "set_kyc":
                upd["kyc_status"] = payload.kyc_status
            await db.users.update_one({"user_id": uid}, {"$set": upd})
            after = {**before, **{k: v for k, v in upd.items() if k != "updated_at"}}
            await _audit(
                admin["admin_id"],
                f"customer.bulk.{payload.action}",
                "user",
                uid,
                {"via": "bulk"},
                request=request,
                before=before,
                after=after,
            )
            succeeded.append(uid)
        except HTTPException as e:
            failed.append({"user_id": uid, "reason": e.detail})
        except Exception as e:  # noqa: BLE001
            failed.append({"user_id": uid, "reason": str(e)[:120]})
    return {"succeeded": succeeded, "failed": failed}


@api.get("/admin/customers/{user_id}")
async def admin_get_customer(user_id: str, admin: dict = Depends(current_admin)) -> dict:
    await _ensure_can_see_customer(admin, user_id)
    u = await db.users.find_one({"user_id": user_id}, {"_id": 0, "password_hash": 0})
    if not u:
        raise HTTPException(status_code=404, detail="Customer not found")
    card = await _customer_card(u)
    holdings = [doc async for doc in db.holdings.find({"user_id": user_id}, {"_id": 0}).sort("created_at", -1)]
    transactions = [
        doc async for doc in db.payment_transactions.find({"user_id": user_id}, {"_id": 0}).sort("created_at", -1).limit(200)
    ]
    return {"customer": card, "holdings": holdings, "transactions": transactions}


@api.patch("/admin/customers/{user_id}")
async def admin_patch_customer(user_id: str, payload: CustomerPatchIn, request: Request, admin: dict = Depends(current_admin)) -> dict:
    await _ensure_can_see_customer(admin, user_id)
    u = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    if not u:
        raise HTTPException(status_code=404, detail="Customer not found")
    before_snapshot = {
        "plan_slug": u.get("plan_slug"),
        "kyc_status": u.get("kyc_status"),
        "blocked": u.get("blocked"),
    }
    upd: dict[str, Any] = {"updated_at": now_utc().isoformat()}
    changes: dict[str, Any] = {}
    if payload.plan_slug is not None:
        upd["plan_slug"] = payload.plan_slug
        changes["plan_slug"] = payload.plan_slug
    if payload.kyc_status is not None:
        upd["kyc_status"] = payload.kyc_status
        changes["kyc_status"] = payload.kyc_status
    if payload.notes is not None:
        upd["notes"] = payload.notes[:2000]
        changes["notes"] = "updated"
    if payload.blocked is not None:
        upd["blocked"] = bool(payload.blocked)
        changes["blocked"] = payload.blocked
        if payload.blocked:
            await db.user_sessions.delete_many({"user_id": user_id})
    await db.users.update_one({"user_id": user_id}, {"$set": upd})
    fresh = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    after_snapshot = {
        "plan_slug": fresh.get("plan_slug"),
        "kyc_status": fresh.get("kyc_status"),
        "blocked": fresh.get("blocked"),
    }
    await _audit(admin["admin_id"], "customer.update", "user", user_id, changes, request=request, before=before_snapshot, after=after_snapshot)
    return await _customer_card(fresh)


@api.post("/admin/customers/{user_id}/assign")
async def admin_assign_customer(user_id: str, payload: AssignmentIn, request: Request, admin: dict = Depends(require_access_0)) -> dict:
    u = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    if not u:
        raise HTTPException(status_code=404, detail="Customer not found")
    prior = await db.customer_assignments.find_one({"customer_user_id": user_id}, {"_id": 0}) or {}
    prior_manager = prior.get("manager_admin_id")
    if payload.manager_admin_id:
        m = await db.admin_users.find_one({"admin_id": payload.manager_admin_id}, {"_id": 0})
        if not m:
            raise HTTPException(status_code=404, detail="Manager admin not found")
        if int(m.get("access_level", 1)) != 1:
            raise HTTPException(status_code=400, detail="Target must be an Access 1 manager")
        await db.customer_assignments.update_one(
            {"customer_user_id": user_id},
            {
                "$set": {
                    "customer_user_id": user_id,
                    "manager_admin_id": payload.manager_admin_id,
                    "assigned_at": now_utc().isoformat(),
                    "assigned_by": admin["admin_id"],
                }
            },
            upsert=True,
        )
        await _audit(admin["admin_id"], "customer.assign", "user", user_id, {"manager_admin_id": payload.manager_admin_id}, request=request, before={"manager_admin_id": prior_manager}, after={"manager_admin_id": payload.manager_admin_id})
    else:
        await db.customer_assignments.delete_one({"customer_user_id": user_id})
        await _audit(admin["admin_id"], "customer.unassign", "user", user_id, request=request, before={"manager_admin_id": prior_manager}, after={"manager_admin_id": None})
    return {"ok": True}


@api.post("/admin/customers/{user_id}/holdings/adjust")
async def admin_adjust_holding(user_id: str, payload: HoldingAdjustIn, request: Request, admin: dict = Depends(current_admin)) -> dict:
    await _ensure_can_see_customer(admin, user_id)
    if not await db.users.find_one({"user_id": user_id}, {"_id": 0}):
        raise HTTPException(status_code=404, detail="Customer not found")
    hid = gen_id("hold")
    await db.holdings.insert_one({
        "holding_id": hid,
        "user_id": user_id,
        "plan_slug": payload.plan_slug,
        "amount": float(payload.amount),
        "currency": "usd",
        "adjustment": True,
        "adjusted_by": admin["admin_id"],
        "reason": payload.reason,
        "created_at": now_utc().isoformat(),
    })
    await _audit(
        admin["admin_id"],
        "holding.adjust",
        "user",
        user_id,
        {"plan_slug": payload.plan_slug, "amount": payload.amount, "reason": payload.reason},
        request=request,
        after={"plan_slug": payload.plan_slug, "amount": float(payload.amount), "reason": payload.reason},
    )
    return {"holding_id": hid, "ok": True}


# ---------------- Site settings ----------------
@api.get("/admin/settings")
async def admin_get_settings(admin: dict = Depends(current_admin)) -> dict:
    doc = await db.site_settings.find_one({"_id": "global"}) or {}
    return {
        "maintenance_mode": bool(doc.get("maintenance_mode", False)),
        "maintenance_message": doc.get(
            "maintenance_message",
            "We are performing scheduled maintenance. We will be back shortly.",
        ),
    }


@api.patch("/admin/settings")
async def admin_patch_settings(payload: SiteSettingsIn, request: Request, admin: dict = Depends(require_access_0)) -> dict:
    prior = await db.site_settings.find_one({"_id": "global"}) or {}
    before_snapshot = {
        "maintenance_mode": bool(prior.get("maintenance_mode", False)),
        "maintenance_message": prior.get("maintenance_message", ""),
    }
    upd: dict[str, Any] = {"updated_at": now_utc().isoformat()}
    if payload.maintenance_mode is not None:
        upd["maintenance_mode"] = bool(payload.maintenance_mode)
    if payload.maintenance_message is not None:
        upd["maintenance_message"] = payload.maintenance_message[:1000]
    await db.site_settings.update_one({"_id": "global"}, {"$set": upd}, upsert=True)
    fresh = await db.site_settings.find_one({"_id": "global"}) or {}
    after_snapshot = {
        "maintenance_mode": bool(fresh.get("maintenance_mode", False)),
        "maintenance_message": fresh.get("maintenance_message", ""),
    }
    await _audit(admin["admin_id"], "settings.update", "settings", "global", {k: v for k, v in upd.items() if k != "updated_at"}, request=request, before=before_snapshot, after=after_snapshot)
    return await admin_get_settings(admin)


@api.get("/public/settings")
async def public_settings() -> dict:
    doc = await db.site_settings.find_one({"_id": "global"}) or {}
    return {
        "maintenance_mode": bool(doc.get("maintenance_mode", False)),
        "maintenance_message": doc.get("maintenance_message", "") if doc.get("maintenance_mode") else "",
    }


# ---------------- Audit ----------------
@api.get("/admin/audit")
async def admin_get_audit(
    admin: dict = Depends(require_access_0),
    limit: int = 200,
    offset: int = 0,
    q: str = "",
    action: str = "",
    admin_id: str = "",
    target_type: str = "",
    from_date: str = "",
    to_date: str = "",
) -> dict:
    """Return audit log entries with optional filters.
    - q: free-text search across action/target_id/admin_id
    - action: exact match on action (e.g. "admin.login", "customer.update")
    - admin_id: filter by acting admin
    - target_type: filter by target type (admin/user/withdrawal/...)
    - from_date / to_date: ISO date strings (inclusive)
    """
    f: dict[str, Any] = {}
    if action:
        f["action"] = action
    if admin_id:
        f["admin_id"] = admin_id
    if target_type:
        f["target_type"] = target_type
    if from_date or to_date:
        rng: dict[str, str] = {}
        if from_date:
            rng["$gte"] = from_date
        if to_date:
            rng["$lte"] = to_date
        f["created_at"] = rng
    if q:
        f["$or"] = [
            {"action": {"$regex": re.escape(q), "$options": "i"}},
            {"target_id": {"$regex": re.escape(q), "$options": "i"}},
            {"admin_id": {"$regex": re.escape(q), "$options": "i"}},
        ]
    total = await db.admin_audit.count_documents(f)
    cursor = db.admin_audit.find(f, {"_id": 0}).sort("created_at", -1).skip(int(offset)).limit(int(limit))
    items: list[dict] = []
    async for a in cursor:
        admin_doc = await db.admin_users.find_one(
            {"admin_id": a["admin_id"]}, {"_id": 0, "full_name": 1, "email_enc": 1, "access_level": 1}
        )
        items.append({
            **a,
            "admin": {
                "admin_id": a["admin_id"],
                "full_name": (admin_doc or {}).get("full_name", ""),
                "email": dec((admin_doc or {}).get("email_enc", "")) if admin_doc else "",
                "access_level": (admin_doc or {}).get("access_level"),
            },
        })
    return {"items": items, "total": total, "limit": int(limit), "offset": int(offset)}


# ---------------- Overview dashboard ----------------
@api.get("/admin/dashboard")
async def admin_dashboard(admin: dict = Depends(current_admin)) -> dict:
    is_super = int(admin.get("access_level", 1)) == 0
    if is_super:
        users = await db.users.count_documents({})
        leads = await db.leads.count_documents({})
        contacts = await db.contact_submissions.count_documents({})
        holdings = await db.holdings.count_documents({})
        managers = await db.admin_users.count_documents({"access_level": 1, "active": True})
        super_admins = await db.admin_users.count_documents({"access_level": 0, "active": True})
        pipeline = [{"$group": {"_id": None, "total": {"$sum": "$amount"}}}]
        total_invested = 0.0
        async for d in db.holdings.aggregate(pipeline):
            total_invested = float(d.get("total", 0))
        recent = []
        async for u in db.users.find({}, {"_id": 0, "password_hash": 0}).sort("created_at", -1).limit(10):
            recent.append(await _customer_card(u))
        pending_withdrawals = await db.withdrawals.count_documents({"status": "pending"})
        return {
            "is_super": True,
            "metrics": {
                "users": users,
                "leads": leads,
                "contacts": contacts,
                "holdings": holdings,
                "managers": managers,
                "super_admins": super_admins,
                "total_invested": total_invested,
                "pending_withdrawals": pending_withdrawals,
            },
            "recent_customers": recent,
        }
    ids = await _scope_customer_ids(admin)
    pipeline = [
        {"$match": {"user_id": {"$in": ids}}},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}}},
    ]
    total_aum = 0.0
    async for d in db.holdings.aggregate(pipeline):
        total_aum = float(d.get("total", 0))
    recent = []
    async for u in (
        db.users.find({"user_id": {"$in": ids}}, {"_id": 0, "password_hash": 0}).sort("created_at", -1).limit(10)
    ):
        recent.append(await _customer_card(u))
    pending_withdrawals = await db.withdrawals.count_documents({
        "status": "pending",
        "requested_by_admin_id": admin["admin_id"],
    })
    return {
        "is_super": False,
        "metrics": {
            "my_customers": len(ids),
            "total_aum": total_aum,
            "pending_withdrawals": pending_withdrawals,
        },
        "recent_customers": recent,
    }


# ---------------- Withdrawals (request -> approve flow) ----------------
@api.post("/admin/withdrawals", status_code=201)
async def admin_create_withdrawal(payload: WithdrawalRequestIn, request: Request, admin: dict = Depends(current_admin)) -> dict:
    await _ensure_can_see_customer(admin, payload.customer_user_id)
    wid = gen_id("wd")
    is_super = int(admin.get("access_level", 1)) == 0
    doc = {
        "withdrawal_id": wid,
        "customer_user_id": payload.customer_user_id,
        "amount": float(payload.amount),
        "currency": "USD",
        "reason": payload.reason,
        "bank_beneficiary": payload.bank_beneficiary,
        "status": "approved" if is_super else "pending",
        "requested_by_admin_id": admin["admin_id"],
        "approved_by_admin_id": admin["admin_id"] if is_super else None,
        "created_at": now_utc().isoformat(),
        "updated_at": now_utc().isoformat(),
    }
    await db.withdrawals.insert_one(doc)
    await _audit(
        admin["admin_id"],
        "withdrawal.request" if not is_super else "withdrawal.approve",
        "withdrawal",
        wid,
        {"amount": payload.amount, "customer_user_id": payload.customer_user_id},
        request=request,
        after={"amount": float(payload.amount), "currency": "USD", "status": doc["status"], "customer_user_id": payload.customer_user_id},
    )
    return {k: v for k, v in doc.items() if k != "_id"}


@api.get("/admin/withdrawals")
async def admin_list_withdrawals(
    admin: dict = Depends(current_admin),
    status_filter: str | None = None,
    q: str = "",
    from_date: str = "",
    to_date: str = "",
    sort: str = "created_at",
    order: str = "desc",
    offset: int = 0,
    limit: int = 50,
) -> dict:
    base_filter: dict[str, Any] = {}
    if status_filter:
        base_filter["status"] = status_filter
    if int(admin.get("access_level", 1)) == 1:
        base_filter["requested_by_admin_id"] = admin["admin_id"]
    if q:
        base_filter["$or"] = [
            {"customer_user_id": {"$regex": re.escape(q), "$options": "i"}},
            {"withdrawal_id": {"$regex": re.escape(q), "$options": "i"}},
            {"bank_beneficiary": {"$regex": re.escape(q), "$options": "i"}},
            {"destination_summary": {"$regex": re.escape(q), "$options": "i"}},
        ]
    if from_date or to_date:
        rng: dict[str, str] = {}
        if from_date:
            rng["$gte"] = from_date
        if to_date:
            rng["$lte"] = to_date
        base_filter["created_at"] = rng

    SORTABLE = {"created_at", "amount", "status"}
    sort_field = sort if sort in SORTABLE else "created_at"
    sort_dir = -1 if order != "asc" else 1
    limit = max(1, min(int(limit), 500))
    offset = max(0, int(offset))

    total = await db.withdrawals.count_documents(base_filter)
    cursor = (
        db.withdrawals.find(base_filter, {"_id": 0})
        .sort(sort_field, sort_dir)
        .skip(offset)
        .limit(limit)
    )
    return {"items": [d async for d in cursor], "total": total, "limit": limit, "offset": offset}


class WithdrawalBulkDecideIn(BaseModel):
    action: Literal["approve", "reject"]
    withdrawal_ids: list[str] = Field(min_length=1, max_length=200)
    note: str | None = None


@api.post("/admin/withdrawals/bulk-decide")
async def admin_bulk_decide_withdrawals(
    payload: WithdrawalBulkDecideIn, request: Request, admin: dict = Depends(require_access_0)
) -> dict:
    """Bulk approve / reject pending withdrawals. Skips any item that is no
    longer pending. Per-item failures recorded so the UI shows partials."""
    succeeded: list[str] = []
    failed: list[dict] = []
    approve = payload.action == "approve"
    new_status = "approved" if approve else "rejected"
    for wid in payload.withdrawal_ids:
        try:
            w = await db.withdrawals.find_one({"withdrawal_id": wid}, {"_id": 0})
            if not w:
                failed.append({"withdrawal_id": wid, "reason": "not_found"})
                continue
            if w["status"] != "pending":
                failed.append({"withdrawal_id": wid, "reason": f"already {w['status']}"})
                continue
            before_snapshot = {"status": w["status"], "approved_by_admin_id": w.get("approved_by_admin_id")}
            upd = {
                "status": new_status,
                "approved_by_admin_id": admin["admin_id"],
                "approval_note": payload.note or "",
                "updated_at": now_utc().isoformat(),
            }
            payout_summary: dict[str, Any] = {}
            if approve:
                payout_summary = await _execute_payout(w, admin["admin_id"], payload.note or "")
                upd["payout_status"] = payout_summary.get("status", "pending")
                upd["payout_provider"] = payout_summary.get("provider")
                upd["payout_reference"] = payout_summary.get("reference")
                upd["payout_mode"] = payout_summary.get("mode")
                upd["payout_attempted_at"] = now_utc().isoformat()
            await db.withdrawals.update_one({"withdrawal_id": wid}, {"$set": upd})
            await _audit(
                admin["admin_id"],
                f"withdrawal.{new_status}",
                "withdrawal",
                wid,
                {"note": payload.note or "", "payout": payout_summary, "via": "bulk"},
                request=request,
                before=before_snapshot,
                after={"status": new_status, "approved_by_admin_id": admin["admin_id"]},
            )
            succeeded.append(wid)
        except Exception as e:  # noqa: BLE001
            failed.append({"withdrawal_id": wid, "reason": str(e)[:120]})
    return {"succeeded": succeeded, "failed": failed}


@api.post("/admin/withdrawals/{withdrawal_id}/decide")
async def admin_decide_withdrawal(
    withdrawal_id: str, payload: WithdrawalDecisionIn, request: Request, admin: dict = Depends(require_access_0)
) -> dict:
    w = await db.withdrawals.find_one({"withdrawal_id": withdrawal_id}, {"_id": 0})
    if not w:
        raise HTTPException(status_code=404, detail="Withdrawal not found")
    if w["status"] != "pending":
        raise HTTPException(status_code=400, detail=f"Withdrawal already {w['status']}")
    new_status = "approved" if payload.approve else "rejected"
    before_snapshot = {"status": w["status"], "approved_by_admin_id": w.get("approved_by_admin_id")}
    upd = {
        "status": new_status,
        "approved_by_admin_id": admin["admin_id"],
        "approval_note": payload.note or "",
        "updated_at": now_utc().isoformat(),
    }
    payout_summary: dict[str, Any] = {}
    if payload.approve:
        payout_summary = await _execute_payout(w, admin["admin_id"], payload.note or "")
        upd["payout_status"] = payout_summary.get("status", "pending")
        upd["payout_provider"] = payout_summary.get("provider")
        upd["payout_reference"] = payout_summary.get("reference")
        upd["payout_mode"] = payout_summary.get("mode")
        upd["payout_attempted_at"] = now_utc().isoformat()
    await db.withdrawals.update_one({"withdrawal_id": withdrawal_id}, {"$set": upd})
    after_snapshot = {"status": new_status, "approved_by_admin_id": admin["admin_id"]}
    await _audit(admin["admin_id"], f"withdrawal.{new_status}", "withdrawal", withdrawal_id, {"note": payload.note or "", "payout": payout_summary}, request=request, before=before_snapshot, after=after_snapshot)
    customer_uid = w.get("customer_user_id")
    if customer_uid:
        try:
            extra = ""
            if payload.approve and payout_summary:
                if payout_summary.get("status") == "executed":
                    extra = f" Payout reference: {payout_summary.get('reference')}."
                elif payout_summary.get("status") == "queued":
                    extra = " Payout queued for next settlement window."
                elif payout_summary.get("status") == "manual":
                    extra = " Our operations team will wire funds within 1-3 business days."
            await _notify(
                customer_uid,
                "withdrawal",
                f"Withdrawal {new_status}",
                f"Your withdrawal of {float(w.get('amount', 0)):,.2f} {(w.get('currency') or 'USD').upper()} has been {new_status}." + extra + (f" Note: {payload.note}" if payload.note else ""),
                {"withdrawal_id": withdrawal_id, "status": new_status, "payout": payout_summary},
            )
        except Exception:
            pass
    return {**w, **upd}


# ---------------- Payout execution scaffold ----------------
# Wired so admin approval can attempt real payouts when production keys exist.
# When PAYOUT_LIVE_MODE != "true", we record the intent and return mode="test"
# so admin teams can audit the flow end-to-end without any real money movement.
PAYOUT_LIVE_MODE = (os.environ.get("PAYOUT_LIVE_MODE") or "").strip().lower() == "true"


async def _execute_payout(withdrawal: dict, admin_id: str, note: str) -> dict[str, Any]:
    """Attempt to execute a payout for an approved withdrawal.

    For bank destinations we would call Stripe Connect Payouts API (or Wise).
    For crypto destinations we would broadcast a wallet transfer through an
    OTC provider (e.g. Fireblocks, Binance Pay).

    Until production keys are configured this function records the intent
    and returns mode="test" so the audit trail is preserved. Once keys are
    set and PAYOUT_LIVE_MODE=true, replace the marked branches with the
    actual provider calls.
    """
    dest_type = (withdrawal.get("destination_type") or "").lower()
    amount = float(withdrawal.get("amount", 0) or 0)
    currency = (withdrawal.get("currency") or "USD").upper()
    reference = f"po_{uuid.uuid4().hex[:12]}"
    if not PAYOUT_LIVE_MODE:
        return {
            "status": "manual",
            "provider": "manual_ops",
            "reference": reference,
            "mode": "test",
            "destination_type": dest_type,
            "amount": amount,
            "currency": currency,
            "message": "PAYOUT_LIVE_MODE is false. Operations team will settle manually until production keys are configured.",
        }
    # --- LIVE MODE ---------------------------------------------------------
    if dest_type == "bank":
        # TODO: replace this with a real Stripe Connect / Wise call.
        # Example pseudo (Stripe Connect):
        #   stripe.Transfer.create(amount=int(amount*100), currency=currency.lower(), destination=connect_account_id)
        return {
            "status": "queued",
            "provider": "stripe_connect",
            "reference": reference,
            "mode": "live",
            "destination_type": dest_type,
            "amount": amount,
            "currency": currency,
            "message": "Bank payout queued via Stripe Connect (live mode).",
        }
    if dest_type == "crypto":
        # TODO: replace this with a real Fireblocks / Binance Pay broadcast.
        return {
            "status": "queued",
            "provider": "crypto_otc",
            "reference": reference,
            "mode": "live",
            "destination_type": dest_type,
            "amount": amount,
            "currency": currency,
            "message": "Crypto payout queued via OTC desk (live mode).",
        }
    return {
        "status": "manual",
        "provider": "manual_ops",
        "reference": reference,
        "mode": "live",
        "destination_type": dest_type,
        "amount": amount,
        "currency": currency,
        "message": "Unsupported destination type for automated payout. Manual settlement required.",
    }


# ===========================================================================
# Customer Dashboard Endpoints (user-facing)
# ===========================================================================

UPLOADS_DIR = ROOT_DIR / "uploads"
UPLOADS_DIR.mkdir(exist_ok=True)
KYC_ALLOWED_MIME = {
    "image/jpeg", "image/jpg", "image/png", "image/webp", "image/heic",
    "application/pdf",
}
KYC_MAX_BYTES = 8 * 1024 * 1024  # 8 MB


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


# --- Portfolio summary ---
@api.get("/portfolio/summary")
async def portfolio_summary(user: dict = Depends(current_user)) -> dict:
    holdings_cursor = db.holdings.find({"user_id": user["user_id"]}, {"_id": 0}).sort("created_at", -1)
    holdings = [d async for d in holdings_cursor]
    by_plan: dict[str, float] = {}
    by_currency: dict[str, float] = {}
    total_usd_equiv = 0.0
    for h in holdings:
        amt = float(h.get("amount", 0) or 0)
        by_plan[h["plan_slug"]] = by_plan.get(h["plan_slug"], 0.0) + amt
        cur = (h.get("currency") or "usd").lower()
        by_currency[cur] = by_currency.get(cur, 0.0) + amt
        if cur == "usd":
            total_usd_equiv += amt
    deposits = await db.payment_transactions.count_documents({"user_id": user["user_id"], "payment_status": "paid"})
    pending_wd = await db.withdrawals.count_documents({"customer_user_id": user["user_id"], "status": "pending"})
    approved_wd = await db.withdrawals.count_documents({"customer_user_id": user["user_id"], "status": "approved"})
    return {
        "holdings_count": len(holdings),
        "total_usd_equivalent": total_usd_equiv,
        "by_plan": by_plan,
        "by_currency": by_currency,
        "successful_deposits": deposits,
        "pending_withdrawals": pending_wd,
        "approved_withdrawals": approved_wd,
        "kyc_status": user.get("kyc_status", "pending"),
    }


# --- Transactions: combined deposits + withdrawals ---
@api.get("/transactions")
async def list_transactions(
    user: dict = Depends(current_user),
    kind: str | None = None,
    limit: int = 200,
) -> dict:
    limit = max(1, min(int(limit or 200), 500))
    items: list[dict] = []
    if kind in (None, "", "deposit", "all"):
        async for d in db.payment_transactions.find({"user_id": user["user_id"]}, {"_id": 0}).sort("created_at", -1).limit(limit):
            items.append({
                "id": d.get("session_id"),
                "type": "deposit",
                "amount": float(d.get("amount", 0) or 0),
                "currency": (d.get("currency") or "usd").upper(),
                "status": d.get("payment_status", d.get("status", "initiated")),
                "plan_slug": d.get("plan_slug"),
                "created_at": d.get("created_at"),
                "ref": d.get("session_id"),
            })
    if kind in (None, "", "withdrawal", "all"):
        async for d in db.withdrawals.find({"customer_user_id": user["user_id"]}, {"_id": 0}).sort("created_at", -1).limit(limit):
            items.append({
                "id": d.get("withdrawal_id"),
                "type": "withdrawal",
                "amount": float(d.get("amount", 0) or 0),
                "currency": (d.get("currency") or "usd").upper(),
                "status": d.get("status", "pending"),
                "destination_type": d.get("destination_type"),
                "created_at": d.get("created_at"),
                "ref": d.get("withdrawal_id"),
                "note": d.get("note") or d.get("reason") or "",
            })
    items.sort(key=lambda x: x.get("created_at") or "", reverse=True)
    return {"items": items[:limit], "count": len(items)}


# --- Customer-initiated withdrawal request ---
@api.post("/withdrawals", status_code=201)
async def create_withdrawal(payload: CustomerWithdrawalIn, user: dict = Depends(current_user)) -> dict:
    # Verify user has enough invested
    inv_pipeline = [
        {"$match": {"user_id": user["user_id"]}},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}}},
    ]
    total_invested = 0.0
    async for d in db.holdings.aggregate(inv_pipeline):
        total_invested = float(d.get("total", 0) or 0)
    if total_invested <= 0:
        raise HTTPException(status_code=400, detail="No holdings available to withdraw against.")
    # Check pending withdrawals
    pending_total = 0.0
    async for d in db.withdrawals.find(
        {"customer_user_id": user["user_id"], "status": {"$in": ["pending", "approved"]}}, {"_id": 0}
    ):
        pending_total += float(d.get("amount", 0) or 0)
    available = total_invested - pending_total
    if payload.amount > available + 0.001:
        raise HTTPException(
            status_code=400,
            detail=f"Requested amount exceeds available balance. Available: {available:.2f} (invested {total_invested:.2f} - pending {pending_total:.2f}).",
        )
    # Validate destination details
    dest_summary = ""
    if payload.destination_type == "bank":
        if not (payload.bank_account_name and payload.bank_name and payload.bank_account_number):
            raise HTTPException(status_code=400, detail="Bank account name, bank name and account number are required for bank withdrawals.")
        dest_summary = f"{payload.bank_name} :: {payload.bank_account_name} :: {payload.bank_account_number[-4:].rjust(len(payload.bank_account_number), '*') if len(payload.bank_account_number) > 4 else '****'}"
    else:
        if not (payload.crypto_asset and payload.crypto_wallet_address):
            raise HTTPException(status_code=400, detail="Crypto asset and wallet address are required for crypto withdrawals.")
        addr = payload.crypto_wallet_address
        dest_summary = f"{payload.crypto_asset} ({payload.crypto_network or 'native'}) :: {addr[:6]}...{addr[-4:]}" if len(addr) > 12 else f"{payload.crypto_asset} :: {addr}"
    wid = gen_id("wd")
    doc = {
        "withdrawal_id": wid,
        "customer_user_id": user["user_id"],
        "amount": float(payload.amount),
        "currency": payload.currency.upper(),
        "destination_type": payload.destination_type,
        "destination_summary": dest_summary,
        # Bank
        "bank_account_name": enc(payload.bank_account_name) if payload.bank_account_name else None,
        "bank_name": payload.bank_name,
        "bank_account_number": enc(payload.bank_account_number) if payload.bank_account_number else None,
        "bank_swift_iban": payload.bank_swift_iban,
        "bank_country": payload.bank_country,
        # Crypto
        "crypto_asset": payload.crypto_asset,
        "crypto_network": payload.crypto_network,
        "crypto_wallet_address": payload.crypto_wallet_address,
        # Meta
        "note": payload.note or "",
        "reason": payload.note or "Customer initiated withdrawal",
        "bank_beneficiary": dest_summary,
        "status": "pending",
        "requested_by_admin_id": None,
        "requested_by_user_id": user["user_id"],
        "approved_by_admin_id": None,
        "created_at": now_utc().isoformat(),
        "updated_at": now_utc().isoformat(),
    }
    await db.withdrawals.insert_one(doc)
    await _notify(
        user["user_id"],
        "withdrawal",
        "Withdrawal request submitted",
        f"Your withdrawal of {payload.amount:.2f} {payload.currency.upper()} is pending review.",
        {"withdrawal_id": wid},
    )
    return {k: v for k, v in doc.items() if k not in {"_id", "bank_account_name", "bank_account_number"}}


@api.get("/withdrawals")
async def list_user_withdrawals(user: dict = Depends(current_user)) -> dict:
    cursor = db.withdrawals.find(
        {"customer_user_id": user["user_id"]},
        {
            "_id": 0,
            "bank_account_name": 0,
            "bank_account_number": 0,
        },
    ).sort("created_at", -1).limit(200)
    return {"items": [d async for d in cursor]}


# --- KYC upload ---
@api.post("/kyc/upload", status_code=201)
async def kyc_upload(
    document_type: str = Form(...),
    file: UploadFile = File(...),
    user: dict = Depends(current_user),
) -> dict:
    doc_type = (document_type or "").strip().lower()
    if doc_type not in {"id_front", "id_back", "passport", "address_proof", "selfie"}:
        raise HTTPException(status_code=400, detail="Invalid document_type. Use id_front, id_back, passport, address_proof, or selfie.")
    if file.content_type not in KYC_ALLOWED_MIME:
        raise HTTPException(status_code=400, detail=f"File type not allowed ({file.content_type}). Allow: JPG, PNG, WebP, HEIC, PDF.")
    content = await file.read()
    if len(content) == 0:
        raise HTTPException(status_code=400, detail="Empty file.")
    if len(content) > KYC_MAX_BYTES:
        raise HTTPException(status_code=400, detail="File too large (max 8MB).")
    user_dir = UPLOADS_DIR / "kyc" / user["user_id"]
    user_dir.mkdir(parents=True, exist_ok=True)
    ext = (file.filename or "file").split(".")[-1].lower()[:8] if "." in (file.filename or "") else "bin"
    safe_name = f"{doc_type}_{uuid.uuid4().hex[:10]}.{ext}"
    path = user_dir / safe_name
    with open(path, "wb") as fh:
        fh.write(content)
    doc_id = gen_id("kyc")
    rec = {
        "kyc_doc_id": doc_id,
        "user_id": user["user_id"],
        "document_type": doc_type,
        "file_name": file.filename,
        "stored_name": safe_name,
        "content_type": file.content_type,
        "size_bytes": len(content),
        "status": "pending",
        "uploaded_at": now_utc().isoformat(),
    }
    await db.kyc_documents.insert_one(rec)
    # Bump user kyc_status to 'submitted' if currently pending
    cur_status = (user.get("kyc_status") or "pending").lower()
    if cur_status in {"pending", "rejected"}:
        await db.users.update_one(
            {"user_id": user["user_id"]},
            {"$set": {"kyc_status": "submitted", "updated_at": now_utc().isoformat()}},
        )
    await _notify(
        user["user_id"],
        "kyc",
        "KYC document received",
        f"Your {doc_type.replace('_', ' ')} has been uploaded and is awaiting review.",
        {"kyc_doc_id": doc_id},
    )
    return {k: v for k, v in rec.items() if k != "_id"}


@api.get("/kyc/status")
async def kyc_status(user: dict = Depends(current_user)) -> dict:
    cursor = db.kyc_documents.find(
        {"user_id": user["user_id"]}, {"_id": 0, "stored_name": 0}
    ).sort("uploaded_at", -1)
    docs = [d async for d in cursor]
    return {
        "kyc_status": user.get("kyc_status", "pending"),
        "documents": docs,
    }


# --- Notifications ---
@api.get("/notifications")
async def list_notifications(user: dict = Depends(current_user), unread_only: bool = False) -> dict:
    q: dict[str, Any] = {"user_id": user["user_id"]}
    if unread_only:
        q["read"] = False
    cursor = db.notifications.find(q, {"_id": 0}).sort("created_at", -1).limit(200)
    items = [d async for d in cursor]
    unread = await db.notifications.count_documents({"user_id": user["user_id"], "read": False})
    return {"items": items, "unread_count": unread}


@api.post("/notifications/{notification_id}/read")
async def mark_notification_read(notification_id: str, user: dict = Depends(current_user)) -> dict:
    res = await db.notifications.update_one(
        {"notification_id": notification_id, "user_id": user["user_id"]},
        {"$set": {"read": True, "read_at": now_utc().isoformat()}},
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Notification not found")
    return {"ok": True}


@api.post("/notifications/read_all")
async def mark_all_notifications_read(user: dict = Depends(current_user)) -> dict:
    res = await db.notifications.update_many(
        {"user_id": user["user_id"], "read": False},
        {"$set": {"read": True, "read_at": now_utc().isoformat()}},
    )
    return {"ok": True, "updated": int(res.modified_count)}


# --- Profile ---
@api.get("/profile")
async def get_profile(user: dict = Depends(current_user)) -> dict:
    return {
        **_public_user(user),
        "phone": user.get("phone") or "",
        "country": user.get("country") or "",
        "address": user.get("address") or "",
        "kyc_status": user.get("kyc_status", "pending"),
    }


@api.patch("/profile")
async def update_profile(payload: ProfileUpdateIn, user: dict = Depends(current_user)) -> dict:
    upd: dict[str, Any] = {"updated_at": now_utc().isoformat()}
    if payload.full_name is not None:
        upd["full_name"] = payload.full_name.strip()
    if payload.phone is not None:
        upd["phone"] = payload.phone.strip()
    if payload.country is not None:
        upd["country"] = payload.country.strip()
    if payload.address is not None:
        upd["address"] = payload.address.strip()
    await db.users.update_one({"user_id": user["user_id"]}, {"$set": upd})
    new_user = await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0})
    return {
        **_public_user(new_user or user),
        "phone": (new_user or {}).get("phone") or "",
        "country": (new_user or {}).get("country") or "",
        "address": (new_user or {}).get("address") or "",
        "kyc_status": (new_user or {}).get("kyc_status", "pending"),
    }


app.include_router(api)


# WebSocket proxy for Binance crypto stream. Browsers in some regions cannot reach
# stream.binance.com directly. This endpoint connects upstream from the server side
# and relays messages to the client. Endpoint: /api/ws/crypto
BINANCE_STREAM_URL = (
    "wss://stream.binance.com:9443/stream?streams="
    "btcusdt@ticker/ethusdt@ticker/solusdt@ticker/bnbusdt@ticker/adausdt@ticker/xrpusdt@ticker"
)


@app.websocket("/api/ws/crypto")
async def ws_crypto_proxy(ws: WebSocket) -> None:
    await ws.accept()
    upstream = None
    try:
        upstream = await websockets.connect(BINANCE_STREAM_URL, ping_interval=20, ping_timeout=20)
    except Exception as e:
        logger.warning("Upstream Binance connect failed: %s", e)
        try:
            await ws.send_json({"error": "upstream_unavailable"})
        except Exception:
            pass
        await ws.close()
        return

    async def relay_upstream_to_client() -> None:
        try:
            async for msg in upstream:
                if isinstance(msg, bytes):
                    msg = msg.decode("utf-8", errors="ignore")
                await ws.send_text(msg)
        except Exception as e:
            logger.info("upstream->client closed: %s", e)

    async def drain_client() -> None:
        try:
            while True:
                # we do not expect client messages, but we must drain to detect disconnect
                await ws.receive_text()
        except WebSocketDisconnect:
            pass
        except Exception as e:
            logger.info("client->upstream closed: %s", e)

    try:
        await asyncio.wait(
            [asyncio.create_task(relay_upstream_to_client()), asyncio.create_task(drain_client())],
            return_when=asyncio.FIRST_COMPLETED,
        )
    finally:
        try:
            await upstream.close()
        except Exception:
            pass
        try:
            await ws.close()
        except Exception:
            pass


_default_cors_regex = r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$|^https://[a-z0-9-]+\.(preview\.)?emergentagent\.com$"
_cors_origins_env = os.environ.get("CORS_ORIGINS", "").strip()
if _cors_origins_env and _cors_origins_env != "*":
    _allow_origins = [o.strip() for o in _cors_origins_env.split(",") if o.strip()]
    _allow_regex = None
else:
    _allow_origins = []
    _allow_regex = os.environ.get("CORS_ORIGIN_REGEX", _default_cors_regex)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=_allow_origins,
    allow_origin_regex=_allow_regex,
    allow_methods=["*"],
    allow_headers=["*"],
)
