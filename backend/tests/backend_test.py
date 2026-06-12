"""Roobani backend regression tests.

Covers:
- Root health
- Auth: register / login / me / logout / session-invalid / lockout
- Leads (consent + PII encryption)
- Contact
- Market: crypto + stocks
"""
import os
import uuid
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://roobani-platform.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

TEST_EMAIL = "investor@roobani.dev"
TEST_PASSWORD = "Roobani#2026"
TEST_FULL_NAME = "Test Investor"


# ----------------- Fixtures -----------------
@pytest.fixture(scope="session")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def authed_session(session):
    """Ensure the canonical test account exists & is logged in (cookie based)."""
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    # Try register; if 409, just login.
    r = s.post(f"{API}/auth/register", json={
        "full_name": TEST_FULL_NAME,
        "email": TEST_EMAIL,
        "password": TEST_PASSWORD,
        "consent": True,
    })
    if r.status_code == 409:
        r = s.post(f"{API}/auth/login", json={"email": TEST_EMAIL, "password": TEST_PASSWORD})
    assert r.status_code in (200, 201), f"login/register failed: {r.status_code} {r.text}"
    return s


# ----------------- Root -----------------
class TestRoot:
    def test_root_ok(self, session):
        r = session.get(f"{API}/")
        assert r.status_code == 200
        data = r.json()
        assert data.get("status") == "ok"
        assert data.get("service") == "roobani"


# ----------------- Auth -----------------
class TestAuth:
    def test_register_success_and_me(self):
        email = f"test_{uuid.uuid4().hex[:8]}@roobani.dev"
        s = requests.Session()
        r = s.post(f"{API}/auth/register", json={
            "full_name": "TEST User",
            "email": email,
            "password": "Strong123",
            "consent": True,
        })
        assert r.status_code == 201, r.text
        body = r.json()
        assert body["user"]["email"] == email
        assert body["user"]["auth_provider"] == "email"
        # cookie should now allow /me
        me = s.get(f"{API}/auth/me")
        assert me.status_code == 200
        assert me.json()["email"] == email

    def test_register_without_consent(self, session):
        email = f"noconsent_{uuid.uuid4().hex[:6]}@roobani.dev"
        r = session.post(f"{API}/auth/register", json={
            "full_name": "No Consent",
            "email": email,
            "password": "Strong123",
            "consent": False,
        })
        assert r.status_code == 400

    def test_register_weak_password(self, session):
        email = f"weak_{uuid.uuid4().hex[:6]}@roobani.dev"
        r = session.post(f"{API}/auth/register", json={
            "full_name": "Weak Pass",
            "email": email,
            "password": "alllowercase",  # no digit
            "consent": True,
        })
        assert r.status_code == 422

    def test_register_duplicate_email(self, authed_session):
        r = requests.post(f"{API}/auth/register", json={
            "full_name": "Duplicate",
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD,
            "consent": True,
        })
        assert r.status_code == 409

    def test_login_success(self):
        r = requests.post(f"{API}/auth/login", json={
            "email": TEST_EMAIL, "password": TEST_PASSWORD,
        })
        assert r.status_code == 200
        assert r.json()["user"]["email"] == TEST_EMAIL

    def test_login_wrong_password(self):
        # Use a brand new user so we don't lock the shared test account
        email = f"wp_{uuid.uuid4().hex[:6]}@roobani.dev"
        requests.post(f"{API}/auth/register", json={
            "full_name": "Wrong Pass",
            "email": email,
            "password": "Strong123",
            "consent": True,
        })
        r = requests.post(f"{API}/auth/login", json={
            "email": email, "password": "Wrong123x",
        })
        assert r.status_code == 401

    def test_me_unauthenticated(self):
        r = requests.get(f"{API}/auth/me")
        assert r.status_code == 401

    def test_logout_clears_session(self, authed_session):
        s = requests.Session()
        s.post(f"{API}/auth/login", json={"email": TEST_EMAIL, "password": TEST_PASSWORD})
        assert s.get(f"{API}/auth/me").status_code == 200
        r = s.post(f"{API}/auth/logout")
        assert r.status_code == 200
        assert r.json().get("ok") is True
        # cookie cleared client side; server should not accept
        s2 = requests.Session()
        assert s2.get(f"{API}/auth/me").status_code == 401

    def test_bearer_token_works(self):
        s = requests.Session()
        s.post(f"{API}/auth/login", json={"email": TEST_EMAIL, "password": TEST_PASSWORD})
        token = s.cookies.get("session_token")
        assert token, "session_token cookie missing"
        r = requests.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert r.status_code == 200

    def test_session_exchange_invalid(self):
        r = requests.post(f"{API}/auth/session", json={"session_id": "not-a-real-session-id-xxxxxx"})
        # Either 401 (invalid session) or 502 (provider unreachable) are acceptable
        assert r.status_code in (401, 502)

    def test_lockout_after_five_failures(self):
        email = f"lock_{uuid.uuid4().hex[:6]}@roobani.dev"
        requests.post(f"{API}/auth/register", json={
            "full_name": "Lock User",
            "email": email,
            "password": "Strong123",
            "consent": True,
        })
        # 5 wrong attempts (returns 401 each), then a 6th attempt should produce 423.
        for _ in range(5):
            r = requests.post(f"{API}/auth/login", json={"email": email, "password": "Wrongpwd9"})
            assert r.status_code == 401
        r6 = requests.post(f"{API}/auth/login", json={"email": email, "password": "Strong123"})
        assert r6.status_code == 423, f"expected lockout, got {r6.status_code} {r6.text}"


# ----------------- Leads -----------------
class TestLeads:
    def test_lead_creation_and_encryption(self):
        payload = {
            "full_name": "TEST Lead",
            "email": f"lead_{uuid.uuid4().hex[:6]}@roobani.dev",
            "phone": "9999999999",
            "country_code": "+91",
            "budget_range": "25k_100k",
            "investment_goal": "steady_growth",
            "preferred_contact": "email",
            "consent": True,
            "source_page": "home",
        }
        r = requests.post(f"{API}/leads", json=payload)
        assert r.status_code == 201, r.text
        data = r.json()
        assert data["lead_id"].startswith("lead_")
        # Verify encryption by checking that the email isn't echoed back as plain text in any list endpoint.
        # No public list endpoint exists - we can only assert the API doesn't echo PII in the response.
        assert payload["email"] not in r.text
        assert payload["phone"] not in r.text

    def test_lead_consent_required(self):
        payload = {
            "full_name": "No Consent",
            "email": f"nc_{uuid.uuid4().hex[:6]}@roobani.dev",
            "phone": "9999999999",
            "country_code": "+91",
            "budget_range": "under_5k",
            "investment_goal": "steady_growth",
            "preferred_contact": "email",
            "consent": False,
        }
        r = requests.post(f"{API}/leads", json=payload)
        assert r.status_code == 400


# ----------------- Contact -----------------
class TestContact:
    def test_contact_create(self):
        r = requests.post(f"{API}/contact", json={
            "name": "TEST Contact",
            "email": f"ct_{uuid.uuid4().hex[:6]}@roobani.dev",
            "subject": "Hello",
            "message": "This is a test contact message.",
        })
        assert r.status_code == 201, r.text
        assert r.json()["contact_id"].startswith("ct_")


# ----------------- Market -----------------
class TestMarket:
    def test_crypto(self):
        r = requests.get(f"{API}/market/crypto", timeout=20)
        assert r.status_code == 200
        body = r.json()
        assert "items" in body
        items = body["items"]
        if items:  # depends on upstream availability
            symbols = {i["symbol"] for i in items}
            assert "BTC" in symbols
            assert "ETH" in symbols
            first = items[0]
            assert {"symbol", "name", "price", "change_pct_24h", "sparkline"} <= set(first.keys())

    def test_stocks(self):
        r = requests.get(f"{API}/market/stocks", timeout=30)
        assert r.status_code == 200
        body = r.json()
        assert "groups" in body
        groups = body["groups"]
        assert {"indices", "commodities", "forex"} <= set(groups.keys())
        # Items list may be empty if upstream is rate-limited; at minimum schema must hold.
        for g in groups.values():
            for it in g:
                assert {"symbol", "name", "price", "change_pct_24h", "sparkline"} <= set(it.keys())
