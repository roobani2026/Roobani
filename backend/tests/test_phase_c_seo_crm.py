"""Phase C (iteration_9): SEO + CRM admin auth-surface fix.

Key change vs iteration_8: /api/admin/crm/status and /api/admin/crm/resync now
use the canonical admin auth surface (admin_session_token cookie +
admin_users.access_level=0 + MFA) via `Depends(require_access_0)` instead of the
customer-side `require_admin`.
"""
from __future__ import annotations

import os
import re
import subprocess
import time
import uuid
import xml.etree.ElementTree as ET

import pyotp
import pytest
import requests

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"

SUPER_EMAIL = "admin@roobani.com"
SUPER_PASS = "Admin@Roobani2026!"
CUST_ADMIN_EMAIL = "admin@roobani.dev"
CUST_ADMIN_PASS = "RoobaniAdmin#2026"

S: dict = {}


def _mongo_reset_super_mfa():
    cmd = (
        'db = db.getSiblingDB("test_database");'
        'db.admin_users.updateOne({email_lookup:"admin@roobani.com"},'
        '{$set:{mfa_enabled:false,totp_secret_enc:null,recovery_codes_hashed:[],'
        'failed_attempts:0,locked_until:null}});'
        'db.admin_users.deleteMany({email_lookup:{$regex:"^test_phasec_mgr_"}});'
        'db.mfa_challenges.deleteMany({});'
        'db.admin_sessions.deleteMany({});'
    )
    subprocess.run(["mongosh", "--quiet", "--eval", cmd],
                   check=False, capture_output=True, timeout=15)


def _login_admin_with_mfa(email: str, password: str) -> requests.Session:
    s = requests.Session()
    r = s.post(f"{API}/admin/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, f"login {email}: {r.status_code} {r.text}"
    body = r.json()
    if body.get("mfa_setup_required"):
        secret = body["secret"]
        ch = body["challenge_token"]
        code = pyotp.TOTP(secret).now()
        r2 = s.post(f"{API}/admin/auth/mfa/setup",
                    json={"challenge_token": ch, "code": code})
        assert r2.status_code == 200, r2.text
        S.setdefault("mfa_secrets", {})[email] = secret
    elif body.get("mfa_required"):
        secret = S.get("mfa_secrets", {}).get(email)
        assert secret, f"need TOTP secret for {email}"
        ch = body["challenge_token"]
        time.sleep(1)
        code = pyotp.TOTP(secret).now()
        r2 = s.post(f"{API}/admin/auth/mfa/verify",
                    json={"challenge_token": ch, "code": code})
        assert r2.status_code == 200, r2.text
    assert s.cookies.get("admin_session_token"), "no admin_session_token cookie"
    return s


@pytest.fixture(scope="module", autouse=True)
def _module_setup():
    _mongo_reset_super_mfa()
    S["super"] = _login_admin_with_mfa(SUPER_EMAIL, SUPER_PASS)
    me = S["super"].get(f"{API}/admin/auth/me").json()
    S["super_admin_id"] = me["admin_id"]
    assert S["super_admin_id"].startswith("adm_"), \
        f"unexpected super admin_id shape: {S['super_admin_id']}"

    cust = requests.Session()
    rr = cust.post(f"{API}/auth/login",
                   json={"email": CUST_ADMIN_EMAIL, "password": CUST_ADMIN_PASS})
    if rr.status_code == 200:
        S["customer_admin"] = cust
    else:
        S["customer_admin"] = None
        S["customer_admin_login_err"] = f"{rr.status_code} {rr.text[:200]}"

    mgr_email = f"test_phasec_mgr_{uuid.uuid4().hex[:6]}@example.com"
    cr = S["super"].post(f"{API}/admin/admins", json={
        "full_name": "PhaseC Mgr",
        "email": mgr_email,
        "password": "Abcd1234!aaa",
        "access_level": 1,
    })
    assert cr.status_code == 201, cr.text
    S["mgr_email"] = mgr_email
    S["mgr_admin_id"] = cr.json()["admin_id"]
    S["mgr_session"] = _login_admin_with_mfa(mgr_email, "Abcd1234!aaa")
    yield
    _mongo_reset_super_mfa()
    try:
        subprocess.run(
            ["mongosh", "--quiet", "--eval",
             'db = db.getSiblingDB("test_database");'
             'db.contact_submissions.deleteMany({name:{$regex:"^TEST_"}});'
             'db.users.deleteMany({email_lookup:{$regex:"^test_phasec_"}});'],
            check=False, capture_output=True, timeout=10,
        )
    except Exception:
        pass


@pytest.fixture
def anon():
    return requests.Session()


# 1. Sitemap regression
class TestSitemap:
    def test_01_sitemap_xml(self):
        r = requests.get(f"{BASE_URL}/sitemap.xml")
        assert r.status_code == 200
        assert "xml" in r.headers.get("content-type", "").lower()
        root = ET.fromstring(r.text)
        ns = {"sm": "http://www.sitemaps.org/schemas/sitemap/0.9",
              "image": "http://www.google.com/schemas/sitemap-image/1.1"}
        urls = root.findall("sm:url", ns)
        assert len(urls) >= 6
        for u in urls:
            assert u.find("sm:lastmod", ns) is not None
        paths = {re.sub(r"^https?://[^/]+", "",
                        u.find("sm:loc", ns).text).rstrip("/") or "/"
                 for u in urls}
        for needed in {"/", "/plans", "/contact", "/privacy", "/terms", "/cookies"}:
            assert needed in paths
        assert "/about" not in paths
        plans = next(u for u in urls if (u.find("sm:loc", ns).text or "").endswith("/plans"))
        assert plans.find("image:image", ns) is not None
        S["sitemap_paths"] = paths

    def test_02_sitemap_json_matches(self):
        r = requests.get(f"{API}/sitemap.json")
        assert r.status_code == 200
        body = r.json()
        json_paths = {x["loc"] for x in body["routes"]}
        assert "/about" not in json_paths
        for needed in {"/", "/plans", "/contact", "/privacy", "/terms", "/cookies"}:
            assert needed in json_paths
        if "sitemap_paths" in S:
            assert json_paths == S["sitemap_paths"]


# 2. WebP perf assets
class TestWebp:
    @pytest.mark.parametrize("asset", [
        "/brand/hero_visual.webp",
        "/brand/plan_foundation.webp",
        "/brand/about_visual.webp",
        "/brand/step_account.webp",
        "/brand/avatar_1.webp",
    ])
    def test_10_webp_served(self, asset):
        r = requests.get(f"{BASE_URL}{asset}")
        assert r.status_code == 200
        assert "image/webp" in r.headers.get("content-type", "").lower()
        assert len(r.content) > 100


# 3. /api/admin/crm/status auth surface
class TestCrmStatusAuth:
    def test_20_no_cookie_returns_401(self, anon):
        r = anon.get(f"{API}/admin/crm/status")
        assert r.status_code == 401, f"got {r.status_code}: {r.text}"

    def test_21_customer_session_token_rejected_401(self):
        if not S.get("customer_admin"):
            pytest.skip(f"customer admin login failed: {S.get('customer_admin_login_err')}")
        r = S["customer_admin"].get(f"{API}/admin/crm/status")
        assert r.status_code == 401, (
            f"customer cookie must NOT reach CRM endpoint, got {r.status_code} {r.text}"
        )

    def test_22_super_admin_session_returns_shape(self):
        r = S["super"].get(f"{API}/admin/crm/status")
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["provider"] == "hubspot"
        assert body["configured"] is False, body
        for k in ("pending", "synced"):
            assert isinstance(body[k], dict)
            for sub in ("contacts", "leads"):
                assert sub in body[k]
                assert isinstance(body[k][sub], int)

    def test_23_manager_admin_session_returns_403(self):
        r = S["mgr_session"].get(f"{API}/admin/crm/status")
        assert r.status_code == 403, (
            f"manager must be 403 (require_access_0), got {r.status_code} {r.text}"
        )


# 4. /api/admin/crm/resync auth surface + no-key body + audit
class TestCrmResyncAuth:
    def test_30_no_cookie_returns_401(self, anon):
        r = anon.post(f"{API}/admin/crm/resync")
        assert r.status_code == 401

    def test_31_customer_session_token_rejected_401(self):
        if not S.get("customer_admin"):
            pytest.skip("customer admin not available")
        r = S["customer_admin"].post(f"{API}/admin/crm/resync")
        assert r.status_code == 401, (
            f"customer cookie must NOT reach CRM endpoint, got {r.status_code} {r.text}"
        )

    def test_32_manager_admin_session_returns_403(self):
        r = S["mgr_session"].post(f"{API}/admin/crm/resync")
        assert r.status_code == 403

    def test_33_super_admin_no_key_noop_body(self):
        uniq = uuid.uuid4().hex[:8]
        c = requests.post(f"{API}/contact", json={
            "name": f"TEST_PhaseC {uniq}",
            "email": f"test_phasec_{uniq}@example.com",
            "subject": "Hello",
            "message": "Phase C iter9 resync no-op test.",
        })
        assert c.status_code == 201, c.text

        r = S["super"].post(f"{API}/admin/crm/resync")
        assert r.status_code == 200, r.text
        body = r.json()
        assert body == {
            "ok": False,
            "reason": "HUBSPOT_API_KEY not configured",
            "synced": 0,
            "queued": 0,
        }, f"unexpected body: {body}"

    def test_34_audit_row_has_real_admin_id_and_meta(self):
        """Headline assertion: audit row keyed to admin_users adm_* id (not
        customer user_* id), with ip + user_agent populated, and meta carrying
        contacts_synced / leads_synced / failed_count / limit.

        NOTE: when HUBSPOT_API_KEY is absent, admin_crm_resync returns the
        no-op body BEFORE calling _audit() (early-return at line ~1642). So
        for this iteration we trigger one work path that DOES audit: when the
        key IS set, _audit fires. Since the key is absent here, we instead
        document the early-return and skip the audit assertion. If a future
        iteration sets the key, this test will exercise the assertion."""
        api_key_present = bool(os.environ.get("HUBSPOT_API_KEY", "").strip())
        if not api_key_present:
            # Manually drive a code path that produces an audit row keyed to
            # the super-admin to prove the admin_id is `adm_*`. We use the
            # closest available alternative: an admin.login row from the
            # current super session.
            r = S["super"].get(f"{API}/admin/audit",
                               params={"action": "admin.login", "limit": 5})
            assert r.status_code == 200, r.text
            items = r.json().get("items", [])
            assert items, "no admin.login audit rows"
            row = items[0]
            assert row.get("admin_id", "").startswith("adm_"), (
                f"audit admin_id must be adm_*, got {row.get('admin_id')!r}"
            )
            assert row.get("ip"), f"missing ip: {row}"
            assert row.get("user_agent"), f"missing user_agent: {row}"
            pytest.skip(
                "HUBSPOT_API_KEY absent -> admin_crm_resync early-returns "
                "before calling _audit; verified adm_* shape via admin.login."
            )

        # Real audit assertion path (only runs when key is set)
        r = S["super"].get(f"{API}/admin/audit",
                           params={"action": "crm.resync", "limit": 5})
        assert r.status_code == 200, r.text
        items = r.json().get("items", [])
        assert items, "no crm.resync audit rows"
        row = items[0]
        admin_id = row.get("admin_id", "")
        assert admin_id.startswith("adm_"), \
            f"audit admin_id must be adm_*, got {admin_id!r}"
        assert admin_id == S["super_admin_id"]
        assert row.get("ip"), f"missing ip: {row}"
        assert row.get("user_agent"), f"missing user_agent: {row}"
        meta = row.get("meta") or {}
        for k in ("contacts_synced", "leads_synced", "failed_count", "limit"):
            assert k in meta, f"meta missing {k}: {meta}"


# 5. Regression: /admin/dashboard + /contact unchanged
class TestRegressionUnchanged:
    def test_40_admin_dashboard_super(self):
        r = S["super"].get(f"{API}/admin/dashboard")
        assert r.status_code == 200, r.text

    def test_41_admin_dashboard_no_cookie_401(self, anon):
        r = anon.get(f"{API}/admin/dashboard")
        assert r.status_code == 401

    def test_42_post_contact_no_auth_creates_unsynced(self):
        before = S["super"].get(f"{API}/admin/crm/status").json()
        uniq = uuid.uuid4().hex[:8]
        r = requests.post(f"{API}/contact", json={
            "name": f"TEST_RegC {uniq}",
            "email": f"test_phasec_regc_{uniq}@example.com",
            "subject": "Reg subject",
            "message": "Phase C iter9 regression body.",
        })
        assert r.status_code == 201, r.text
        after = S["super"].get(f"{API}/admin/crm/status").json()
        assert after["pending"]["contacts"] >= before["pending"]["contacts"] + 1, (
            f"pending.contacts should grow: before={before['pending']} "
            f"after={after['pending']}"
        )
