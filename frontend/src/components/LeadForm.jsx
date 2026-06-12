import React, { useMemo, useState } from "react";
import { api } from "../lib/api";
import { BUDGET_OPTIONS, GOAL_OPTIONS } from "../data/plans";
import { COUNTRIES, DEFAULT_COUNTRY_ISO, findCountryByIso } from "../data/countries";
import { Check } from "lucide-react";

export default function LeadForm({ sourcePage = "home" }) {
  const defaultCountry = useMemo(
    () => findCountryByIso(DEFAULT_COUNTRY_ISO) || COUNTRIES[0],
    []
  );
  const [form, setForm] = useState({
    full_name: "",
    email: "",
    country_iso: defaultCountry?.iso || "KE",
    phone: "",
    budget_range: "",
    investment_goal: "",
    preferred_contact: "email",
    consent: false,
  });
  const [state, setState] = useState({ loading: false, success: false, error: "" });

  const upd = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const selectedCountry = findCountryByIso(form.country_iso) || defaultCountry;

  const submit = async (e) => {
    e.preventDefault();
    setState({ loading: true, success: false, error: "" });
    try {
      const payload = {
        full_name: form.full_name,
        email: form.email,
        country_code: selectedCountry?.code || "+254",
        phone: form.phone,
        budget_range: form.budget_range,
        investment_goal: form.investment_goal,
        preferred_contact: form.preferred_contact,
        consent: form.consent,
        source_page: sourcePage,
      };
      await api.post("/leads", payload);
      setState({ loading: false, success: true, error: "" });
      setForm({
        full_name: "",
        email: "",
        country_iso: defaultCountry?.iso || "KE",
        phone: "",
        budget_range: "",
        investment_goal: "",
        preferred_contact: "email",
        consent: false,
      });
    } catch (err) {
      const msg = err.response?.data?.detail || "Could not submit. Please try again.";
      setState({ loading: false, success: false, error: typeof msg === "string" ? msg : "Please check the form and retry." });
    }
  };

  if (state.success) {
    return (
      <div className="rb-glass border border-rb-border p-10 md:p-14 text-center" data-testid="lead-form-success">
        <div className="inline-flex items-center justify-center w-14 h-14 border border-rb-navy mb-6">
          <Check size={24} className="text-rb-navy" strokeWidth={1.4} />
        </div>
        <div className="rb-display text-3xl md:text-4xl text-rb-navy mb-3">Thank you.</div>
        <p className="text-rb-text2 max-w-md mx-auto">
          A senior advisor will be in touch within one business day with a tailored plan recommendation.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="rb-glass border border-rb-border p-8 md:p-12 space-y-8" data-testid="lead-form">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div>
          <label className="rb-label" htmlFor="lf-name">Full Name</label>
          <input id="lf-name" data-testid="lead-name" required className="rb-input"
            value={form.full_name} onChange={(e) => upd("full_name", e.target.value)} placeholder="Your name" />
        </div>
        <div>
          <label className="rb-label" htmlFor="lf-email">Email Address</label>
          <input id="lf-email" data-testid="lead-email" required type="email" className="rb-input"
            value={form.email} onChange={(e) => upd("email", e.target.value)} placeholder="you@example.com" />
        </div>
      </div>

      <div>
        <label className="rb-label">Phone Number</label>
        <div className="grid grid-cols-[180px_1fr] gap-4">
          <select
            data-testid="lead-country-code"
            aria-label="Country dialing code"
            className="rb-input rb-mono text-sm"
            value={form.country_iso}
            onChange={(e) => upd("country_iso", e.target.value)}
          >
            {COUNTRIES.map((c) => (
              <option key={c.iso} value={c.iso}>
                {c.flag} {c.name} ({c.code})
              </option>
            ))}
          </select>
          <input
            data-testid="lead-phone"
            required
            className="rb-input"
            value={form.phone}
            inputMode="tel"
            onChange={(e) => upd("phone", e.target.value.replace(/[^0-9 ()-]/g, ""))}
            placeholder="712 345 678"
          />
        </div>
        <p className="rb-mono text-[10px] uppercase tracking-[0.18em] text-rb-text2 mt-2">
          Selected :: {selectedCountry?.code} {selectedCountry?.name}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div>
          <label className="rb-label" htmlFor="lf-budget">Investment Budget</label>
          <select id="lf-budget" data-testid="lead-budget" required className="rb-input"
            value={form.budget_range} onChange={(e) => upd("budget_range", e.target.value)}>
            <option value="">Select a range</option>
            {BUDGET_OPTIONS.map((b) => <option key={b.value} value={b.value}>{b.label}</option>)}
          </select>
        </div>
        <div>
          <label className="rb-label" htmlFor="lf-goal">Investment Goal</label>
          <select id="lf-goal" data-testid="lead-goal" required className="rb-input"
            value={form.investment_goal} onChange={(e) => upd("investment_goal", e.target.value)}>
            <option value="">Select a goal</option>
            {GOAL_OPTIONS.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
          </select>
        </div>
      </div>

      <div>
        <div className="rb-label">Preferred Contact</div>
        <div className="flex flex-wrap gap-6 pt-1">
          {[
            { v: "email", l: "Email" },
            { v: "phone", l: "Phone" },
            { v: "whatsapp", l: "WhatsApp" },
          ].map((opt) => (
            <label key={opt.v} className="inline-flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="contact"
                value={opt.v}
                checked={form.preferred_contact === opt.v}
                onChange={() => upd("preferred_contact", opt.v)}
                data-testid={`lead-contact-${opt.v}`}
                className="accent-rb-navy"
              />
              <span className="text-sm">{opt.l}</span>
            </label>
          ))}
        </div>
      </div>

      <label className="flex items-start gap-3 cursor-pointer">
        <input type="checkbox" checked={form.consent} onChange={(e) => upd("consent", e.target.checked)}
          required data-testid="lead-consent" className="mt-1 accent-rb-navy" />
        <span className="text-sm text-rb-text2">
          I agree to receive communications from Roobani regarding my investment inquiry.
        </span>
      </label>

      {state.error && (
        <div className="text-sm text-rb-alert border border-rb-alert/40 bg-rb-alert/5 px-4 py-3" data-testid="lead-error">{state.error}</div>
      )}

      <button type="submit" disabled={state.loading} className="rb-btn rb-btn-primary w-full md:w-auto" data-testid="lead-submit">
        <span>{state.loading ? "Submitting ..." : "Request My Plan"}</span>
      </button>
    </form>
  );
}
