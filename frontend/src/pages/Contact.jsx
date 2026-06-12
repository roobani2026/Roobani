import React, { useMemo, useState } from "react";
import { api } from "../lib/api";
import { Check } from "lucide-react";
import { COUNTRIES, DEFAULT_COUNTRY_ISO, findCountryByIso } from "../data/countries";
import { useCurrency } from "../lib/currency";
import SEO from "../components/SEO";

export default function Contact() {
  const { formatMoney } = useCurrency();
  const defaultCountry = useMemo(
    () => findCountryByIso(DEFAULT_COUNTRY_ISO) || COUNTRIES[0],
    []
  );
  const [form, setForm] = useState({
    name: "",
    email: "",
    subject: "",
    message: "",
    country_iso: defaultCountry?.iso || "KE",
    phone: "",
  });
  const [state, setState] = useState({ loading: false, success: false, error: "" });

  const upd = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const selectedCountry =
    findCountryByIso(form.country_iso) || defaultCountry;

  const submit = async (e) => {
    e.preventDefault();
    setState({ loading: true, success: false, error: "" });
    try {
      const payload = {
        name: form.name,
        email: form.email,
        subject: form.subject,
        message: form.message,
        country_code: selectedCountry?.code || null,
        phone: form.phone.trim() || null,
      };
      await api.post("/contact", payload);
      setState({ loading: false, success: true, error: "" });
      setForm({
        name: "",
        email: "",
        subject: "",
        message: "",
        country_iso: defaultCountry?.iso || "KE",
        phone: "",
      });
    } catch (err) {
      const msg = err.response?.data?.detail || "Could not submit.";
      setState({ loading: false, success: false, error: typeof msg === "string" ? msg : "Submission failed." });
    }
  };

  return (
    <div data-testid="contact-page">
      <SEO
        title="Speak to a strategist"
        description="Talk to a senior Roobani strategist about your portfolio. Nairobi-based wealth management, response within one business day."
        image="/brand/about_visual.webp"
        keywords={["wealth advisor Kenya", "investment consultation Nairobi", "private banker contact"]}
        structuredData={{
          "@context": "https://schema.org",
          "@type": "ContactPage",
          "name": "Contact Roobani",
          "url": "https://roobani.com/contact",
          "mainEntity": {
            "@type": "Organization",
            "name": "Roobani",
            "email": "hello@roobani.com",
            "telephone": "+254 712 345 678",
            "address": {"@type": "PostalAddress", "addressLocality": "Nairobi", "addressCountry": "KE"},
          },
        }}
      />
      <section className="pt-40 pb-12 md:pt-48 md:pb-16 relative overflow-hidden">
        <div className="rb-grain absolute inset-0" />
        <div className="relative max-w-[1400px] mx-auto px-6 md:px-12 grid grid-cols-1 lg:grid-cols-12 gap-10 items-end">
          <div className="lg:col-span-8">
            <h1 className="rb-display text-5xl md:text-7xl lg:text-8xl text-rb-navy leading-[0.95]">
              Built for the long arc of <em className="not-italic text-rb-gold">capital</em>.
            </h1>
          </div>
          <div className="lg:col-span-4">
            <p className="text-rb-text2">
              Roobani is a private investment platform founded in 2018 by a small team of multi asset
              strategists. Our mission: replace marketing theatre with audited process.
            </p>
          </div>
        </div>
      </section>

      <section className="py-16 md:py-24">
        <div className="max-w-[1400px] mx-auto px-6 md:px-12 grid grid-cols-1 lg:grid-cols-12 gap-10">
          <div className="lg:col-span-5">
            <div className="aspect-[4/5] w-full overflow-hidden border border-rb-border">
              <picture>
                <source srcSet="/brand/about_visual.webp" type="image/webp" />
                <img
                  src="/brand/about_visual.png"
                  alt="Roobani strategists at work in the Nairobi office — multi-screen trading floor with live market data."
                  className="w-full h-full object-cover"
                  loading="lazy"
                  width="800"
                  height="1000"
                />
              </picture>
            </div>
            <div className="grid grid-cols-2 gap-px bg-rb-border mt-8">
              {[
                ["18,400", "Active Investors"],
                [formatMoney(72_000_000, { compact: true }), "Assets Under Guidance"],
                ["12.8%", "Avg Annual Return"],
                ["38", "Senior Strategists"],
              ].map(([v, l]) => (
                <div key={l} className="bg-white p-5">
                  <div className="rb-mono text-2xl text-rb-navy">{v}</div>
                  <div className="rb-label mt-1">{l}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="lg:col-span-7">
            <h2 className="rb-display text-4xl md:text-5xl text-rb-navy mb-8">Speak to our team.</h2>

            {state.success ? (
              <div className="rb-glass border border-rb-border p-10 text-center" data-testid="contact-success">
                <div className="inline-flex items-center justify-center w-14 h-14 border border-rb-navy mb-6">
                  <Check size={24} className="text-rb-navy" strokeWidth={1.4} />
                </div>
                <div className="rb-display text-3xl text-rb-navy mb-3">Message received.</div>
                <p className="text-rb-text2">We respond within one business day.</p>
              </div>
            ) : (
              <form onSubmit={submit} className="bg-white border border-rb-border p-8 md:p-10 space-y-8" data-testid="contact-form">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div>
                    <label className="rb-label">Name</label>
                    <input required className="rb-input" value={form.name} onChange={(e) => upd("name", e.target.value)} data-testid="contact-name" />
                  </div>
                  <div>
                    <label className="rb-label">Email</label>
                    <input required type="email" className="rb-input" value={form.email} onChange={(e) => upd("email", e.target.value)} data-testid="contact-email" />
                  </div>
                </div>

                <div>
                  <label className="rb-label">Phone Number</label>
                  <div className="grid grid-cols-[180px_1fr] gap-4">
                    <select
                      data-testid="contact-country-code"
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
                      data-testid="contact-phone"
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

                <div>
                  <label className="rb-label">Subject</label>
                  <input required className="rb-input" value={form.subject} onChange={(e) => upd("subject", e.target.value)} data-testid="contact-subject" />
                </div>
                <div>
                  <label className="rb-label">Message</label>
                  <textarea required rows={5} className="rb-input resize-none" value={form.message} onChange={(e) => upd("message", e.target.value)} data-testid="contact-message" />
                </div>
                {state.error && <div className="text-sm text-rb-alert border border-rb-alert/40 bg-rb-alert/5 px-4 py-3">{state.error}</div>}
                <button type="submit" disabled={state.loading} className="rb-btn rb-btn-primary" data-testid="contact-submit">
                  <span>{state.loading ? "Sending ..." : "Send Message"}</span>
                </button>
              </form>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-12">
              <div>
                <div className="rb-label">Email</div>
                <div className="rb-mono text-sm text-rb-navy mt-1">hello@roobani.com</div>
              </div>
              <div>
                <div className="rb-label">Phone</div>
                <div className="rb-mono text-sm text-rb-navy mt-1">+254 712 345 678</div>
              </div>
              <div>
                <div className="rb-label">Office</div>
                <div className="rb-mono text-sm text-rb-navy mt-1">Nairobi, Kenya</div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
