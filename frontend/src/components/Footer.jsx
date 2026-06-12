import React from "react";
import { Link } from "react-router-dom";
import { Logo } from "./Logo";

export default function Footer() {
  return (
    <footer className="relative bg-rb-bg2 mt-32" data-testid="footer">
      <div className="rb-hr" />
      <div className="max-w-[1400px] mx-auto px-6 md:px-12 py-20 grid grid-cols-1 md:grid-cols-12 gap-12">
        <div className="md:col-span-5 space-y-6">
          <Logo size={44} />
          <p className="text-rb-text2 text-sm max-w-md leading-relaxed">
            Roobani is a private investment platform offering curated plans across equities, bonds,
            real assets, and digital assets. Built for investors who value clarity, precision, and accountability.
          </p>
          <div className="rb-mono text-[11px] uppercase tracking-[0.18em] text-rb-text2">
            hello@roobani.com  ::  +254 712 345 678
          </div>
        </div>

        <div className="md:col-span-2">
          <div className="rb-label">Navigate</div>
          <ul className="space-y-3 text-sm">
            {[
              { to: "/", label: "Home" },
              { to: "/plans#foundation", label: "Investment Plans" },
              { to: "/about", label: "About" },
              { to: "/faq", label: "FAQ" },
              { to: "/contact", label: "Contact" },
            ].map((l) => (
              <li key={l.to}><Link to={l.to} className="rb-underline">{l.label}</Link></li>
            ))}
          </ul>
        </div>

        <div className="md:col-span-2">
          <div className="rb-label">Account</div>
          <ul className="space-y-3 text-sm">
            <li><Link to="/login" className="rb-underline">Sign In</Link></li>
            <li><Link to="/signup" className="rb-underline">Open Account</Link></li>
            <li><Link to="/dashboard" className="rb-underline">Dashboard</Link></li>
          </ul>
        </div>

        <div className="md:col-span-3">
          <div className="rb-label">Legal</div>
          <ul className="space-y-3 text-sm">
            <li><Link to="/privacy" className="rb-underline" data-testid="footer-privacy">Privacy Policy</Link></li>
            <li><Link to="/terms" className="rb-underline" data-testid="footer-terms">Terms of Service</Link></li>
            <li><Link to="/cookies" className="rb-underline" data-testid="footer-cookies">Cookie Policy</Link></li>
          </ul>
        </div>
      </div>

      <div className="rb-hr" />
      <div className="max-w-[1400px] mx-auto px-6 md:px-12 py-8 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="rb-mono text-[11px] uppercase tracking-[0.18em] text-rb-text2">
          2025 Roobani. All rights reserved.
        </div>
        <div className="text-xs text-rb-text2 max-w-2xl">
          Investments involve risk including potential loss of capital. Past performance does not guarantee future results.
        </div>
      </div>
    </footer>
  );
}
