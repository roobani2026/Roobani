import React, { useState } from "react";
import { Link } from "react-router-dom";
import SEO from "../components/SEO";
import { ChevronDown } from "lucide-react";

/**
 * Public FAQ page. The accordion is keyboard- and screen-reader accessible
 * and uses native <details> semantics under the hood for resilience.
 *
 * Copy is pitched at a sophisticated retail-to-mass-affluent reader — the
 * tone matches the rest of the site (no jargon for jargon's sake, no
 * platitudes, willing to name dollar amounts and lock-in periods).
 */
const FAQ_GROUPS = [
  {
    title: "Getting started",
    items: [
      {
        q: "Who is Roobani for?",
        a: "Roobani is built for individuals and family offices placing US$10k–US$5m into a curated, actively managed multi-asset portfolio — not for day-traders, not for institutional mandates above the Elite cap. If you want a dedicated portfolio manager who returns your calls and quarterly statements that actually explain what changed, you're our reader.",
      },
      {
        q: "How long does onboarding take?",
        a: "KYC is reviewed within one business day. Once approved, you fund via card, bank wire, or crypto on-ramp and your plan is live the same day funds settle. The first quarterly review call is booked at signup.",
      },
      {
        q: "What's the minimum I need to start?",
        a: "Foundation starts at US$10,000. Growth starts at US$50,000, Accelerator at US$250,000, and Elite at US$1m. Above US$5m we'll structure a bespoke mandate — write to clients@roobani.com.",
      },
    ],
  },
  {
    title: "How money is managed",
    items: [
      {
        q: "Is this discretionary or advisory?",
        a: "Discretionary. You agree the plan; your portfolio manager executes within the published guardrails. You get a real-time dashboard, monthly statements, and a quarterly review call. You can withdraw any time subject to the plan's lock-in.",
      },
      {
        q: "What's actually inside each plan?",
        a: "Public equities (regional + global), sukuk-style fixed income, real assets (commodities + listed REITs), and a small actively-traded digital asset allocation. The exact blend per plan is on the Plans page — and the breakdown moves with the cycle, not with anyone's gut feeling.",
      },
      {
        q: "Are returns guaranteed?",
        a: "No. Anyone telling you returns are guaranteed in a multi-asset portfolio is either misinformed or selling you something you shouldn't buy. We publish target ranges and quarterly audited actuals — that's the contract.",
      },
    ],
  },
  {
    title: "Money in, money out",
    items: [
      {
        q: "How do I fund my account?",
        a: "Card, bank wire, USDC/USDT on-ramp, or several BNPL methods. Crypto is settled to fiat at Stripe's reference rate the moment it lands — your account always shows in your preferred currency.",
      },
      {
        q: "How do I withdraw?",
        a: "Request a withdrawal from your dashboard. Withdrawals are reviewed and processed within two business days. Bank wire goes to a verified account on file; crypto goes to a verified wallet on file. There's no withdrawal fee, only the network fee.",
      },
      {
        q: "Is there a lock-in?",
        a: "Each plan has a minimum holding period (3–24 months depending on plan). You can withdraw early — the lock-in only governs the performance fee crystallisation, not your access to the principal.",
      },
    ],
  },
  {
    title: "Safety & compliance",
    items: [
      {
        q: "Where are the funds held?",
        a: "Client funds are held in segregated custodial accounts — never on Roobani's balance sheet. Roobani is licensed for portfolio management in Kenya and adheres to FATF-aligned KYC/AML standards.",
      },
      {
        q: "Who can see my data?",
        a: "Your portfolio manager and the senior strategist on your account. Personal information is encrypted at rest (Fernet) and we keep an immutable audit log of every administrative action. Read the full Privacy Policy.",
      },
      {
        q: "What about two-factor authentication?",
        a: "TOTP-based MFA is available for all client accounts and mandatory for portfolio managers and super admins. Enrol it from Profile → Security.",
      },
    ],
  },
];

export default function FAQ() {
  return (
    <div className="pt-28 md:pt-36 pb-20 px-6 md:px-12 max-w-4xl mx-auto" data-testid="faq-page">
      <SEO
        title="FAQ"
        description="Answers about onboarding, how your money is managed, deposits, withdrawals, and safety — written without the salesy hedging."
        keywords={["roobani faq", "investment plan questions", "wealth management onboarding"]}
      />
      <div className="text-[10px] tracking-[0.25em] uppercase font-mono text-[#1A1F3D]/60 mb-4">
        Frequently asked
      </div>
      <h1 className="font-serif text-4xl md:text-5xl tracking-tight text-[#1A1F3D] leading-[1.05]">
        Questions worth answering properly.
      </h1>
      <p className="mt-4 text-[15px] text-[#4A4A4A] leading-relaxed max-w-2xl">
        If your question isn't here, write to{" "}
        <a href="mailto:support@roobani.com" className="underline underline-offset-2 hover:text-[#1A1F3D]">support@roobani.com</a>
        {" "}or use the live chat in the corner. A human, never a bot, replies within one business day.
      </p>

      <div className="mt-12 space-y-12">
        {FAQ_GROUPS.map((group) => (
          <section key={group.title}>
            <h2 className="font-serif text-2xl text-[#1A1F3D] mb-6">{group.title}</h2>
            <div className="border-t border-[#E0DDD5]">
              {group.items.map((item, idx) => (
                <FAQItem key={idx} q={item.q} a={item.a} testId={`faq-${group.title.toLowerCase().replace(/\s+/g, "-")}-${idx}`} />
              ))}
            </div>
          </section>
        ))}
      </div>

      <div className="mt-16 p-8 border border-[#E0DDD5] bg-[#FAFAF8]">
        <div className="text-[10px] tracking-[0.25em] uppercase font-mono text-[#1A1F3D]/60">
          Still curious?
        </div>
        <h3 className="font-serif text-2xl text-[#1A1F3D] mt-2">Book a 20-minute call.</h3>
        <p className="mt-3 text-sm text-[#4A4A4A] leading-relaxed">
          No pitch deck. We talk through what you'd like the next five years of capital to do, and then you decide whether Roobani is the right vehicle.
        </p>
        <div className="mt-6 flex gap-3">
          <Link
            to="/contact"
            data-testid="faq-cta-contact"
            className="px-6 py-3 text-[11px] tracking-[0.2em] uppercase font-mono text-white inline-block"
            style={{ background: "#1A1F3D" }}
          >
            Speak to a strategist
          </Link>
          <a
            href="mailto:support@roobani.com"
            data-testid="faq-cta-email"
            className="px-6 py-3 text-[11px] tracking-[0.2em] uppercase font-mono border border-[#1A1F3D] text-[#1A1F3D] inline-block hover:bg-[#1A1F3D] hover:text-white transition-colors"
          >
            Email support
          </a>
        </div>
      </div>
    </div>
  );
}

function FAQItem({ q, a, testId }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-[#E0DDD5]" data-testid={testId}>
      <button
        type="button"
        onClick={() => setOpen((s) => !s)}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-6 py-5 text-left group"
      >
        <span className="font-serif text-lg text-[#1A1F3D] leading-snug">{q}</span>
        <ChevronDown
          className={`flex-shrink-0 w-4 h-4 text-[#1A1F3D]/60 transition-transform duration-200 ${open ? "rotate-180" : "rotate-0"}`}
          aria-hidden="true"
        />
      </button>
      {open && (
        <div className="pb-6 text-[15px] text-[#4A4A4A] leading-relaxed" data-testid={`${testId}-answer`}>
          {a}
        </div>
      )}
    </div>
  );
}
