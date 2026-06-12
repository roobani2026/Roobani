"""Tests for new endpoints: /api/fx/rates and updated /api/contact (with country_code, phone)."""
import os
import time
import pytest
import requests

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")


@pytest.fixture(scope="module")
def s():
    return requests.Session()


# /api/fx/rates
class TestFxRates:
    def test_fx_rates_shape(self, s):
        r = s.get(f"{BASE_URL}/api/fx/rates", timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("base") == "USD"
        assert isinstance(data.get("source"), str)
        assert isinstance(data.get("updated_at"), str)
        assert data.get("supported") == ["USD", "EUR", "GBP", "KES"]
        rates = data.get("rates") or {}
        for code in ["USD", "EUR", "GBP", "KES"]:
            assert code in rates, f"missing {code}"
            v = rates[code]
            assert isinstance(v, (int, float)) and v > 0, f"{code}={v}"
        # sanity: USD == 1
        assert abs(rates["USD"] - 1.0) < 1e-6

    def test_fx_rates_cached_30s(self, s):
        r1 = s.get(f"{BASE_URL}/api/fx/rates", timeout=15)
        time.sleep(0.5)
        r2 = s.get(f"{BASE_URL}/api/fx/rates", timeout=15)
        assert r1.status_code == 200 and r2.status_code == 200
        assert r1.json()["updated_at"] == r2.json()["updated_at"], "fx rates not cached"


# /api/contact with optional country_code and phone
class TestContact:
    def test_contact_full_payload(self, s):
        payload = {
            "name": "TEST_Contact User",
            "email": "test_contact_full@example.com",
            "subject": "Test subject",
            "message": "Hello from pytest, full payload with phone.",
            "country_code": "+254",
            "phone": "712345678",
        }
        r = s.post(f"{BASE_URL}/api/contact", json=payload, timeout=15)
        assert r.status_code == 201, r.text
        data = r.json()
        assert "contact_id" in data and isinstance(data["contact_id"], str)
        assert "received_at" in data and isinstance(data["received_at"], str)

    def test_contact_without_phone(self, s):
        # backward compatibility - omit country_code & phone
        payload = {
            "name": "TEST_NoPhone",
            "email": "test_contact_nophone@example.com",
            "subject": "No phone subject",
            "message": "Backward compat test message.",
        }
        r = s.post(f"{BASE_URL}/api/contact", json=payload, timeout=15)
        assert r.status_code == 201, r.text
        data = r.json()
        assert "contact_id" in data
        assert "received_at" in data

    def test_contact_invalid_email_422(self, s):
        payload = {
            "name": "TEST_BadEmail",
            "email": "not-an-email",
            "subject": "Bad email",
            "message": "Should be rejected.",
        }
        r = s.post(f"{BASE_URL}/api/contact", json=payload, timeout=15)
        assert r.status_code == 422, r.text
