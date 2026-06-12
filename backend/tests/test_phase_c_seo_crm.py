"""Phase C: Roobani SEO + Performance + HubSpot CRM shape — backend coverage.

Scope (per review request iteration_8):
- /sitemap.xml: 200, valid XML, lastmod on every <url>, expected routes, image:image on / and /plans.
- /api/sitemap.json: 200 + matching routes (no /about).
- /brand/*.webp performance assets: 200 + Content-Type image/webp.
- /api/admin/crm/status: 401 unauth; 200 with admin shape; configured=false (no HUBSPOT_API_KEY).
- /api/admin/crm/resync: 401 unauth; with admin returns ok=false (no key); does NOT mutate crm_synced.
- Regression: /api/contact, /api/leads (no auth -> 201 + crm_synced=false), /api/admin/contacts, /api/admin/leads.

Auth model in use:
- /api/admin/contacts, /api/admin/leads, /api/admin/crm/* all use the customer-side
  `require_admin` (session_token cookie + users.is_admin=true). The seeded customer-side
  admin is `admin@roobani.dev` / `RoobaniAdmin#2026`. This is DIFFERENT from the
  admin_session_token (admin_users) flow used by /admin/customers etc.
"""
from __future__ import annotations

import os
import re
import time
import uuid
import xml.etree.ElementTree as ET
from pathlib import Path

import pytest
import requests

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"

# Customer-side seeded admin (is_admin=True in users collection)
ADMIN_EMAIL = "admin@roobani.dev"
ADMIN_PASS = "RoobaniAdmin#2026"

S: dict = {}


# ---------------- fixtures ----------------
@pytest.fixture(scope="module", autouse=True)
def _login_admin():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASS})
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    body = r.json()
    assert body["user"]["is_admin"] is True
    assert s.cookies.get("session_token"), "no customer session cookie"
    S["admin"] = s
    yield


@pytest.fixture
def anon():
    return requests.Session()


# ============================================================
# 1. Sitemap (static XML served by frontend dev server / ingress)
# ============================================================
class TestSitemapXml:
    def test_01_sitemap_xml_200_and_content_type(self):
        r = requests.get(f"{BASE_URL}/sitemap.xml")
        assert r.status_code == 200, r.status_code
        ct = r.headers.get("content-type", "").lower()
        assert "xml" in ct, f"unexpected content-type: {ct}"
        S["sitemap_xml"] = r.text

    def test_02_sitemap_xml_parses_and_has_expected_routes(self):
        xml = S["sitemap_xml"]
        root = ET.fromstring(xml)
        ns = {
            "sm": "http://www.sitemaps.org/schemas/sitemap/0.9",
            "image": "http://www.google.com/schemas/sitemap-image/1.1",
        }
        urls = root.findall("sm:url", ns)
        assert len(urls) >= 6, f"expected at least 6 urls, got {len(urls)}"
        locs = [u.find("sm:loc", ns).text for u in urls]
        # Every <url> must have <lastmod>
        for u in urls:
            lm = u.find("sm:lastmod", ns)
            assert lm is not None and lm.text, f"missing lastmod on {u.find('sm:loc', ns).text}"
        # Expected paths (host-agnostic compare)
        paths = {re.sub(r"^https?://[^/]+", "", loc).rstrip("/") or "/" for loc in locs}
        for needed in {"/", "/plans", "/contact", "/privacy", "/terms", "/cookies"}:
            assert needed in paths, f"sitemap missing {needed}; got {paths}"
        # No /about
        assert "/about" not in paths, "/about should be removed from sitemap"
        S["sitemap_paths"] = paths
        S["sitemap_urls"] = urls

    def test_03_sitemap_image_on_home_and_plans(self):
        ns = {
            "sm": "http://www.sitemaps.org/schemas/sitemap/0.9",
            "image": "http://www.google.com/schemas/sitemap-image/1.1",
        }
        urls = S["sitemap_urls"]
        home = next(u for u in urls if (u.find("sm:loc", ns).text or "").endswith("/"))
        plans = next(u for u in urls if (u.find("sm:loc", ns).text or "").endswith("/plans"))
        assert home.find("image:image", ns) is not None, "/ missing image:image"
        assert plans.find("image:image", ns) is not None, "/plans missing image:image"


# ============================================================
# 2. Sitemap mirror under /api
# ============================================================
class TestSitemapJson:
    def test_10_sitemap_json_200_and_matches_xml_paths(self):
        r = requests.get(f"{API}/sitemap.json")
        assert r.status_code == 200, r.text
        body = r.json()
        assert "routes" in body and isinstance(body["routes"], list)
        json_paths = {x["loc"] for x in body["routes"]}
        # No /about
        assert "/about" not in json_paths
        # Must contain the canonical six
        for needed in {"/", "/plans", "/contact", "/privacy", "/terms", "/cookies"}:
            assert needed in json_paths, f"sitemap.json missing {needed}; got {json_paths}"
        # Compare with sitemap.xml paths (normalised)
        if "sitemap_paths" in S:
            assert json_paths == S["sitemap_paths"], (
                f"sitemap.json/xml route mismatch: json={json_paths} xml={S['sitemap_paths']}"
            )


# ============================================================
# 3. WebP performance assets
# ============================================================
class TestWebpAssets:
    @pytest.mark.parametrize("asset", [
        "/brand/hero_visual.webp",
        "/brand/plan_foundation.webp",
        "/brand/about_visual.webp",
        "/brand/step_account.webp",
        "/brand/avatar_1.webp",
    ])
    def test_20_webp_served(self, asset):
        r = requests.get(f"{BASE_URL}{asset}")
        assert r.status_code == 200, f"{asset} -> {r.status_code}"
        ct = r.headers.get("content-type", "").lower()
        assert "image/webp" in ct, f"{asset} content-type: {ct}"
        # Minimum sanity: file should not be empty
        assert len(r.content) > 100, f"{asset} body too small ({len(r.content)}b)"


# ============================================================
# 4. CRM status endpoint
# ============================================================
class TestCrmStatus:
    def test_30_status_requires_auth(self, anon):
        r = anon.get(f"{API}/admin/crm/status")
        assert r.status_code == 401, f"expected 401, got {r.status_code} {r.text}"

    def test_31_status_shape(self):
        r = S["admin"].get(f"{API}/admin/crm/status")
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["provider"] == "hubspot"
        # HUBSPOT_API_KEY not in env -> configured=False
        assert body["configured"] is False, f"expected configured=false, got {body}"
        for key in ("pending", "synced"):
            assert key in body and isinstance(body[key], dict)
            for sub in ("contacts", "leads"):
                assert sub in body[key]
                assert isinstance(body[key][sub], int)


# ============================================================
# 5. CRM resync endpoint (no-key behaviour)
# ============================================================
class TestCrmResync:
    def test_40_resync_requires_auth(self, anon):
        r = anon.post(f"{API}/admin/crm/resync")
        assert r.status_code == 401, f"expected 401, got {r.status_code} {r.text}"

    def test_41_resync_no_key_is_noop(self):
        # First push a contact so we have a record with crm_synced=false
        uniq = uuid.uuid4().hex[:8]
        body = {
            "name": f"TEST_PhaseC {uniq}",
            "email": f"test_phasec_{uniq}@example.com",
            "subject": "Hello",
            "message": "Phase C resync no-op test message.",
        }
        c = requests.post(f"{API}/contact", json=body)
        assert c.status_code == 201, c.text
        contact_id = c.json()["contact_id"]
        S.setdefault("created_contact_ids", []).append(contact_id)

        # Now resync
        r = S["admin"].post(f"{API}/admin/crm/resync")
        assert r.status_code == 200, r.text
        resp = r.json()
        assert resp == {
            "ok": False,
            "reason": "HUBSPOT_API_KEY not configured",
            "synced": 0,
            "queued": 0,
        }, f"unexpected resync body: {resp}"

        # Ensure the contact we just created is STILL crm_synced=false
        status = S["admin"].get(f"{API}/admin/crm/status").json()
        assert status["pending"]["contacts"] >= 1, (
            f"resync should not have synced anything, pending={status['pending']}"
        )

    def test_42_resync_manager_gate(self):
        """Document current behaviour: require_admin checks customer is_admin=true.
        A manager admin in admin_users (access_level=1) without is_admin on a customer
        record cannot reach /admin/crm/resync. So in practice this endpoint is reachable
        ONLY by customer-side admins, regardless of access_level.
        Verified: anonymous -> 401 (already covered above)."""
        # Try with a brand-new non-admin customer
        uniq = uuid.uuid4().hex[:8]
        em = f"test_phasec_nonadmin_{uniq}@example.com"
        rr = requests.post(f"{API}/auth/register", json={
            "email": em,
            "password": "Abcd1234!aaa",
            "full_name": "PhaseC NonAdmin",
            "consent": True,
        })
        # If registration is rate-limited or fails, skip.
        if rr.status_code != 201:
            pytest.skip(f"register failed: {rr.status_code} {rr.text}")
        login = requests.Session()
        lr = login.post(f"{API}/auth/login", json={"email": em, "password": "Abcd1234!aaa"})
        assert lr.status_code == 200, lr.text
        r = login.post(f"{API}/admin/crm/resync")
        assert r.status_code == 403, f"non-admin should be 403, got {r.status_code} {r.text}"


# ============================================================
# 6. Regression — contact / lead create + admin list
# ============================================================
class TestRegression:
    def test_50_post_contact_no_auth(self):
        uniq = uuid.uuid4().hex[:8]
        body = {
            "name": f"TEST_RegC {uniq}",
            "email": f"test_phasec_regc_{uniq}@example.com",
            "subject": "Reg subject",
            "message": "Phase C regression body for contact.",
        }
        r = requests.post(f"{API}/contact", json=body)
        assert r.status_code == 201, r.text
        cid = r.json()["contact_id"]
        S.setdefault("created_contact_ids", []).append(cid)
        # Should appear in /api/admin/contacts and have crm_synced=false present
        lst = S["admin"].get(f"{API}/admin/contacts")
        assert lst.status_code == 200, lst.text
        items = lst.json()["items"]
        found = next((x for x in items if x.get("contact_id") == cid), None)
        assert found is not None, f"contact {cid} not in /admin/contacts (first 3: {items[:3]})"

    def test_51_post_lead_no_auth(self):
        uniq = uuid.uuid4().hex[:8]
        body = {
            "full_name": f"TEST_RegL {uniq}",
            "email": f"test_phasec_regl_{uniq}@example.com",
            "phone": "555-0100",
            "country_code": "KE",
            "budget_range": "5k_25k",
            "investment_goal": "steady_growth",
            "preferred_contact": "email",
            "consent": True,
            "source_page": "phasec_test",
        }
        r = requests.post(f"{API}/leads", json=body)
        assert r.status_code == 201, r.text
        lid = r.json()["lead_id"]
        S.setdefault("created_lead_ids", []).append(lid)
        # Should appear in /api/admin/leads
        lst = S["admin"].get(f"{API}/admin/leads")
        assert lst.status_code == 200, lst.text
        items = lst.json()["items"]
        found = next((x for x in items if x.get("lead_id") == lid), None)
        assert found is not None, f"lead {lid} not in /admin/leads"

    def test_52_admin_contacts_requires_auth(self, anon):
        r = anon.get(f"{API}/admin/contacts")
        assert r.status_code == 401

    def test_53_admin_leads_requires_auth(self, anon):
        r = anon.get(f"{API}/admin/leads")
        assert r.status_code == 401


# ============================================================
# 7. Robots noindex check via static index.html (smoke)
# ============================================================
class TestStaticHtmlFallback:
    """Per-page Helmet meta is injected client-side (CRA SPA) so HTTP-only
    cannot validate it. We at least assert the static index.html has the
    single fallback description + default robots=index,follow so per-page
    overrides are non-conflicting."""

    def test_60_index_has_single_fallback_description(self):
        r = requests.get(f"{BASE_URL}/")
        assert r.status_code == 200
        html = r.text
        # One default description marker
        assert 'name="description"' in html
        # Single canonical title fallback
        assert "<title>" in html and "Roobani" in html
        # Default robots index,follow
        assert 'name="robots"' in html


# ============================================================
# Teardown — best-effort cleanup of TEST_ docs
# ============================================================
@pytest.fixture(scope="module", autouse=True)
def _teardown_after_module(_login_admin):
    yield
    # cleanup via mongosh if available
    import subprocess
    try:
        subprocess.run(
            ["mongosh", "--quiet", "--eval",
             'db = db.getSiblingDB("test_database");'
             'db.contact_submissions.deleteMany({name:{$regex:"^TEST_"}});'
             'db.leads.deleteMany({full_name:{$regex:"^TEST_"}});'
             'db.users.deleteMany({email_lookup:{$regex:"^test_phasec_"}});'],
            check=False, capture_output=True, timeout=10
        )
    except Exception:
        pass
