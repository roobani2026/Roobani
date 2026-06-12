"""
Roobani observability stack — Phase D infrastructure.

Three integrations live here, each following the same "drop-in-the-key-later"
pattern as our HubSpot CRM integration:

  1. Sentry crash tracking         (env: SENTRY_DSN)
  2. Mixpanel analytics            (env: MIXPANEL_TOKEN)
  3. Telegram ops alerts           (env: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID)

When the env var is missing the public helpers (`track`, `alert`,
`capture_warning`) deliberately no-op so the rest of the codebase can call
them freely without guards. There is intentionally NO "not configured" log
spam — we log ONCE at startup whether each integration is on or off, and
that's it.

Design notes
------------
* All outbound HTTP is fire-and-forget via `asyncio.create_task(...)` so a
  slow Mixpanel/Telegram POST never blocks an API response. Sentry's own
  SDK already does this internally.
* The Mixpanel Python SDK is synchronous, so we wrap each `.track()` call
  in `asyncio.to_thread` to keep the event loop unblocked.
* PII redaction in Sentry uses the same `_redact` helper that server.py
  uses for the audit log — single source of truth.
* `app_environment` + `app_version` are attached as tags / super-properties
  on every event so we can filter by env and release in the dashboards.
"""

from __future__ import annotations

import asyncio
import logging
import os
import re
from typing import Any, Callable

import httpx

logger = logging.getLogger("roobani.observability")

_APP_ENV = os.environ.get("APP_ENV", "development")
_APP_VERSION = os.environ.get("APP_VERSION", "0.0.0")


# ──────────────────────────────────────────────────────────────────────────
# 1. Sentry
# ──────────────────────────────────────────────────────────────────────────
_SENTRY_ENABLED = False


def init_sentry(redact_fn: Callable[[dict], dict] | None = None) -> None:
    """Initialise Sentry if `SENTRY_DSN` is set. No-op otherwise.

    `redact_fn` is the existing audit-log redactor from server.py — we apply
    it to every Sentry event's `extra` / `contexts` / `request.data` so PII
    that may sneak into stack traces or request bodies is scrubbed before
    it leaves the box.
    """
    global _SENTRY_ENABLED

    dsn = os.environ.get("SENTRY_DSN", "").strip()
    if not dsn:
        logger.info("Sentry disabled (SENTRY_DSN not set).")
        return

    import sentry_sdk
    from sentry_sdk.integrations.fastapi import FastApiIntegration
    from sentry_sdk.integrations.logging import LoggingIntegration

    def _before_send(event: dict, _hint: dict | None = None) -> dict | None:
        try:
            # Strip user identity entirely; we never need it for crash debug.
            if event.get("user"):
                event["user"] = {}

            # Redact request body / query string / sensitive headers.
            req = event.get("request")
            if isinstance(req, dict):
                if req.get("data") is not None:
                    req["data"] = redact_fn(req["data"]) if (callable(redact_fn) and isinstance(req["data"], dict)) else "[redacted]"
                if req.get("cookies"):
                    req["cookies"] = "[redacted]"
                headers = req.get("headers")
                if isinstance(headers, dict):
                    req["headers"] = {
                        k: ("[redacted]" if k.lower() in {"authorization", "cookie", "set-cookie", "x-api-key"} else v)
                        for k, v in headers.items()
                    }

            # Redact extra/contexts via the audit redactor.
            if callable(redact_fn):
                for slot in ("extra", "contexts", "tags"):
                    container = event.get(slot)
                    if isinstance(container, dict):
                        event[slot] = redact_fn(container)
        except Exception:  # noqa: BLE001 — never let redaction break Sentry
            logger.exception("Sentry before_send redactor failed; sending raw event.")
        return event

    # Captures log records as breadcrumbs but does NOT auto-promote WARN/ERROR
    # logs into Sentry events (we prefer explicit capture_warning / unhandled).
    logging_int = LoggingIntegration(level=logging.INFO, event_level=None)

    sentry_sdk.init(
        dsn=dsn,
        environment=_APP_ENV,
        release=_APP_VERSION,
        integrations=[FastApiIntegration(), logging_int],
        send_default_pii=False,
        traces_sample_rate=0.3 if _APP_ENV == "production" else 1.0,
        profiles_sample_rate=0.1 if _APP_ENV == "production" else 0.0,
        before_send=_before_send,
    )
    _SENTRY_ENABLED = True
    logger.info("Sentry enabled (env=%s, release=%s).", _APP_ENV, _APP_VERSION)


def capture_warning(exc: BaseException, **context: Any) -> None:
    """Manually report a *handled* exception as a Sentry warning.

    Used for places that already log + swallow (HubSpot push, Mixpanel send,
    Telegram alert) so the failures are visible in Sentry without being
    conflated with unhandled 500s.
    """
    if not _SENTRY_ENABLED:
        return
    try:
        import sentry_sdk

        with sentry_sdk.push_scope() as scope:
            scope.level = "warning"
            scope.set_tag("handled", "true")
            for key, value in context.items():
                scope.set_extra(key, value)
            sentry_sdk.capture_exception(exc)
    except Exception:  # noqa: BLE001 — never let observability break the app
        logger.exception("capture_warning failed; swallowing.")


# ──────────────────────────────────────────────────────────────────────────
# 2. Mixpanel
# ──────────────────────────────────────────────────────────────────────────
_MIXPANEL_CLIENT: Any = None
_EMAIL_RE = re.compile(r"^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$")


def init_mixpanel() -> None:
    """Initialise the Mixpanel Python SDK if `MIXPANEL_TOKEN` is set."""
    global _MIXPANEL_CLIENT

    token = os.environ.get("MIXPANEL_TOKEN", "").strip()
    if not token:
        logger.info("Mixpanel disabled (MIXPANEL_TOKEN not set).")
        return

    from mixpanel import Mixpanel

    _MIXPANEL_CLIENT = Mixpanel(token)
    logger.info("Mixpanel enabled.")


def _safe_distinct_id(distinct_id: str | None) -> str:
    """Distinct IDs that look like raw emails would let Mixpanel correlate
    users by email — useful for analytics but a privacy risk for us. Hash
    them to an opaque token instead. Stable user IDs like `user_xxx` /
    `adm_xxx` pass through unchanged."""
    if not distinct_id:
        return "anonymous"
    if _EMAIL_RE.match(distinct_id):
        import hashlib

        return "u_" + hashlib.sha256(distinct_id.lower().encode()).hexdigest()[:24]
    return distinct_id


def track(distinct_id: str | None, event_name: str, properties: dict[str, Any] | None = None) -> None:
    """Fire-and-forget event tracking. No-op when Mixpanel is disabled.

    Common backend events to call this with:
      `lead.submitted`, `contact.submitted`, `signup.completed`,
      `mfa.enrolled`, `deposit.initiated`, `deposit.settled`,
      `withdrawal.requested`, `plan.selected`.
    """
    if _MIXPANEL_CLIENT is None:
        return

    props: dict[str, Any] = {
        "app_environment": _APP_ENV,
        "app_version": _APP_VERSION,
        "$source": "server",
    }
    if properties:
        props.update(properties)

    safe_id = _safe_distinct_id(distinct_id)

    try:
        loop = asyncio.get_running_loop()
        loop.create_task(asyncio.to_thread(_MIXPANEL_CLIENT.track, safe_id, event_name, props))
    except RuntimeError:
        # Called outside a running loop (e.g. startup tasks). Fall back to
        # a synchronous best-effort call — at startup this is fine.
        try:
            _MIXPANEL_CLIENT.track(safe_id, event_name, props)
        except Exception as exc:  # noqa: BLE001
            capture_warning(exc, integration="mixpanel", event=event_name)


def people_set(distinct_id: str, properties: dict[str, Any]) -> None:
    """Update a user's Mixpanel profile (name, email-hash, plan, etc.).
    Same fire-and-forget pattern as `track`."""
    if _MIXPANEL_CLIENT is None:
        return

    safe_id = _safe_distinct_id(distinct_id)
    try:
        loop = asyncio.get_running_loop()
        loop.create_task(asyncio.to_thread(_MIXPANEL_CLIENT.people_set, safe_id, properties))
    except RuntimeError:
        try:
            _MIXPANEL_CLIENT.people_set(safe_id, properties)
        except Exception as exc:  # noqa: BLE001
            capture_warning(exc, integration="mixpanel.people_set")


# ──────────────────────────────────────────────────────────────────────────
# 3. Telegram ops alerts
# ──────────────────────────────────────────────────────────────────────────
_TG_CONFIGURED = False


def init_telegram() -> None:
    """Verify both `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` are present.
    No SDK to init — we use plain HTTP."""
    global _TG_CONFIGURED

    token = os.environ.get("TELEGRAM_BOT_TOKEN", "").strip()
    chat_id = os.environ.get("TELEGRAM_CHAT_ID", "").strip()
    if not (token and chat_id):
        logger.info(
            "Telegram alerts disabled (TELEGRAM_BOT_TOKEN=%s, TELEGRAM_CHAT_ID=%s).",
            "set" if token else "unset",
            "set" if chat_id else "unset",
        )
        return
    _TG_CONFIGURED = True
    logger.info("Telegram alerts enabled.")


async def _telegram_post(text: str) -> None:
    token = os.environ.get("TELEGRAM_BOT_TOKEN", "").strip()
    chat_id = os.environ.get("TELEGRAM_CHAT_ID", "").strip()
    if not (token and chat_id):
        return
    url = f"https://api.telegram.org/bot{token}/sendMessage"
    payload = {"chat_id": chat_id, "text": text, "parse_mode": "HTML", "disable_web_page_preview": True}
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            r = await client.post(url, json=payload)
            if r.status_code >= 400:
                logger.warning("Telegram sendMessage returned %s: %s", r.status_code, r.text[:200])
    except Exception as exc:  # noqa: BLE001
        capture_warning(exc, integration="telegram")


def alert(title: str, body: str = "", **fields: Any) -> None:
    """Post an ops alert to the configured Telegram chat.

    Used for high-signal events worth interrupting an operator for:
    new lead, large deposit, MFA lockout, integration failure, etc.
    Renders as a small HTML message with monospaced field lines.
    """
    if not _TG_CONFIGURED:
        return

    lines = [f"<b>{title}</b>"]
    if body:
        lines.append(body)
    if fields:
        lines.append("")
        for k, v in fields.items():
            lines.append(f"<code>{k}</code>: {v}")
    lines.append("")
    lines.append(f"<i>env={_APP_ENV} · v{_APP_VERSION}</i>")
    msg = "\n".join(lines)[:3900]  # Telegram hard caps at 4096 chars.

    try:
        loop = asyncio.get_running_loop()
        loop.create_task(_telegram_post(msg))
    except RuntimeError:
        # Outside a running loop — skip rather than block startup.
        pass


# ──────────────────────────────────────────────────────────────────────────
# Aggregate status (used by the admin status endpoint)
# ──────────────────────────────────────────────────────────────────────────
def status() -> dict[str, Any]:
    return {
        "environment": _APP_ENV,
        "version": _APP_VERSION,
        "sentry": {"configured": _SENTRY_ENABLED},
        "mixpanel": {"configured": _MIXPANEL_CLIENT is not None},
        "telegram": {"configured": _TG_CONFIGURED},
        "hubspot": {"configured": bool(os.environ.get("HUBSPOT_API_KEY", "").strip())},
        "resend": {"configured": bool(os.environ.get("RESEND_API_KEY", "").strip())},
    }
