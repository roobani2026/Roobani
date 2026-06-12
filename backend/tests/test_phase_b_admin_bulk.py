"""Phase B: Admin UX overhaul — backend coverage.

Verifies:
- Server-side pagination/filter/sort on /admin/customers, /admin/admins,
  /admin/withdrawals.
- Bulk endpoints (/admin/customers/bulk, /admin/admins/bulk-delete,
  /admin/withdrawals/bulk-decide) including partial-failure semantics + audit
  emission with meta.via='bulk'.
- Auth gates (401 / 403) and backwards-compat single endpoints.
- Manager (access_level=1) scope restriction on customers.

Hits the public preview URL so secure cookies travel.

Pre-run reset (also embedded in fixture):
  mongosh --quiet --eval 'db = db.getSiblingDB("test_database");
    db.admin_users.updateOne({email_lookup:"admin@roobani.com"},
      {$set:{mfa_enabled:false,totp_secret_enc:null,recovery_codes_hashed:[],
             failed_attempts:0,locked_until:null}});
    db.admin_users.deleteMany({email_lookup:{$regex:"^test_phase"}});
    db.users.deleteMany({email_lookup:{$regex:"^test_phaseb_"}});
    db.withdrawals.deleteMany({withdrawal_id:{$regex:"^wd_phaseb_"}});
    db.mfa_challenges.deleteMany({}); db.admin_sessions.deleteMany({});'
"""
from __future__ import annotations

import os
import re
import time
import uuid
import subprocess
import pyotp
import pytest
import requests

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"

SUPER_EMAIL = "admin@roobani.com"
SUPER_PASS = "Admin@Roobani2026!"


# ----------------- module-scoped state -----------------
S: dict = {}


# ----------------- helpers -----------------
def _mongo_reset():
    cmd = (
        'db = db.getSiblingDB("test_database");'
        'db.admin_users.updateOne({email_lookup:"admin@roobani.com"},'
        '{$set:{mfa_enabled:false,totp_secret_enc:null,recovery_codes_hashed:[],'
        'failed_attempts:0,locked_until:null}});'
        'db.admin_users.deleteMany({email_lookup:{$regex:"^test_phase"}});'
        'db.users.deleteMany({email_lookup:{$regex:"^test_phaseb_"}});'
        'db.withdrawals.deleteMany({withdrawal_id:{$regex:"^wd_phaseb_"}});'
        'db.customer_assignments.deleteMany({customer_user_id:{$regex:"^user_phaseb_"}});'
        'db.audit_logs.deleteMany({target_id:{$regex:"^user_phaseb_"}});'
        'db.audit_logs.deleteMany({target_id:{$regex:"^wd_phaseb_"}});'
        'db.mfa_challenges.deleteMany({});'
        'db.admin_sessions.deleteMany({});'
    )
    subprocess.run(["mongosh", "--quiet", "--eval", cmd], check=True, capture_output=True)


def _mongo_seed():
    """Seed customers + withdrawals directly to skip signup rate limits."""
    # Seed 12 customers with varied kyc/plan/blocked attributes
    customers_js = ""
    for i in range(12):
        uid = f"user_phaseb_{i:03d}_{uuid.uuid4().hex[:6]}"
        kyc = ["pending", "verified", "rejected"][i % 3]
        plan = ["starter", "pro", "elite"][i % 3]
        blocked = "true" if i % 4 == 0 else "false"
        # created_at lexicographically increasing so sort works
        created = f"2024-01-{(i+1):02d}T10:00:00+00:00"
        email = f"test_phaseb_{i:03d}@example.com"
        full = f"PhaseB User {i:03d}"
        customers_js += (
            f'db.users.insertOne({{user_id:"{uid}",email_lookup:"{email}",'
            f'email_enc:"{email}",full_name:"{full}",password_hash:"x",'
            f'kyc_status:"{kyc}",plan_slug:"{plan}",blocked:{blocked},'
            f'consent:true,created_at:"{created}",updated_at:"{created}"}});'
        )
        S.setdefault("seed_user_ids", []).append(uid)
        S.setdefault("seed_user_meta", {})[uid] = {
            "kyc": kyc, "plan": plan, "blocked": (blocked == "true"),
            "email": email, "full_name": full,
        }

    # Seed 6 withdrawals (4 pending, 1 approved, 1 rejected)
    withdrawals_js = ""
    for i in range(6):
        wid = f"wd_phaseb_{i:03d}_{uuid.uuid4().hex[:6]}"
        status = "pending"
        if i == 4:
            status = "approved"
        elif i == 5:
            status = "rejected"
        cust_uid = S["seed_user_ids"][i]
        created = f"2024-02-{(i+1):02d}T10:00:00+00:00"
        withdrawals_js += (
            f'db.withdrawals.insertOne({{withdrawal_id:"{wid}",'
            f'customer_user_id:"{cust_uid}",amount:{(i+1)*100},currency:"USD",'
            f'status:"{status}",destination_type:"bank",'
            f'bank_beneficiary:"PhaseB Bene {i}",'
            f'destination_summary:"PhaseB summary {i}",'
            f'requested_by_admin_id:null,'
            f'created_at:"{created}",updated_at:"{created}"}});'
        )
        S.setdefault("seed_wid", []).append({"id": wid, "status": status})

    subprocess.run(
        ["mongosh", "--quiet", "--eval",
         f'db = db.getSiblingDB("test_database");{customers_js}{withdrawals_js}'],
        check=True, capture_output=True
    )


def _login_with_mfa(email: str, password: str) -> requests.Session:
    """Password login -> auto-enrol MFA if needed -> verify TOTP -> return session
    with admin_session_token cookie set."""
    s = requests.Session()
    r = s.post(f"{API}/admin/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
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
        assert secret, f"need secret for {email}"
        ch = body["challenge_token"]
        # avoid TOTP code reuse
        time.sleep(1)
        code = pyotp.TOTP(secret).now()
        r2 = s.post(f"{API}/admin/auth/mfa/verify",
                    json={"challenge_token": ch, "code": code})
        assert r2.status_code == 200, r2.text
    assert s.cookies.get("admin_session_token"), "no admin session cookie"
    return s


# ----------------- module setup -----------------
@pytest.fixture(scope="module", autouse=True)
def _module_setup():
    _mongo_reset()
    _mongo_seed()
    # Super admin session
    S["super"] = _login_with_mfa(SUPER_EMAIL, SUPER_PASS)
    me = S["super"].get(f"{API}/admin/auth/me").json()
    S["super_admin_id"] = me["admin_id"]
    yield
    # cleanup
    _mongo_reset()


# ============================================================
# 1. Customer LIST: pagination / sort / filters / scope
# ============================================================
class TestCustomerList:
    def test_01_list_shape_and_defaults(self):
        s: requests.Session = S["super"]
        r = s.get(f"{API}/admin/customers")
        assert r.status_code == 200, r.text
        body = r.json()
        for k in ("items", "total", "limit", "offset", "scope"):
            assert k in body, f"missing {k}"
        assert body["limit"] == 50
        assert body["offset"] == 0
        assert body["scope"] == "all"
        assert isinstance(body["items"], list)
        assert body["total"] >= 12  # at least our 12 seeded
        # default sort created_at desc -> first item should be one of seed (latest seeded created_at = 2024-01-12)
        # but other pre-existing customers may sort newer; just check shape
        for it in body["items"][:5]:
            assert "user_id" in it

    def test_02_limit_cap_and_offset_clamp(self):
        s: requests.Session = S["super"]
        # limit cap 500
        r = s.get(f"{API}/admin/customers", params={"limit": 9999})
        assert r.status_code == 200
        assert r.json()["limit"] == 500
        # negative offset clamped to 0
        r2 = s.get(f"{API}/admin/customers", params={"offset": -10})
        assert r2.status_code == 200
        assert r2.json()["offset"] == 0

    def test_03_filter_kyc_verified(self):
        s: requests.Session = S["super"]
        r = s.get(f"{API}/admin/customers", params={"kyc": "verified", "limit": 500})
        assert r.status_code == 200
        items = r.json()["items"]
        # Our seed produces 4 verified (i%3==1: indices 1,4,7,10)
        ours = [u for u in items if u["user_id"].startswith("user_phaseb_")]
        assert len(ours) == 4
        for u in ours:
            assert u.get("kyc_status") == "verified"

    def test_04_filter_q_and_blocked(self):
        s: requests.Session = S["super"]
        r = s.get(f"{API}/admin/customers", params={"q": "PhaseB User 001", "limit": 50})
        assert r.status_code == 200
        items = r.json()["items"]
        assert any(u["user_id"].startswith("user_phaseb_001") for u in items)

        r2 = s.get(f"{API}/admin/customers", params={"blocked": "true", "limit": 500})
        assert r2.status_code == 200
        ours = [u for u in r2.json()["items"] if u["user_id"].startswith("user_phaseb_")]
        # indices 0,4,8 blocked (i%4==0) -> 3
        assert len(ours) == 3
        for u in ours:
            assert u.get("blocked") is True

    def test_05_filter_plan(self):
        s: requests.Session = S["super"]
        r = s.get(f"{API}/admin/customers", params={"plan": "elite", "limit": 500})
        assert r.status_code == 200
        ours = [u for u in r.json()["items"] if u["user_id"].startswith("user_phaseb_")]
        # i%3==2 -> 4 (i=2,5,8,11)
        assert len(ours) == 4
        for u in ours:
            assert u.get("plan_slug") == "elite"

    def test_06_sort_full_name_asc(self):
        s: requests.Session = S["super"]
        r = s.get(f"{API}/admin/customers",
                  params={"sort": "full_name", "order": "asc",
                          "q": "PhaseB User", "limit": 500})
        assert r.status_code == 200
        items = [u for u in r.json()["items"] if u["user_id"].startswith("user_phaseb_")]
        names = [u["full_name"] for u in items]
        assert names == sorted(names)

    def test_07_invalid_sort_falls_back(self):
        s: requests.Session = S["super"]
        r1 = s.get(f"{API}/admin/customers", params={"sort": "haxx0r", "limit": 5})
        r2 = s.get(f"{API}/admin/customers", params={"sort": "created_at", "limit": 5})
        assert r1.status_code == 200 and r2.status_code == 200
        # silent fallback to created_at — first ids match
        ids1 = [u["user_id"] for u in r1.json()["items"]]
        ids2 = [u["user_id"] for u in r2.json()["items"]]
        assert ids1 == ids2

    def test_08_pagination_no_overlap(self):
        s: requests.Session = S["super"]
        a = s.get(f"{API}/admin/customers",
                  params={"limit": 5, "offset": 0, "q": "PhaseB User"}).json()
        b = s.get(f"{API}/admin/customers",
                  params={"limit": 5, "offset": 5, "q": "PhaseB User"}).json()
        ids_a = {u["user_id"] for u in a["items"]}
        ids_b = {u["user_id"] for u in b["items"]}
        assert ids_a.isdisjoint(ids_b)


# ============================================================
# 2. Customer BULK actions
# ============================================================
class TestCustomerBulk:
    def test_10_bulk_block_then_unblock(self):
        s: requests.Session = S["super"]
        targets = S["seed_user_ids"][:3]
        r = s.post(f"{API}/admin/customers/bulk",
                   json={"action": "block", "user_ids": targets})
        assert r.status_code == 200, r.text
        body = r.json()
        assert sorted(body["succeeded"]) == sorted(targets)
        assert body["failed"] == []
        # verify state
        for uid in targets:
            g = s.get(f"{API}/admin/customers/{uid}").json()
            assert g["customer"]["blocked"] is True

        # unblock
        r2 = s.post(f"{API}/admin/customers/bulk",
                    json={"action": "unblock", "user_ids": targets})
        assert r2.status_code == 200
        assert sorted(r2.json()["succeeded"]) == sorted(targets)
        for uid in targets:
            g = s.get(f"{API}/admin/customers/{uid}").json()
            assert g["customer"]["blocked"] is False

    def test_11_bulk_block_emits_audit_entries_with_meta_bulk(self):
        s: requests.Session = S["super"]
        # query audit log for action customer.bulk.block touching our seed ids
        r = s.get(f"{API}/admin/audit",
                  params={"action": "customer.bulk.block", "limit": 50})
        assert r.status_code == 200, r.text
        rows = r.json()["items"]
        # at least 3 audit rows from previous test
        target_set = set(S["seed_user_ids"][:3])
        matched = [a for a in rows if a.get("target_id") in target_set]
        assert len(matched) >= 3
        for a in matched[:3]:
            assert a.get("meta", {}).get("via") == "bulk"
            # diff field present when before/after provided to _audit()
            assert a.get("diff") is not None, f"missing diff: {a}"

    def test_12_set_kyc_verified_and_audit(self):
        s: requests.Session = S["super"]
        targets = S["seed_user_ids"][3:5]
        r = s.post(f"{API}/admin/customers/bulk",
                   json={"action": "set_kyc", "user_ids": targets,
                         "kyc_status": "verified"})
        assert r.status_code == 200, r.text
        assert sorted(r.json()["succeeded"]) == sorted(targets)
        for uid in targets:
            g = s.get(f"{API}/admin/customers/{uid}").json()
            assert g["customer"]["kyc_status"] == "verified"

    def test_13_set_kyc_invalid_status_returns_400(self):
        s: requests.Session = S["super"]
        r = s.post(f"{API}/admin/customers/bulk",
                   json={"action": "set_kyc", "user_ids": [S["seed_user_ids"][0]],
                         "kyc_status": "bogus"})
        assert r.status_code == 400, r.text
        assert "kyc" in r.json().get("detail", "").lower()

    def test_14_bulk_missing_user_lands_in_failed(self):
        s: requests.Session = S["super"]
        bogus = f"user_phaseb_doesnotexist_{uuid.uuid4().hex[:6]}"
        valid = S["seed_user_ids"][6]
        r = s.post(f"{API}/admin/customers/bulk",
                   json={"action": "block", "user_ids": [valid, bogus]})
        assert r.status_code == 200, r.text
        body = r.json()
        assert valid in body["succeeded"]
        assert any(f["user_id"] == bogus for f in body["failed"])
        # unblock cleanup
        s.post(f"{API}/admin/customers/bulk",
               json={"action": "unblock", "user_ids": [valid]})


# ============================================================
# 3. Admin LIST + BULK delete (guardrails)
# ============================================================
class TestAdminListAndBulkDelete:
    def test_20_create_seed_admins(self):
        s: requests.Session = S["super"]
        ids = []
        # 3 managers + 1 extra super
        for i in range(3):
            email = f"test_phaseb_mgr_{i}_{uuid.uuid4().hex[:6]}@example.com"
            r = s.post(f"{API}/admin/admins", json={
                "full_name": f"PhaseB Mgr {i}",
                "email": email,
                "password": "Abcd1234!aaa",
                "access_level": 1,
            })
            assert r.status_code == 201, r.text
            ids.append(r.json()["admin_id"])
        # extra super for bulk-delete guardrail tests
        super_email = f"test_phaseb_super_{uuid.uuid4().hex[:6]}@example.com"
        r = s.post(f"{API}/admin/admins", json={
            "full_name": "PhaseB Super B",
            "email": super_email,
            "password": "Abcd1234!aaa",
            "access_level": 0,
        })
        assert r.status_code == 201, r.text
        S["mgr_admin_ids"] = ids
        S["extra_super_id"] = r.json()["admin_id"]
        S["extra_super_email"] = super_email

    def test_21_list_admins_filters_and_total(self):
        s: requests.Session = S["super"]
        # filter access_level=1
        r = s.get(f"{API}/admin/admins",
                  params={"access_level": "1", "q": "PhaseB Mgr", "limit": 50})
        assert r.status_code == 200, r.text
        body = r.json()
        items = body["items"]
        assert all(a["access_level"] == 1 for a in items)
        ours = [a for a in items if a["admin_id"] in S["mgr_admin_ids"]]
        assert len(ours) == 3
        # global counts unaffected by filter
        counts = body["counts"]
        assert counts["access_0"] >= 2  # main super + extra
        assert counts["access_1"] >= 3
        assert "total" in body and isinstance(body["total"], int)

    def test_22_list_admins_active_filter(self):
        s: requests.Session = S["super"]
        # disable one mgr first
        tid = S["mgr_admin_ids"][0]
        r0 = s.patch(f"{API}/admin/admins/{tid}", json={"active": False})
        assert r0.status_code == 200
        r = s.get(f"{API}/admin/admins",
                  params={"active": "false", "q": "PhaseB Mgr", "limit": 50})
        assert r.status_code == 200
        ours = [a for a in r.json()["items"] if a["admin_id"] in S["mgr_admin_ids"]]
        assert any(a["admin_id"] == tid for a in ours)
        # re-enable for downstream tests
        s.patch(f"{API}/admin/admins/{tid}", json={"active": True})

    def test_23_bulk_delete_self_and_unknown_and_valid(self):
        s: requests.Session = S["super"]
        valid = S["mgr_admin_ids"][2]  # delete the 3rd manager
        unknown = "adm_doesnotexist123"
        payload = {"admin_ids": [S["super_admin_id"], unknown, valid]}
        r = s.post(f"{API}/admin/admins/bulk-delete", json=payload)
        assert r.status_code == 200, r.text
        body = r.json()
        assert valid in body["succeeded"]
        reasons = {f["admin_id"]: f["reason"] for f in body["failed"]}
        assert reasons.get(S["super_admin_id"]) == "Cannot delete your own account"
        assert reasons.get(unknown) == "Not found"
        # verify deletion
        chk = s.get(f"{API}/admin/admins", params={"limit": 500}).json()
        assert not any(a["admin_id"] == valid for a in chk["items"])
        # remove from local tracking
        S["mgr_admin_ids"] = [x for x in S["mgr_admin_ids"] if x != valid]

    def test_24_cannot_delete_last_super_admin_guard(self):
        s: requests.Session = S["super"]
        # Deactivate the extra super so active super count = 1 (only main)
        extra = S["extra_super_id"]
        r0 = s.patch(f"{API}/admin/admins/{extra}", json={"active": False})
        assert r0.status_code == 200
        # Now bulk-delete the (inactive) extra super — guard should fire because
        # active super count is 1 and target is access_level=0.
        r = s.post(f"{API}/admin/admins/bulk-delete",
                   json={"admin_ids": [extra]})
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["succeeded"] == []
        assert body["failed"] and body["failed"][0]["admin_id"] == extra
        assert body["failed"][0]["reason"] == "Cannot delete the last super admin"
        # cleanup: re-activate then single-DELETE
        s.patch(f"{API}/admin/admins/{extra}", json={"active": True})
        # active count now 2 again — safe to delete
        r2 = s.delete(f"{API}/admin/admins/{extra}")
        assert r2.status_code in (200, 204), r2.text

    def test_25_bulk_delete_emits_audit_with_meta_bulk(self):
        s: requests.Session = S["super"]
        r = s.get(f"{API}/admin/audit",
                  params={"action": "admin.delete", "limit": 50})
        assert r.status_code == 200
        rows = r.json()["items"]
        # at least one row with meta.via=bulk in recent runs
        assert any(a.get("meta", {}).get("via") == "bulk" for a in rows)


# ============================================================
# 4. Withdrawals LIST + BULK decide
# ============================================================
class TestWithdrawalsListAndBulk:
    def test_30_list_filters_status_and_q(self):
        s: requests.Session = S["super"]
        r = s.get(f"{API}/admin/withdrawals",
                  params={"status_filter": "pending", "q": "PhaseB summary",
                          "limit": 200})
        assert r.status_code == 200, r.text
        body = r.json()
        for k in ("items", "total", "limit", "offset"):
            assert k in body
        ours = [w for w in body["items"]
                if w["withdrawal_id"].startswith("wd_phaseb_")]
        # 4 pending in seed (indices 0,1,2,3)
        assert len(ours) == 4
        assert all(w["status"] == "pending" for w in ours)

    def test_31_list_sort_amount_desc(self):
        s: requests.Session = S["super"]
        r = s.get(f"{API}/admin/withdrawals",
                  params={"q": "PhaseB summary", "sort": "amount",
                          "order": "desc", "limit": 200})
        assert r.status_code == 200
        items = [w for w in r.json()["items"]
                 if w["withdrawal_id"].startswith("wd_phaseb_")]
        amounts = [float(w["amount"]) for w in items]
        assert amounts == sorted(amounts, reverse=True)

    def test_32_list_date_range_filter(self):
        s: requests.Session = S["super"]
        # only wd 0..2 are in 2024-02-01..2024-02-03
        r = s.get(f"{API}/admin/withdrawals",
                  params={"from_date": "2024-02-01T00:00:00+00:00",
                          "to_date": "2024-02-03T23:59:59+00:00",
                          "q": "PhaseB summary", "limit": 200})
        assert r.status_code == 200
        ours = [w for w in r.json()["items"]
                if w["withdrawal_id"].startswith("wd_phaseb_")]
        assert len(ours) == 3

    def test_33_bulk_approve_mixed_partial_failure(self):
        s: requests.Session = S["super"]
        pending_ids = [w["id"] for w in S["seed_wid"] if w["status"] == "pending"]
        approved_id = next(w["id"] for w in S["seed_wid"] if w["status"] == "approved")
        bogus_id = f"wd_phaseb_bogus_{uuid.uuid4().hex[:6]}"
        # approve first 2 pending + the already-approved + bogus
        targets = pending_ids[:2] + [approved_id, bogus_id]
        r = s.post(f"{API}/admin/withdrawals/bulk-decide",
                   json={"action": "approve", "withdrawal_ids": targets,
                         "note": "phaseb bulk"})
        assert r.status_code == 200, r.text
        body = r.json()
        assert sorted(body["succeeded"]) == sorted(pending_ids[:2])
        reasons = {f["withdrawal_id"]: f["reason"] for f in body["failed"]}
        assert reasons.get(approved_id) == "already approved"
        assert reasons.get(bogus_id) == "not_found"
        # verify status flipped
        chk = s.get(f"{API}/admin/withdrawals",
                    params={"q": "PhaseB summary", "limit": 200}).json()
        by_id = {w["withdrawal_id"]: w for w in chk["items"]}
        for wid in pending_ids[:2]:
            assert by_id[wid]["status"] == "approved"
            assert by_id[wid].get("approved_by_admin_id") == S["super_admin_id"]

    def test_34_bulk_reject_remaining_pending(self):
        s: requests.Session = S["super"]
        # remaining pending from seed
        pending_ids = [w["id"] for w in S["seed_wid"] if w["status"] == "pending"][2:]
        r = s.post(f"{API}/admin/withdrawals/bulk-decide",
                   json={"action": "reject", "withdrawal_ids": pending_ids,
                         "note": "phaseb bulk reject"})
        assert r.status_code == 200, r.text
        body = r.json()
        assert sorted(body["succeeded"]) == sorted(pending_ids)
        chk = s.get(f"{API}/admin/withdrawals",
                    params={"q": "PhaseB summary", "limit": 200}).json()
        by_id = {w["withdrawal_id"]: w for w in chk["items"]}
        for wid in pending_ids:
            assert by_id[wid]["status"] == "rejected"

    def test_35_bulk_audit_meta_via_bulk(self):
        s: requests.Session = S["super"]
        r = s.get(f"{API}/admin/audit",
                  params={"action": "withdrawal.approved", "limit": 50})
        assert r.status_code == 200
        rows = r.json()["items"]
        bulk_rows = [a for a in rows if a.get("meta", {}).get("via") == "bulk"
                     and a.get("target_id", "").startswith("wd_phaseb_")]
        assert len(bulk_rows) >= 2
        r2 = s.get(f"{API}/admin/audit",
                   params={"action": "withdrawal.rejected", "limit": 50})
        assert r2.status_code == 200
        bulk_rej = [a for a in r2.json()["items"]
                    if a.get("meta", {}).get("via") == "bulk"
                    and a.get("target_id", "").startswith("wd_phaseb_")]
        assert len(bulk_rej) >= 2


# ============================================================
# 5. Auth gates: 401 unauth, 403 manager
# ============================================================
class TestAuthGates:
    def test_40_unauth_admins_list_returns_401(self):
        r = requests.get(f"{API}/admin/admins")
        assert r.status_code == 401

    def test_41_unauth_customers_list_returns_401(self):
        r = requests.get(f"{API}/admin/customers")
        assert r.status_code == 401

    def test_42_unauth_bulks_return_401(self):
        for path, payload in [
            ("/admin/customers/bulk",
             {"action": "block", "user_ids": ["x"]}),
            ("/admin/admins/bulk-delete", {"admin_ids": ["x"]}),
            ("/admin/withdrawals/bulk-decide",
             {"action": "approve", "withdrawal_ids": ["x"]}),
        ]:
            r = requests.post(f"{API}{path}", json=payload)
            assert r.status_code == 401, f"{path}: {r.status_code}"

    def test_43_manager_403_on_super_only_endpoints(self):
        # log in as one of our manager admins (will MFA-enrol on first login)
        mgr_id = S["mgr_admin_ids"][0]
        # need the email — fetch it
        s_super: requests.Session = S["super"]
        r = s_super.get(f"{API}/admin/admins",
                        params={"q": "PhaseB Mgr", "limit": 50}).json()
        mgr_doc = next(a for a in r["items"] if a["admin_id"] == mgr_id)
        mgr_email = mgr_doc["email"]
        mgr_sess = _login_with_mfa(mgr_email, "Abcd1234!aaa")
        S["mgr_session"] = mgr_sess
        S["mgr_email"] = mgr_email

        # /admin/admins should 403 for manager
        assert mgr_sess.get(f"{API}/admin/admins").status_code == 403
        # bulk-delete admins
        r1 = mgr_sess.post(f"{API}/admin/admins/bulk-delete",
                           json={"admin_ids": ["adm_x"]})
        assert r1.status_code == 403, r1.text
        # bulk-decide withdrawals
        r2 = mgr_sess.post(f"{API}/admin/withdrawals/bulk-decide",
                           json={"action": "approve", "withdrawal_ids": ["wd_x"]})
        assert r2.status_code == 403, r2.text

    def test_44_manager_customers_scope_assigned(self):
        s_super: requests.Session = S["super"]
        mgr_sess: requests.Session = S["mgr_session"]
        mgr_id = S["mgr_admin_ids"][0]
        # assign one seed customer to mgr
        assigned = S["seed_user_ids"][7]
        r = s_super.post(f"{API}/admin/customers/{assigned}/assign",
                         json={"manager_admin_id": mgr_id})
        assert r.status_code == 200, r.text
        # manager list -> scope=assigned, contains only assigned
        list_r = mgr_sess.get(f"{API}/admin/customers", params={"limit": 500})
        assert list_r.status_code == 200, list_r.text
        body = list_r.json()
        assert body["scope"] == "assigned"
        ids = [u["user_id"] for u in body["items"]]
        assert assigned in ids
        # other seeded customers should not be visible
        unassigned = S["seed_user_ids"][8]
        assert unassigned not in ids
        S["mgr_assigned_uid"] = assigned
        S["mgr_unassigned_uid"] = unassigned

    def test_45_manager_bulk_out_of_scope_lands_in_failed(self):
        mgr_sess: requests.Session = S["mgr_session"]
        assigned = S["mgr_assigned_uid"]
        unassigned = S["mgr_unassigned_uid"]
        r = mgr_sess.post(f"{API}/admin/customers/bulk",
                         json={"action": "block",
                               "user_ids": [assigned, unassigned]})
        assert r.status_code == 200, r.text
        body = r.json()
        assert assigned in body["succeeded"]
        fail = next((f for f in body["failed"]
                     if f["user_id"] == unassigned), None)
        assert fail is not None
        assert "assign" in fail["reason"].lower() or "scope" in fail["reason"].lower()
        # unblock cleanup
        mgr_sess.post(f"{API}/admin/customers/bulk",
                      json={"action": "unblock", "user_ids": [assigned]})

    def test_46_super_admin_manager_filter(self):
        s_super: requests.Session = S["super"]
        mgr_id = S["mgr_admin_ids"][0]
        r = s_super.get(f"{API}/admin/customers",
                        params={"manager_admin_id": mgr_id, "limit": 500})
        assert r.status_code == 200
        ids = [u["user_id"] for u in r.json()["items"]]
        assert S["mgr_assigned_uid"] in ids
        # other seed customers (not assigned to this mgr) must NOT be in result
        for uid in S["seed_user_ids"]:
            if uid != S["mgr_assigned_uid"]:
                assert uid not in ids


# ============================================================
# 6. Backwards-compat single endpoints
# ============================================================
class TestSingleEndpointsBC:
    def test_50_single_patch_customer_still_works_and_emits_diff(self):
        s: requests.Session = S["super"]
        uid = S["seed_user_ids"][9]
        r = s.patch(f"{API}/admin/customers/{uid}",
                    json={"kyc_status": "verified", "notes": "phaseb-bc"})
        assert r.status_code == 200, r.text
        # audit should carry before/after diff
        a = s.get(f"{API}/admin/audit",
                  params={"action": "customer.update", "limit": 20}).json()
        rows = [x for x in a["items"] if x.get("target_id") == uid]
        assert rows, "no audit row for single PATCH"
        row = rows[0]
        # diff should be present (single PATCH passes before+after to _audit)
        assert row.get("diff") is not None, \
            f"diff missing on single patch audit: {row}"

    def test_51_single_admin_delete_still_works(self):
        s: requests.Session = S["super"]
        # create a throwaway manager
        email = f"test_phaseb_single_{uuid.uuid4().hex[:6]}@example.com"
        cr = s.post(f"{API}/admin/admins", json={
            "full_name": "PhaseB Single Del",
            "email": email,
            "password": "Abcd1234!aaa",
            "access_level": 1,
        })
        assert cr.status_code == 201
        tid = cr.json()["admin_id"]
        dr = s.delete(f"{API}/admin/admins/{tid}")
        assert dr.status_code in (200, 204), dr.text
        # gone
        lr = s.get(f"{API}/admin/admins", params={"limit": 500})
        assert not any(a["admin_id"] == tid for a in lr.json()["items"])

    def test_52_single_withdrawal_decide_still_works(self):
        s: requests.Session = S["super"]
        # seed one fresh pending withdrawal
        wid = f"wd_phaseb_single_{uuid.uuid4().hex[:6]}"
        uid = S["seed_user_ids"][10]
        cmd = (
            f'db = db.getSiblingDB("test_database");'
            f'db.withdrawals.insertOne({{withdrawal_id:"{wid}",'
            f'customer_user_id:"{uid}",amount:777,currency:"USD",'
            f'status:"pending",destination_type:"bank",'
            f'bank_beneficiary:"single",destination_summary:"PhaseB single",'
            f'requested_by_admin_id:null,'
            f'created_at:"2024-03-01T10:00:00+00:00",'
            f'updated_at:"2024-03-01T10:00:00+00:00"}});'
        )
        subprocess.run(["mongosh", "--quiet", "--eval", cmd],
                       check=True, capture_output=True)
        r = s.post(f"{API}/admin/withdrawals/{wid}/decide",
                   json={"approve": True, "note": "phaseb single"})
        assert r.status_code == 200, r.text
        # confirm status
        lr = s.get(f"{API}/admin/withdrawals",
                   params={"q": "PhaseB single", "limit": 50}).json()
        by_id = {w["withdrawal_id"]: w for w in lr["items"]}
        assert by_id[wid]["status"] == "approved"


# ============================================================
# 7. Audit instrumentation on bulk endpoints (ip / UA / diff)
# ============================================================
class TestBulkAuditFields:
    def test_60_bulk_audit_rows_have_ip_and_user_agent(self):
        s: requests.Session = S["super"]
        r = s.get(f"{API}/admin/audit",
                  params={"action": "customer.bulk.block", "limit": 5})
        assert r.status_code == 200
        rows = r.json()["items"]
        assert rows, "no bulk audit rows"
        sample = rows[0]
        assert "ip" in sample
        assert "user_agent" in sample
        # diff populated for customer bulks (before/after passed to _audit)
        assert sample.get("diff") is not None, f"missing diff: {sample}"


# ============================================================
# 8. Phase A regression (smoke)
# ============================================================
class TestPhaseARegression:
    def test_70_admin_me_mfa_still_enabled(self):
        s: requests.Session = S["super"]
        r = s.get(f"{API}/admin/auth/me")
        assert r.status_code == 200
        assert r.json().get("mfa_enabled") is True

    def test_71_audit_filters_still_work(self):
        s: requests.Session = S["super"]
        r = s.get(f"{API}/admin/audit",
                  params={"action": "admin.login", "limit": 5})
        assert r.status_code == 200
        body = r.json()
        for k in ("items", "total", "limit", "offset"):
            assert k in body
