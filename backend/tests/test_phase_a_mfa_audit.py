"""Phase A: MFA + audit log + admin auth — end-to-end backend tests.

Hits the PUBLIC URL so that Secure cookies flow. Uses pyotp to derive valid
TOTP codes from the secret returned by /admin/auth/login.

Reset state externally before running:
  mongosh --quiet --eval 'db = db.getSiblingDB("test_database");
    db.admin_users.updateOne({email_lookup:"admin@roobani.com"},
      {$set:{mfa_enabled:false,totp_secret_enc:null,recovery_codes_hashed:[]}});
    db.mfa_challenges.deleteMany({}); db.admin_sessions.deleteMany({});'
"""
import os
import re
import time
import uuid
import pyotp
import pytest
import requests

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"

SUPER_EMAIL = "admin@roobani.com"
SUPER_PASS = "Admin@Roobani2026!"
CUST_EMAIL = "admin@roobani.dev"
CUST_PASS = "RoobaniAdmin#2026"


# ------------- shared state across tests -------------
state: dict = {}


# ------------- helpers -------------
def login_password(s: requests.Session, email: str, password: str) -> dict:
    r = s.post(f"{API}/admin/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return r.json()


def fresh_session() -> requests.Session:
    return requests.Session()


# ------------- 1. Initial login -> setup_required -------------
class TestPhaseA_MFA:
    def test_01_login_unenrolled_returns_setup_required(self):
        s = fresh_session()
        body = login_password(s, SUPER_EMAIL, SUPER_PASS)
        assert body.get("mfa_setup_required") is True
        for k in ("challenge_token", "otpauth_uri", "qr_svg_data_uri", "secret", "issuer", "ttl_minutes"):
            assert k in body, f"missing {k}"
        assert isinstance(body["challenge_token"], str) and len(body["challenge_token"]) >= 10
        assert body["qr_svg_data_uri"].startswith("data:")
        assert body["issuer"] == "Roobani Admin"
        assert body["ttl_minutes"] == 5
        # secret is 32-char base32
        assert re.fullmatch(r"[A-Z2-7]{32}", body["secret"]), body["secret"]
        # no session cookie set
        assert s.cookies.get("admin_session_token") is None
        state["setup"] = body
        state["super_session"] = s

    def test_02_setup_wrong_code_returns_401(self):
        s = state["super_session"]
        ch = state["setup"]["challenge_token"]
        r = s.post(f"{API}/admin/auth/mfa/setup", json={"challenge_token": ch, "code": "000000"})
        assert r.status_code == 401, r.text
        assert r.json().get("detail") == "Invalid authenticator code"
        assert s.cookies.get("admin_session_token") is None

    def test_03_setup_correct_code_enrols_and_returns_recovery_codes(self):
        s = state["super_session"]
        ch = state["setup"]["challenge_token"]
        secret = state["setup"]["secret"]
        code = pyotp.TOTP(secret).now()
        r = s.post(f"{API}/admin/auth/mfa/setup", json={"challenge_token": ch, "code": code})
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["admin"]["mfa_enabled"] is True
        rc = body["recovery_codes"]
        assert isinstance(rc, list) and len(rc) == 8
        for c in rc:
            assert re.fullmatch(r"[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}", c), c
        assert s.cookies.get("admin_session_token") is not None
        state["super_admin"] = body["admin"]
        state["recovery_codes"] = rc

    def test_04_me_after_setup_shows_mfa_enabled(self):
        s = state["super_session"]
        r = s.get(f"{API}/admin/auth/me")
        assert r.status_code == 200, r.text
        a = r.json()
        assert a.get("mfa_enabled") is True
        assert a.get("email") == SUPER_EMAIL

    def test_05_replay_consumed_setup_challenge(self):
        s = state["super_session"]
        ch = state["setup"]["challenge_token"]
        secret = state["setup"]["secret"]
        r = s.post(f"{API}/admin/auth/mfa/setup",
                   json={"challenge_token": ch, "code": pyotp.TOTP(secret).now()})
        assert r.status_code == 400, r.text
        assert "Invalid or expired" in r.json().get("detail", "")


# ------------- 2. Subsequent login + verify -------------
class TestPhaseA_LoginVerify:
    def test_10_login_enrolled_returns_mfa_required(self):
        s = fresh_session()
        body = login_password(s, SUPER_EMAIL, SUPER_PASS)
        assert body.get("mfa_required") is True
        assert isinstance(body.get("challenge_token"), str)
        assert s.cookies.get("admin_session_token") is None
        state["login_challenge"] = body["challenge_token"]
        state["login_session"] = s

    def test_11_verify_totp_success_sets_cookie(self):
        s = state["login_session"]
        secret = state["setup"]["secret"]
        # Wait if previous TOTP code window is the same as enrol's — verify uses login challenge so OK
        r = s.post(f"{API}/admin/auth/mfa/verify",
                   json={"challenge_token": state["login_challenge"], "code": pyotp.TOTP(secret).now()})
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("via") == "totp"
        assert s.cookies.get("admin_session_token") is not None

    def test_12_verify_recovery_code_path(self):
        s = fresh_session()
        body = login_password(s, SUPER_EMAIL, SUPER_PASS)
        ch = body["challenge_token"]
        rc = state["recovery_codes"][0]
        r = s.post(f"{API}/admin/auth/mfa/verify", json={"challenge_token": ch, "code": rc})
        assert r.status_code == 200, r.text
        b = r.json()
        assert b.get("via") == "recovery"
        # original was 8; this attempt consumes one
        assert b.get("remaining_recovery_codes") == 7
        assert s.cookies.get("admin_session_token") is not None
        state["used_recovery"] = rc
        state["recovery_session"] = s

    def test_13_replay_recovery_code_rejected(self):
        s = fresh_session()
        body = login_password(s, SUPER_EMAIL, SUPER_PASS)
        ch = body["challenge_token"]
        r = s.post(f"{API}/admin/auth/mfa/verify",
                   json={"challenge_token": ch, "code": state["used_recovery"]})
        assert r.status_code == 401, r.text

    def test_14_rate_limit_on_verify(self):
        # Use a single challenge token and hammer /verify repeatedly.
        # This isolates the /verify rate-limit from /login's own per-IP limit.
        s = fresh_session()
        body = login_password(s, SUPER_EMAIL, SUPER_PASS)
        ch = body["challenge_token"]
        codes = []
        for _ in range(13):
            r = s.post(f"{API}/admin/auth/mfa/verify",
                       json={"challenge_token": ch, "code": "000000"})
            codes.append(r.status_code)
            if 429 in codes:
                break
        assert 429 in codes, f"expected 429, got {codes}"
        # Let the per-IP login rate-limit window reset before the next class runs.
        time.sleep(62)


# ------------- 3. Self-service disable -------------
class TestPhaseA_Disable:
    def test_20_disable_wrong_password(self):
        s = state["super_session"]
        secret = state["setup"]["secret"]
        r = s.post(f"{API}/admin/auth/mfa/disable",
                   json={"password": "wrong-password-9999", "code": pyotp.TOTP(secret).now()})
        assert r.status_code == 401, r.text

    def test_21_disable_wrong_code(self):
        s = state["super_session"]
        r = s.post(f"{API}/admin/auth/mfa/disable",
                   json={"password": SUPER_PASS, "code": "000000"})
        assert r.status_code == 401, r.text

    def test_22_disable_success_then_re_enrol(self):
        # need a session w/o burning rate limit; reuse super_session
        s = state["super_session"]
        secret = state["setup"]["secret"]
        # Ensure TOTP code differs from the one used during enrol — wait if needed.
        # pyotp 30s window; we slept enough between tests already.
        r = s.post(f"{API}/admin/auth/mfa/disable",
                   json={"password": SUPER_PASS, "code": pyotp.TOTP(secret).now()})
        assert r.status_code == 200, r.text
        # me now shows mfa_enabled false
        me = s.get(f"{API}/admin/auth/me").json()
        assert me["mfa_enabled"] is False
        # Re-enrol so subsequent tests have an enrolled super-admin
        s2 = fresh_session()
        body = login_password(s2, SUPER_EMAIL, SUPER_PASS)
        assert body.get("mfa_setup_required") is True
        new_secret = body["secret"]
        time.sleep(1)
        r = s2.post(f"{API}/admin/auth/mfa/setup",
                    json={"challenge_token": body["challenge_token"],
                          "code": pyotp.TOTP(new_secret).now()})
        assert r.status_code == 200, r.text
        state["setup"]["secret"] = new_secret  # update
        state["super_session"] = s2
        state["recovery_codes"] = r.json()["recovery_codes"]


# ------------- 4. Super-admin force-disable on second admin -------------
class TestPhaseA_ForceDisable:
    def test_30_create_second_admin_and_enrol(self):
        s = state["super_session"]
        email2 = f"test_phaseA_{uuid.uuid4().hex[:6]}@roobani.io"
        passwd = "Test@Pass2026!"
        r = s.post(f"{API}/admin/admins",
                   json={"full_name": "Phase A Tester",
                         "email": email2, "password": passwd, "access_level": 1})
        assert r.status_code == 201, r.text
        admin2 = r.json()
        state["admin2"] = admin2
        state["admin2_email"] = email2
        state["admin2_pass"] = passwd

        # Enrol admin2
        s2 = fresh_session()
        body = login_password(s2, email2, passwd)
        assert body.get("mfa_setup_required") is True
        sec = body["secret"]
        time.sleep(1)
        r = s2.post(f"{API}/admin/auth/mfa/setup",
                    json={"challenge_token": body["challenge_token"],
                          "code": pyotp.TOTP(sec).now()})
        assert r.status_code == 200, r.text
        state["admin2_session"] = s2
        state["admin2_secret"] = sec

    def test_31_force_disable_self_rejected(self):
        s = state["super_session"]
        me = s.get(f"{API}/admin/auth/me").json()
        r = s.post(f"{API}/admin/auth/mfa/force-disable",
                   json={"target_admin_id": me["admin_id"]})
        assert r.status_code == 400, r.text

    def test_32_force_disable_other_succeeds_and_kills_session(self):
        s = state["super_session"]
        target_id = state["admin2"]["admin_id"]
        r = s.post(f"{API}/admin/auth/mfa/force-disable",
                   json={"target_admin_id": target_id})
        assert r.status_code == 200, r.text
        # admin2's previous session should now fail
        old = state["admin2_session"]
        me_r = old.get(f"{API}/admin/auth/me")
        assert me_r.status_code == 401, me_r.text
        # Next login by admin2 returns setup_required
        s3 = fresh_session()
        body = login_password(s3, state["admin2_email"], state["admin2_pass"])
        assert body.get("mfa_setup_required") is True


# ------------- 5. Audit log -------------
class TestPhaseA_Audit:
    def test_40_audit_list_shape(self):
        s = state["super_session"]
        r = s.get(f"{API}/admin/audit", params={"limit": 50, "offset": 0})
        assert r.status_code == 200, r.text
        body = r.json()
        for k in ("items", "total", "limit", "offset"):
            assert k in body, k
        assert isinstance(body["items"], list)
        assert len(body["items"]) > 0
        sample = body["items"][0]
        assert "ip" in sample and isinstance(sample["ip"], str)
        assert "user_agent" in sample and isinstance(sample["user_agent"], str)

    def test_41_audit_filter_action_login(self):
        s = state["super_session"]
        r = s.get(f"{API}/admin/audit", params={"action": "admin.login", "limit": 50})
        assert r.status_code == 200, r.text
        items = r.json()["items"]
        assert len(items) > 0
        for it in items:
            assert it["action"] == "admin.login"

    def test_42_audit_filter_admin_id(self):
        s = state["super_session"]
        me = s.get(f"{API}/admin/auth/me").json()
        r = s.get(f"{API}/admin/audit", params={"admin_id": me["admin_id"], "limit": 100})
        assert r.status_code == 200, r.text
        items = r.json()["items"]
        assert len(items) > 0
        for it in items:
            assert it["admin_id"] == me["admin_id"]

    def test_43_audit_q_regex(self):
        s = state["super_session"]
        r = s.get(f"{API}/admin/audit", params={"q": "admin.mfa", "limit": 100})
        assert r.status_code == 200, r.text
        items = r.json()["items"]
        # We've enrolled, disabled, force-disabled — should have results
        assert len(items) > 0
        assert any("admin.mfa" in it["action"] for it in items)

    def test_44_audit_captures_recent_actions(self):
        s = state["super_session"]
        r = s.get(f"{API}/admin/audit", params={"limit": 200})
        actions = {it["action"] for it in r.json()["items"]}
        # Must contain the new MFA-related events seeded earlier
        for need in ("admin.login", "admin.mfa.enroll", "admin.mfa.disable",
                     "admin.mfa.fail", "admin.mfa.force_disable"):
            assert need in actions, f"missing {need} in {actions}"

    def test_45_audit_target_type_unmatched(self):
        s = state["super_session"]
        r = s.get(f"{API}/admin/audit", params={"target_type": "nonexistent_xyz"})
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["total"] == 0
        assert body["items"] == []

    def test_46_audit_pagination(self):
        s = state["super_session"]
        # Need enough rows. If total<=50 skip the differential.
        r0 = s.get(f"{API}/admin/audit", params={"offset": 0, "limit": 10}).json()
        if r0["total"] <= 50:
            pytest.skip(f"only {r0['total']} audit rows; need >50 to differentiate slices")
        r1 = s.get(f"{API}/admin/audit", params={"offset": 50, "limit": 10}).json()
        ids0 = [it["audit_id"] for it in r0["items"]]
        ids1 = [it["audit_id"] for it in r1["items"]]
        assert ids0 != ids1
        assert not (set(ids0) & set(ids1))

    def test_47_audit_unauth_401(self):
        r = requests.get(f"{API}/admin/audit")
        assert r.status_code == 401, r.text

    def test_48_audit_non_super_admin_403(self):
        # Use admin2 — re-enrol fresh to get a session at access_level=1
        s = fresh_session()
        body = login_password(s, state["admin2_email"], state["admin2_pass"])
        assert body.get("mfa_setup_required") is True
        sec = body["secret"]
        time.sleep(1)
        r = s.post(f"{API}/admin/auth/mfa/setup",
                   json={"challenge_token": body["challenge_token"],
                         "code": pyotp.TOTP(sec).now()})
        assert r.status_code == 200, r.text
        r = s.get(f"{API}/admin/audit")
        assert r.status_code == 403, r.text


# ------------- 6. Sanity: untouched admin endpoints still work -------------
class TestPhaseA_AdminSanity:
    def test_50_admins_list(self):
        s = state["super_session"]
        r = s.get(f"{API}/admin/admins")
        assert r.status_code == 200, r.text

    def test_51_customers_list(self):
        s = state["super_session"]
        r = s.get(f"{API}/admin/customers")
        assert r.status_code == 200, r.text

    def test_52_dashboard(self):
        s = state["super_session"]
        r = s.get(f"{API}/admin/dashboard")
        assert r.status_code == 200, r.text

    def test_53_settings(self):
        s = state["super_session"]
        r = s.get(f"{API}/admin/settings")
        assert r.status_code == 200, r.text


# ------------- 7. Backwards compatibility: customer auth -------------
class TestPhaseA_CustomerAuthBC:
    def test_60_customer_login_and_me(self):
        s = requests.Session()
        r = s.post(f"{API}/auth/login", json={"email": CUST_EMAIL, "password": CUST_PASS})
        assert r.status_code == 200, r.text
        # session cookie or token returned
        # GET /auth/me works
        r2 = s.get(f"{API}/auth/me")
        assert r2.status_code == 200, r2.text
        me = r2.json()
        assert me.get("email", "").lower() == CUST_EMAIL


# ------------- 8. Cleanup -------------
@pytest.fixture(scope="session", autouse=True)
def _cleanup():
    yield
    # delete admin2 if created
    try:
        admin2 = state.get("admin2")
        if admin2 and state.get("super_session"):
            state["super_session"].delete(f"{API}/admin/admins/{admin2['admin_id']}")
    except Exception:
        pass
