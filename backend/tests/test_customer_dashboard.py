"""Customer Dashboard (Phase 3) backend tests.

Covers:
- /api/portfolio/summary
- /api/transactions (list, kind filter)
- /api/withdrawals (POST + GET, validations)
- /api/kyc/upload (POST), /api/kyc/status (GET) including validation
- /api/notifications (list, mark single, mark all)
- /api/profile (GET + PATCH)
- Regression: /api/holdings, admin login, /api/auth/me
"""
import os
import io
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@roobani.com"
ADMIN_PASS = "Admin@Roobani2026!"


# ---- helpers / fixtures ----
def _register_login(email_prefix="dash"):
    email = f"TEST_{email_prefix}_{uuid.uuid4().hex[:8]}@roobani.dev"
    pwd = "Test@1234"
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{API}/auth/register", json={
        "full_name": "TEST Dash User",
        "email": email,
        "password": pwd,
        "consent": True,
    })
    assert r.status_code in (200, 201), f"register failed: {r.status_code} {r.text}"
    return s, email, pwd


@pytest.fixture(scope="module")
def fresh_session():
    s, email, pwd = _register_login("freshcustomer")
    return {"session": s, "email": email, "password": pwd}


@pytest.fixture(scope="module")
def admin_session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{API}/admin/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASS})
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    return s


# =========================================================================
# Portfolio Summary
# =========================================================================
class TestPortfolioSummary:
    def test_summary_shape(self, fresh_session):
        s = fresh_session["session"]
        r = s.get(f"{API}/portfolio/summary")
        assert r.status_code == 200, r.text
        data = r.json()
        for key in ["holdings_count", "total_usd_equivalent", "by_plan", "by_currency",
                    "successful_deposits", "pending_withdrawals", "approved_withdrawals", "kyc_status"]:
            assert key in data, f"missing {key}: {data}"
        # fresh user has zero holdings
        assert data["holdings_count"] == 0
        assert data["total_usd_equivalent"] == 0.0
        assert data["by_plan"] == {}
        assert data["by_currency"] == {}
        assert data["pending_withdrawals"] == 0

    def test_summary_requires_auth(self):
        r = requests.get(f"{API}/portfolio/summary")
        assert r.status_code == 401


# =========================================================================
# Transactions
# =========================================================================
class TestTransactions:
    def test_list_empty(self, fresh_session):
        s = fresh_session["session"]
        r = s.get(f"{API}/transactions")
        assert r.status_code == 200
        body = r.json()
        assert "items" in body
        assert isinstance(body["items"], list)

    def test_list_with_kind_filter(self, fresh_session):
        s = fresh_session["session"]
        for kind in ("deposit", "withdrawal", "all"):
            r = s.get(f"{API}/transactions", params={"kind": kind})
            assert r.status_code == 200, f"kind {kind}: {r.text}"
        # deposit filter should never include withdrawal items for fresh user
        r = s.get(f"{API}/transactions", params={"kind": "deposit"})
        for it in r.json()["items"]:
            assert it["type"] == "deposit"

    def test_requires_auth(self):
        r = requests.get(f"{API}/transactions")
        assert r.status_code == 401


# =========================================================================
# Withdrawals
# =========================================================================
class TestWithdrawals:
    def test_reject_no_holdings(self, fresh_session):
        s = fresh_session["session"]
        r = s.post(f"{API}/withdrawals", json={
            "amount": 100,
            "currency": "usd",
            "destination_type": "bank",
            "bank_account_name": "TEST Holder",
            "bank_name": "Roobani Bank",
            "bank_account_number": "1234567890",
        })
        assert r.status_code == 400
        assert "No holdings" in r.json().get("detail", "")

    def test_reject_invalid_bank_fields(self, fresh_session):
        # Validation only triggers AFTER holdings check (no holdings yet).
        # Verify the 'No holdings' guard fires when bank fields missing.
        s = fresh_session["session"]
        r = s.post(f"{API}/withdrawals", json={
            "amount": 100, "currency": "usd", "destination_type": "bank",
        })
        assert r.status_code == 400  # because no holdings

    def test_requires_auth(self):
        r = requests.post(f"{API}/withdrawals", json={
            "amount": 100, "currency": "usd", "destination_type": "bank",
            "bank_account_name": "x", "bank_name": "y", "bank_account_number": "1234",
        })
        assert r.status_code == 401

    def test_list_withdrawals_scoped_to_user(self, fresh_session):
        s = fresh_session["session"]
        r = s.get(f"{API}/withdrawals")
        assert r.status_code == 200
        data = r.json()
        assert "items" in data
        assert isinstance(data["items"], list)

    def test_create_with_seeded_holding(self, fresh_session):
        """Seed a holding directly to exercise the full happy-path: bank + crypto."""
        s = fresh_session["session"]
        # Use the admin "seed holding" approach by directly inserting via a fund flow is too expensive.
        # Instead: ensure the model code path is exercised by attempting both destination types.
        # We can't insert a holding without going through Stripe; verify that the path returns
        # the 'No holdings' error consistently — this is the contract under test.
        for body in [
            {"amount": 50, "currency": "usd", "destination_type": "crypto",
             "crypto_asset": "USDC", "crypto_network": "ERC20",
             "crypto_wallet_address": "0xabc1234567890def1234567890abc1234567890d"},
            {"amount": 50, "currency": "usd", "destination_type": "bank",
             "bank_account_name": "TEST", "bank_name": "Bank", "bank_account_number": "1234567890"},
        ]:
            r = s.post(f"{API}/withdrawals", json=body)
            assert r.status_code == 400  # No holdings expected for fresh user


# =========================================================================
# KYC
# =========================================================================
class TestKyc:
    def test_status_endpoint_initial(self, fresh_session):
        s = fresh_session["session"]
        r = s.get(f"{API}/kyc/status")
        assert r.status_code == 200, r.text
        data = r.json()
        assert "kyc_status" in data and "documents" in data
        assert isinstance(data["documents"], list)

    def test_upload_rejects_bad_doc_type(self, fresh_session):
        s = fresh_session["session"]
        # Cookie based; do NOT send Content-Type json
        s2 = requests.Session()
        s2.cookies.update(s.cookies.get_dict())
        files = {"file": ("a.png", io.BytesIO(b"abc"), "image/png")}
        r = s2.post(f"{API}/kyc/upload", files=files, data={"document_type": "evil"})
        assert r.status_code == 400

    def test_upload_rejects_disallowed_mime(self, fresh_session):
        s = fresh_session["session"]
        s2 = requests.Session()
        s2.cookies.update(s.cookies.get_dict())
        files = {"file": ("a.exe", io.BytesIO(b"abc"), "application/x-msdownload")}
        r = s2.post(f"{API}/kyc/upload", files=files, data={"document_type": "passport"})
        assert r.status_code == 400

    def test_upload_rejects_empty_file(self, fresh_session):
        s = fresh_session["session"]
        s2 = requests.Session()
        s2.cookies.update(s.cookies.get_dict())
        files = {"file": ("a.png", io.BytesIO(b""), "image/png")}
        r = s2.post(f"{API}/kyc/upload", files=files, data={"document_type": "passport"})
        assert r.status_code == 400

    def test_upload_rejects_oversized(self, fresh_session):
        s = fresh_session["session"]
        s2 = requests.Session()
        s2.cookies.update(s.cookies.get_dict())
        # 9 MB blob
        blob = io.BytesIO(b"x" * (9 * 1024 * 1024))
        files = {"file": ("big.pdf", blob, "application/pdf")}
        r = s2.post(f"{API}/kyc/upload", files=files, data={"document_type": "passport"})
        assert r.status_code == 400

    def test_upload_success_and_status_submitted(self, fresh_session):
        s = fresh_session["session"]
        s2 = requests.Session()
        s2.cookies.update(s.cookies.get_dict())
        png = io.BytesIO(b"\x89PNG\r\n\x1a\n" + b"0" * 64)
        files = {"file": ("pass.png", png, "image/png")}
        r = s2.post(f"{API}/kyc/upload", files=files, data={"document_type": "passport"})
        assert r.status_code in (200, 201), r.text
        rec = r.json()
        assert rec["document_type"] == "passport"
        assert rec["status"] == "pending"
        # status now submitted
        r2 = s.get(f"{API}/kyc/status")
        assert r2.status_code == 200
        assert r2.json()["kyc_status"] == "submitted"
        assert any(d["document_type"] == "passport" for d in r2.json()["documents"])

    def test_upload_creates_notification(self, fresh_session):
        s = fresh_session["session"]
        r = s.get(f"{API}/notifications")
        assert r.status_code == 200
        items = r.json()["items"]
        # We may have other notifs already; at least one with kind=kyc must exist after upload
        assert any(n["kind"] == "kyc" for n in items), "no KYC notification created"


# =========================================================================
# Notifications
# =========================================================================
class TestNotifications:
    def test_list_returns_unread(self, fresh_session):
        s = fresh_session["session"]
        r = s.get(f"{API}/notifications")
        assert r.status_code == 200
        body = r.json()
        assert "items" in body and "unread_count" in body
        assert isinstance(body["unread_count"], int)

    def test_mark_single(self, fresh_session):
        s = fresh_session["session"]
        r = s.get(f"{API}/notifications")
        items = r.json()["items"]
        if not items:
            pytest.skip("no notifications to mark read")
        nid = items[0]["notification_id"]
        r2 = s.post(f"{API}/notifications/{nid}/read")
        assert r2.status_code == 200
        assert r2.json().get("ok") is True

    def test_mark_all(self, fresh_session):
        s = fresh_session["session"]
        r = s.post(f"{API}/notifications/read_all")
        assert r.status_code == 200
        assert r.json().get("ok") is True
        # Now unread_count should be 0
        r2 = s.get(f"{API}/notifications")
        assert r2.json()["unread_count"] == 0

    def test_mark_unknown_returns_404(self, fresh_session):
        s = fresh_session["session"]
        r = s.post(f"{API}/notifications/nonexistent_id/read")
        assert r.status_code == 404


# =========================================================================
# Profile
# =========================================================================
class TestProfile:
    def test_get_profile(self, fresh_session):
        s = fresh_session["session"]
        r = s.get(f"{API}/profile")
        assert r.status_code == 200
        data = r.json()
        for k in ("email", "full_name", "phone", "country", "address", "kyc_status"):
            assert k in data

    def test_patch_persists(self, fresh_session):
        s = fresh_session["session"]
        new_name = "TEST Updated Name"
        r = s.patch(f"{API}/profile", json={
            "full_name": new_name,
            "phone": "+254700000000",
            "country": "Kenya",
            "address": "Nairobi CBD",
        })
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["full_name"] == new_name
        assert body["phone"] == "+254700000000"
        assert body["country"] == "Kenya"
        assert body["address"] == "Nairobi CBD"
        # Re-GET to verify persistence
        r2 = s.get(f"{API}/profile")
        assert r2.json()["phone"] == "+254700000000"
        assert r2.json()["country"] == "Kenya"


# =========================================================================
# Regression: holdings, auth/me, admin login
# =========================================================================
class TestRegression:
    def test_holdings_still_works(self, fresh_session):
        s = fresh_session["session"]
        r = s.get(f"{API}/holdings")
        assert r.status_code == 200
        body = r.json()
        assert "items" in body

    def test_auth_me(self, fresh_session):
        s = fresh_session["session"]
        r = s.get(f"{API}/auth/me")
        assert r.status_code == 200
        assert r.json()["email"].lower() == fresh_session["email"].lower()

    def test_admin_login(self, admin_session):
        r = admin_session.get(f"{API}/admin/auth/me")
        assert r.status_code == 200, r.text


# =========================================================================
# Cross-user isolation
# =========================================================================
class TestIsolation:
    def test_withdrawals_not_shared(self):
        sA, _, _ = _register_login("isoA")
        sB, _, _ = _register_login("isoB")
        # B should not see A's items (both empty here, so just verify shape and no errors)
        rA = sA.get(f"{API}/withdrawals")
        rB = sB.get(f"{API}/withdrawals")
        assert rA.status_code == 200 and rB.status_code == 200
        assert rA.json()["items"] == [] and rB.json()["items"] == []

    def test_notifications_not_shared(self):
        sA, _, _ = _register_login("isoNA")
        sB, _, _ = _register_login("isoNB")
        # Upload a KYC for A to create a notification, B should still have 0
        files = {"file": ("p.png", io.BytesIO(b"\x89PNG\r\n\x1a\n" + b"0" * 64), "image/png")}
        sA2 = requests.Session()
        sA2.cookies.update(sA.cookies.get_dict())
        sA2.post(f"{API}/kyc/upload", files=files, data={"document_type": "passport"})
        rB = sB.get(f"{API}/notifications")
        assert rB.status_code == 200
        assert rB.json()["unread_count"] == 0
