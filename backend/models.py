"""Pydantic request/response models for the Roobani API."""
from __future__ import annotations

import re
from typing import Literal

from pydantic import BaseModel, EmailStr, Field, field_validator


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------
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


# ---------------------------------------------------------------------------
# Public / lead capture
# ---------------------------------------------------------------------------
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


# ---------------------------------------------------------------------------
# Checkout / holdings
# ---------------------------------------------------------------------------
class HoldingIn(BaseModel):
    plan_slug: Literal["foundation", "growth", "accelerator", "elite"]
    amount: float = Field(gt=0)


class CheckoutFundIn(BaseModel):
    plan_slug: Literal["foundation", "growth", "accelerator", "elite"]
    amount: float = Field(gt=0)
    origin_url: str
    payment_method: Literal["card", "crypto", "card_and_crypto", "all_methods"] = "card_and_crypto"
    currency: str = Field(default="usd", min_length=3, max_length=3)


# ---------------------------------------------------------------------------
# Customer dashboard
# ---------------------------------------------------------------------------
class CustomerWithdrawalIn(BaseModel):
    amount: float = Field(gt=0)
    currency: str = Field(default="usd", min_length=3, max_length=8)
    destination_type: Literal["bank", "crypto"]
    # Bank
    bank_account_name: str | None = None
    bank_name: str | None = None
    bank_account_number: str | None = None
    bank_swift_iban: str | None = None
    bank_country: str | None = None
    # Crypto
    crypto_asset: str | None = None
    crypto_network: str | None = None
    crypto_wallet_address: str | None = None
    note: str | None = Field(default=None, max_length=400)


class ProfileUpdateIn(BaseModel):
    full_name: str | None = Field(default=None, min_length=2, max_length=120)
    phone: str | None = Field(default=None, max_length=40)
    country: str | None = Field(default=None, max_length=80)
    address: str | None = Field(default=None, max_length=300)


# ---------------------------------------------------------------------------
# Admin panel
# ---------------------------------------------------------------------------
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
