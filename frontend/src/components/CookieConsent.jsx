import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Cookie, X } from "lucide-react";

/**
 * GDPR-style cookie consent banner.
 *
 * Persists a record of the user's choice in localStorage under "rb-cookie-consent".
 * Shape:
 *   { categories: { necessary: true, functional: bool, analytics: bool, marketing: bool },
 *     decidedAt: ISO string,
 *     version: 1 }
 *
 * Renders nothing once the user has made a choice.
 */
const STORAGE_KEY = "rb-cookie-consent";
const VERSION = 1;

function readConsent() {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.version !== VERSION) return null;
    return parsed;
  } catch (e) {
    return null;
  }
}

function writeConsent(categories) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        categories,
        decidedAt: new Date().toISOString(),
        version: VERSION,
      })
    );
  } catch (e) {
    /* ignore */
  }
}

const DEFAULT_CATEGORIES = {
  necessary: true,
  functional: true,
  analytics: false,
  marketing: false,
};

export default function CookieConsent() {
  const [visible, setVisible] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [categories, setCategories] = useState(DEFAULT_CATEGORIES);

  useEffect(() => {
    // Decide visibility on mount (avoid SSR flash)
    const existing = readConsent();
    if (!existing) {
      setVisible(true);
    } else if (existing?.categories) {
      setCategories({ ...DEFAULT_CATEGORIES, ...existing.categories, necessary: true });
    }
  }, []);

  const acceptAll = () => {
    const cats = { necessary: true, functional: true, analytics: true, marketing: true };
    writeConsent(cats);
    setCategories(cats);
    setVisible(false);
  };

  const rejectAll = () => {
    const cats = { necessary: true, functional: false, analytics: false, marketing: false };
    writeConsent(cats);
    setCategories(cats);
    setVisible(false);
  };

  const savePreferences = () => {
    const cats = { ...categories, necessary: true };
    writeConsent(cats);
    setVisible(false);
  };

  const toggle = (k) => {
    if (k === "necessary") return; // always on
    setCategories((c) => ({ ...c, [k]: !c[k] }));
  };

  if (!visible) return null;

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-[80] px-4 pb-4 sm:px-6 sm:pb-6"
      data-testid="cookie-consent-banner"
      role="dialog"
      aria-live="polite"
      aria-label="Cookie consent"
    >
      <div className="max-w-[1100px] mx-auto bg-rb-card border border-rb-border shadow-[8px_8px_0_0_var(--rb-navy)]">
        {!manageOpen ? (
          <div className="p-5 md:p-7 flex flex-col md:flex-row md:items-start gap-5">
            <div className="hidden md:flex items-center justify-center w-11 h-11 border border-rb-border text-rb-gold shrink-0">
              <Cookie size={20} strokeWidth={1.4} />
            </div>
            <div className="flex-1">
              <div className="rb-mono text-[10px] uppercase tracking-[0.22em] text-rb-text2">
                Cookie preferences
              </div>
              <div className="rb-display text-xl md:text-2xl text-rb-navy mt-1">
                We use cookies to keep you signed in and improve Roobani.
              </div>
              <p className="text-sm text-rb-text2 mt-2 max-w-[68ch]">
                Strictly necessary cookies are always active. With your consent we also use
                functional, analytics and marketing cookies. You can change your choice any time.
                See our <Link to="/cookies" className="rb-underline text-rb-navy">Cookie Policy</Link>
                {" "}and <Link to="/privacy" className="rb-underline text-rb-navy">Privacy Policy</Link>.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-2 md:gap-3 md:items-center md:shrink-0">
              <button
                type="button"
                onClick={() => setManageOpen(true)}
                className="rb-btn rb-btn-ghost whitespace-nowrap"
                data-testid="cookie-manage"
              >
                <span className="rb-line">Manage</span>
              </button>
              <button
                type="button"
                onClick={rejectAll}
                className="rb-btn rb-btn-secondary whitespace-nowrap"
                data-testid="cookie-reject"
              >
                <span>Reject</span>
              </button>
              <button
                type="button"
                onClick={acceptAll}
                className="rb-btn rb-btn-primary whitespace-nowrap"
                data-testid="cookie-accept"
              >
                <span>Accept all</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="p-5 md:p-7" data-testid="cookie-manage-panel">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <div className="rb-mono text-[10px] uppercase tracking-[0.22em] text-rb-text2">
                  Manage cookies
                </div>
                <div className="rb-display text-xl md:text-2xl text-rb-navy mt-1">
                  Choose what we may use.
                </div>
              </div>
              <button
                type="button"
                onClick={() => setManageOpen(false)}
                aria-label="Close manage panel"
                className="w-8 h-8 inline-flex items-center justify-center border border-rb-border text-rb-text hover:text-rb-navy hover:border-rb-navy"
                data-testid="cookie-manage-close"
              >
                <X size={14} />
              </button>
            </div>

            <div className="divide-y divide-rb-border border border-rb-border">
              {[
                {
                  key: "necessary",
                  title: "Strictly Necessary",
                  desc: "Required for the site to work: authentication, security, anti-fraud.",
                  locked: true,
                },
                {
                  key: "functional",
                  title: "Functional",
                  desc: "Remembers your preferences such as theme and currency.",
                },
                {
                  key: "analytics",
                  title: "Analytics",
                  desc: "Anonymised usage data so we can measure and improve performance.",
                },
                {
                  key: "marketing",
                  title: "Marketing",
                  desc: "Helps measure campaign effectiveness on third-party sites.",
                },
              ].map((row) => {
                const on = !!categories[row.key];
                return (
                  <div
                    key={row.key}
                    className="flex items-start justify-between gap-4 p-4"
                    data-testid={`cookie-row-${row.key}`}
                  >
                    <div className="flex-1">
                      <div className="rb-mono text-[11px] uppercase tracking-[0.18em] text-rb-navy">
                        {row.title}
                      </div>
                      <p className="text-sm text-rb-text2 mt-1">{row.desc}</p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={on}
                      aria-label={`Toggle ${row.title}`}
                      disabled={row.locked}
                      onClick={() => toggle(row.key)}
                      data-testid={`cookie-toggle-${row.key}`}
                      className={`relative inline-flex shrink-0 h-6 w-11 items-center transition-colors border ${
                        on
                          ? "bg-rb-navy border-rb-navy"
                          : "bg-rb-bg2 border-rb-border"
                      } ${row.locked ? "opacity-60 cursor-not-allowed" : ""}`}
                    >
                      <span
                        className={`inline-block h-4 w-4 bg-rb-card transform transition-transform ${
                          on ? "translate-x-6" : "translate-x-1"
                        }`}
                      />
                    </button>
                  </div>
                );
              })}
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-end gap-2 mt-5">
              <button
                type="button"
                onClick={rejectAll}
                className="rb-btn rb-btn-ghost"
                data-testid="cookie-manage-reject-all"
              >
                <span className="rb-line">Reject all</span>
              </button>
              <button
                type="button"
                onClick={acceptAll}
                className="rb-btn rb-btn-secondary"
                data-testid="cookie-manage-accept-all"
              >
                <span>Accept all</span>
              </button>
              <button
                type="button"
                onClick={savePreferences}
                className="rb-btn rb-btn-primary"
                data-testid="cookie-manage-save"
              >
                <span>Save preferences</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
