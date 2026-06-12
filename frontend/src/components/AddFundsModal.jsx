import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { X, ArrowUpRight, ShieldCheck, TrendingUp, Rocket, Crown } from "lucide-react";
import { PLANS, formatPlanReturn } from "../data/plans";
import { useCurrency } from "../lib/currency";

const ICONS = {
  foundation: ShieldCheck,
  growth: TrendingUp,
  accelerator: Rocket,
  elite: Crown,
};

function fmtUSD(n) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1000) return `$${(n / 1000).toFixed(0)}K`;
  return `$${n}`;
}

/**
 * AddFundsModal
 *
 * Lightweight overlay that lets the user pick which plan to fund.
 * Picking a plan navigates to `/fund/:slug` (the existing checkout flow).
 *
 * Why a plan picker rather than a free-form "wallet top-up"?
 *   The backend funding API (`POST /api/checkout/fund`) requires a plan_slug
 *   because contributions are recorded against a specific investment plan
 *   (each plan has its own min/max, return profile and duration). The wallet
 *   balance shown on the dashboard is the sum of all funded contributions.
 */
export default function AddFundsModal({ open, onClose }) {
  const nav = useNavigate();
  const { formatMoney } = useCurrency();

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", onKey);
    // Lock body scroll while open
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center"
      data-testid="add-funds-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-funds-title"
    >
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Close add funds dialog"
        onClick={onClose}
        className="absolute inset-0 bg-rb-navy/70 backdrop-blur-sm"
        data-testid="add-funds-backdrop"
      />

      {/* Sheet */}
      <div className="relative w-full max-w-[820px] mx-4 bg-rb-card border border-rb-border max-h-[88vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 md:px-8 py-5 border-b border-rb-border sticky top-0 bg-rb-card z-10">
          <div>
            <div className="rb-mono text-[10px] uppercase tracking-[0.22em] text-rb-text2">Add Funds</div>
            <h2 id="add-funds-title" className="rb-display text-2xl md:text-3xl text-rb-navy mt-1">
              Choose a plan to fund.
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="w-9 h-9 inline-flex items-center justify-center border border-rb-border hover:border-rb-navy text-rb-text hover:text-rb-navy transition-colors"
            data-testid="add-funds-close"
          >
            <X size={16} />
          </button>
        </div>

        {/* Plans list */}
        <div className="px-6 md:px-8 py-6">
          <p className="text-sm text-rb-text2 mb-5 max-w-[60ch]">
            Funds are allocated to a specific plan and held with our tier-1 custody partner upon
            clearance. Pick a plan to continue to secure checkout (multi-currency &amp; crypto supported).
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {PLANS.map((p) => {
              const Icon = ICONS[p.slug] || TrendingUp;
              return (
                <button
                  key={p.slug}
                  type="button"
                  onClick={() => { onClose?.(); nav(`/fund/${p.slug}`); }}
                  className="group text-left bg-white border border-rb-border hover:border-rb-navy hover:shadow-[6px_6px_0_0_var(--rb-gold)] p-5 transition-all"
                  data-testid={`add-funds-pick-${p.slug}`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <span className="w-9 h-9 border border-rb-border flex items-center justify-center text-rb-gold">
                        <Icon size={16} strokeWidth={1.4} />
                      </span>
                      <div>
                        <div className="rb-display text-xl text-rb-navy">{p.name}</div>
                        <div className="rb-mono text-[10px] uppercase tracking-[0.18em] text-rb-text2 mt-0.5">
                          {formatPlanReturn(p)} :: {p.duration_months} mo
                        </div>
                      </div>
                    </div>
                    <ArrowUpRight
                      size={16}
                      className="text-rb-text2 group-hover:text-rb-navy transition-colors mt-1"
                    />
                  </div>
                  <p className="text-xs text-rb-text2 mt-3 leading-snug">{p.tagline}</p>
                  <div className="mt-4 flex items-baseline justify-between border-t border-rb-border pt-3">
                    <span className="rb-mono text-[10px] uppercase tracking-[0.18em] text-rb-text2">Min</span>
                    <span className="rb-mono text-base text-rb-navy">{formatMoney(p.min_investment)}</span>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="rb-mono text-[10px] uppercase tracking-[0.18em] text-rb-text2 mt-6 text-center">
            Stripe Checkout :: Cards :: Crypto :: BNPL :: 135+ currencies
          </div>
        </div>
      </div>
    </div>
  );
}
