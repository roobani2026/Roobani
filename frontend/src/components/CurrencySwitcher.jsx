import React, { useEffect, useRef, useState } from "react";
import { ChevronDown, Check } from "lucide-react";
import { useCurrency } from "../lib/currency";

/**
 * Compact currency selector used in Navbar, Dashboard sub-nav and Admin sidebar.
 *
 * variant:
 *   "icon"   - very compact, code-only chip (default)
 *   "labeled" - shows code + chevron in a button styled to match ThemeToggle
 */
export default function CurrencySwitcher({ variant = "icon", className = "", ...rest }) {
  const { currency, setCurrency, supported, updatedAt } = useCurrency();
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef(null);
  const testid = rest["data-testid"] || "currency-switcher";

  useEffect(() => {
    const onClick = (e) => {
      if (!wrapperRef.current) return;
      if (!wrapperRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", onClick);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onClick);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  const base =
    "inline-flex items-center justify-center border border-rb-border " +
    "text-rb-text hover:border-rb-navy hover:text-rb-navy " +
    "transition-colors duration-200 select-none";

  const sizing =
    variant === "labeled"
      ? "gap-1.5 px-3 py-2 rb-mono text-[10px] uppercase tracking-[0.2em]"
      : "gap-1 px-2 h-9 rb-mono text-[10px] uppercase tracking-[0.18em]";

  return (
    <div ref={wrapperRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((s) => !s)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Currency: ${currency}. Change site currency.`}
        title={`Currency: ${currency}`}
        data-testid={testid}
        className={`${base} ${sizing}`}
      >
        <span data-testid={`${testid}-current`}>{currency}</span>
        <ChevronDown size={12} strokeWidth={1.6} />
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute right-0 mt-2 w-56 bg-rb-card border border-rb-border z-[60] shadow-lg"
          data-testid={`${testid}-menu`}
        >
          <ul className="py-1">
            {supported.map((c) => {
              const active = c.code === currency;
              return (
                <li key={c.code}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={active}
                    onClick={() => {
                      setCurrency(c.code);
                      setOpen(false);
                    }}
                    data-testid={`${testid}-option-${c.code.toLowerCase()}`}
                    className={`w-full flex items-center justify-between px-3 py-2 text-left text-sm hover:bg-rb-bg2 transition-colors ${
                      active ? "text-rb-navy" : "text-rb-text"
                    }`}
                  >
                    <span className="flex items-baseline gap-2">
                      <span className="rb-mono text-[11px] tracking-[0.18em]">{c.code}</span>
                      <span className="text-xs text-rb-text2">{c.label}</span>
                    </span>
                    {active && <Check size={14} className="text-rb-gold" strokeWidth={1.6} />}
                  </button>
                </li>
              );
            })}
          </ul>
          {updatedAt && (
            <div className="px-3 py-2 border-t border-rb-border rb-mono text-[9px] uppercase tracking-[0.2em] text-rb-text2">
              Rates :: {new Date(updatedAt).toLocaleTimeString()}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
