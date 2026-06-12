"""Roobani iteration 2 backend tests.

Covers:
- Password reset (request + confirm) with enumeration safety, single-use, weak password.
- Email verification (register → token → confirm → /me; resend; already_verified).
- Admin RBAC (admin login, stats, leads, contacts, 403 for non-admin).
- Stripe checkout fund (session create + transaction persisted, min/max validation).
- Checkout status (404 for unknown, owner enforcement).
- Holdings list (empty for fresh user).
"""
import os
import uuid

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@roobani.dev"
ADMIN_PASSWORD = "RoobaniAdmin#2026"


def _register(email: str, password: str = "Strong123", full_name: str = "TEST User"):
    s = requests.Session()
    r = s.post(f"{API}/auth/register", json={
        "full_name": full_name, "email": email, "password": password, "consent": True,
    })
    return s, r


@pytest.fixture(scope="module")
def admin_session():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    return s


@pytest.fixture(scope="module")
def user_session():
    email = f"it2_{uuid.uuid4().hex[:8]}@roobani.dev"
    s, r = _register(email)
    assert r.status_code == 201, r.text
    s._email = email  # type: ignore
    s._reg_body = r.json()  # type: ignore
    return s


# ---------------- Password Reset ----------------
class TestPasswordReset:
    def test_request_for_known_email_returns_dev_token(self):
        email = f"pr_{uuid.uuid4().hex[:8]}@roobani.dev"
        _register(email, "Strong123")
        r = requests.post(f"{API}/auth/password/reset/request", json={"email": email})
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("ok") is True
        assert "dev_token" in body and isinstance(body["dev_token"], str) and len(body["dev_token"]) > 5

    def test_request_for_unknown_email_returns_ok_no_token(self):
        r = requests.post(f"{API}/auth/password/reset/request",
                          json={"email": f"unknown_{uuid.uuid4().hex[:6]}@roobani.dev"})
        assert r.status_code == 200
        body = r.json()
        assert body.get("ok") is True
        assert "dev_token" not in body

    def test_confirm_flow_full(self):
        email = f"prc_{uuid.uuid4().hex[:8]}@roobani.dev"
        _register(email, "Strong123")
        token = requests.post(f"{API}/auth/password/reset/request", json={"email": email}).json()["dev_token"]
        new_pw = "Brandnew99"
        r = requests.post(f"{API}/auth/password/reset/confirm",
                          json={"token": token, "new_password": new_pw})
        assert r.status_code == 200, r.text
        # Login with new password works
        ok = requests.post(f"{API}/auth/login", json={"email": email, "password": new_pw})
        assert ok.status_code == 200
        # Old password no longer works
        bad = requests.post(f"{API}/auth/login", json={"email": email, "password": "Strong123"})
        assert bad.status_code == 401
        # Token cannot be reused
        again = requests.post(f"{API}/auth/password/reset/confirm",
                              json={"token": token, "new_password": "Another99"})
        assert again.status_code == 400

    def test_confirm_invalid_token(self):
        r = requests.post(f"{API}/auth/password/reset/confirm",
                          json={"token": "bogus_token_xxxxxxx", "new_password": "Strong123"})
        assert r.status_code == 400

    def test_confirm_weak_password_rejected(self):
        email = f"prw_{uuid.uuid4().hex[:8]}@roobani.dev"
        _register(email, "Strong123")
        token = requests.post(f"{API}/auth/password/reset/request", json={"email": email}).json()["dev_token"]
        r = requests.post(f"{API}/auth/password/reset/confirm",
                          json={"token": token, "new_password": "alphabets"})  # no digit
        assert r.status_code == 422


# ---------------- Email Verification ----------------
class TestEmailVerify:
    def test_register_returns_verification_token(self, user_session):
        body = user_session._reg_body  # type: ignore
        assert "email_verification_token" in body
        assert isinstance(body["email_verification_token"], str) and len(body["email_verification_token"]) > 5
        assert body["user"]["email_verified"] is False

    def test_confirm_sets_email_verified_true(self):
        email = f"ev_{uuid.uuid4().hex[:8]}@roobani.dev"
        s, r = _register(email)
        token = r.json()["email_verification_token"]
        c = requests.post(f"{API}/auth/email/verify/confirm", json={"token": token})
        assert c.status_code == 200, c.text
        me = s.get(f"{API}/auth/me")
        assert me.status_code == 200
        assert me.json()["email_verified"] is True

    def test_verify_request_authenticated_returns_dev_token(self):
        email = f"evr_{uuid.uuid4().hex[:8]}@roobani.dev"
        s, _r = _register(email)
        r = s.post(f"{API}/auth/email/verify/request")
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("ok") is True
        assert "dev_token" in body

    def test_verify_request_already_verified(self):
        email = f"evv_{uuid.uuid4().hex[:8]}@roobani.dev"
        s, reg = _register(email)
        token = reg.json()["email_verification_token"]
        requests.post(f"{API}/auth/email/verify/confirm", json={"token": token})
        r = s.post(f"{API}/auth/email/verify/request")
        assert r.status_code == 200
        body = r.json()
        assert body.get("ok") is True
        assert body.get("already_verified") is True
        assert "dev_token" not in body


# ---------------- Admin RBAC ----------------
class TestAdmin:
    def test_admin_login_and_is_admin_flag(self, admin_session):
        me = admin_session.get(f"{API}/auth/me")
        assert me.status_code == 200
        assert me.json().get("is_admin") is True

    def test_admin_stats(self, admin_session):
        r = admin_session.get(f"{API}/admin/stats")
        assert r.status_code == 200
        body = r.json()
        for k in ("leads", "contacts", "users", "holdings", "total_invested_usd"):
            assert k in body
        assert isinstance(body["users"], int)
        assert body["users"] >= 1

    def test_admin_leads_decrypted(self, admin_session):
        # First post a lead so we have something to inspect
        new_email = f"adminlead_{uuid.uuid4().hex[:6]}@roobani.dev"
        requests.post(f"{API}/leads", json={
            "full_name": "TEST AdminLead", "email": new_email, "phone": "9876543210",
            "country_code": "+91", "budget_range": "25k_100k",
            "investment_goal": "steady_growth", "preferred_contact": "email",
            "consent": True, "source_page": "home",
        })
        r = admin_session.get(f"{API}/admin/leads")
        assert r.status_code == 200
        items = r.json()["items"]
        assert isinstance(items, list) and len(items) >= 1
        # find ours
        found = next((it for it in items if it.get("email") == new_email), None)
        assert found is not None, "lead should be decrypted and visible to admin"
        assert "+91" in (found.get("phone") or "")

    def test_admin_contacts_decrypted(self, admin_session):
        new_email = f"admincontact_{uuid.uuid4().hex[:6]}@roobani.dev"
        requests.post(f"{API}/contact", json={
            "name": "TEST AdminContact", "email": new_email, "subject": "Hi",
            "message": "Testing admin contacts decryption.",
        })
        r = admin_session.get(f"{API}/admin/contacts")
        assert r.status_code == 200
        items = r.json()["items"]
        assert isinstance(items, list) and len(items) >= 1
        found = next((it for it in items if it.get("email") == new_email), None)
        assert found is not None

    def test_non_admin_forbidden(self, user_session):
        for path in ("/admin/stats", "/admin/leads", "/admin/contacts"):
            r = user_session.get(f"{API}{path}")
            assert r.status_code == 403, f"{path} expected 403 got {r.status_code}"

    def test_unauthenticated_admin_endpoints(self):
        for path in ("/admin/stats", "/admin/leads", "/admin/contacts"):
            r = requests.get(f"{API}{path}")
            assert r.status_code == 401


# ---------------- Checkout / Fund ----------------
class TestCheckout:
    def test_fund_creates_session_and_persists(self, user_session):
        r = user_session.post(f"{API}/checkout/fund", json={
            "plan_slug": "foundation", "amount": 1500.0,
            "origin_url": BASE_URL, "payment_method": "card_and_crypto",
        })
        assert r.status_code == 200, r.text
        body = r.json()
        assert "url" in body and body["url"].startswith("http")
        assert "session_id" in body and isinstance(body["session_id"], str)
        # status endpoint should now know about this session
        st = user_session.get(f"{API}/checkout/status/{body['session_id']}")
        assert st.status_code == 200
        st_body = st.json()
        assert "payment_status" in st_body
        # Save for next assertion
        user_session._last_session_id = body["session_id"]  # type: ignore

    def test_fund_below_minimum(self, user_session):
        r = user_session.post(f"{API}/checkout/fund", json={
            "plan_slug": "growth", "amount": 100.0,  # below 5000
            "origin_url": BASE_URL, "payment_method": "card",
        })
        assert r.status_code == 400

    def test_fund_above_maximum(self, user_session):
        r = user_session.post(f"{API}/checkout/fund", json={
            "plan_slug": "foundation", "amount": 99999999.0,
            "origin_url": BASE_URL, "payment_method": "card",
        })
        assert r.status_code == 400

    def test_fund_requires_auth(self):
        r = requests.post(f"{API}/checkout/fund", json={
            "plan_slug": "foundation", "amount": 1500.0,
            "origin_url": BASE_URL, "payment_method": "card",
        })
        assert r.status_code == 401

    def test_status_unknown_session_404(self, user_session):
        r = user_session.get(f"{API}/checkout/status/cs_test_does_not_exist_xyz")
        assert r.status_code == 404

    def test_status_other_user_404(self, user_session):
        # create another user and try to read user_session's session_id
        if not hasattr(user_session, "_last_session_id"):
            pytest.skip("no session created earlier")
        other_email = f"other_{uuid.uuid4().hex[:6]}@roobani.dev"
        other, _ = _register(other_email)
        r = other.get(f"{API}/checkout/status/{user_session._last_session_id}")  # type: ignore
        assert r.status_code == 404


# ---------------- Holdings ----------------
class TestHoldings:
    def test_holdings_empty_for_new_user(self):
        email = f"hh_{uuid.uuid4().hex[:8]}@roobani.dev"
        s, _ = _register(email)
        r = s.get(f"{API}/holdings")
        assert r.status_code == 200
        body = r.json()
        assert body.get("items") == []
        assert body.get("total_invested") == 0

    def test_holdings_requires_auth(self):
        r = requests.get(f"{API}/holdings")
        assert r.status_code == 401
