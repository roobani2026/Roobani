import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { PLANS, formatPlanReturn } from "../data/plans";
import { ArrowUpRight, Check, TrendingUp, Lock } from "lucide-react";
import { useCurrency } from "../lib/currency";

export default function Upgrade() {
  const [holdings, setHoldings] = useState([]);
  const [loading, setLoading] = useState(true);
  const { formatMoney } = useCurrency();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await api.get("/holdings");
        if (!cancelled) setHoldings(r.data?.items || r.data || []);
      } catch { /* silent */ }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, []);

  const byPlan = holdings.reduce((acc, h) => {
    acc[h.plan_slug] = (acc[h.plan_slug] || 0) + Number(h.amount || 0);
    return acc;
  }, {});

  return (
    <div className="max-w-[1400px] mx-auto px-6 md:px-12 py-10" data-testid="page-upgrade">
      <div className="flex items-end justify-between mb-10 gap-6 flex-wrap">
        <div>
          <div className="rb-mono text-[11px] uppercase tracking-[0.22em] text-rb-text2">Upgrade Path</div>
          <h1 className="rb-display text-4xl md:text-5xl text-rb-navy mt-2">Move Up a Tier</h1>
          <p className="text-rb-text2 mt-3 max-w-xl text-sm">Each plan unlocks a higher target return, broader asset access, and a longer compounding horizon. Top up an existing plan, or step up to the next discipline.</p>
        </div>
        <Link to="/plans" className="rb-btn rb-btn-ghost" data-testid="upgrade-compare-link">
          <span className="rb-line">Compare all plans -&gt;</span>
        </Link>
      </div>

      {loading ? (
        <div className="rb-mono text-[11px] text-rb-text2" data-testid="upgrade-loading">Loading your holdings ...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {PLANS.map((plan) => {
            const invested = byPlan[plan.slug] || 0;
            const holding = invested > 0;
            return (
              <article key={plan.slug} className="rb-card relative p-7 flex flex-col gap-5 overflow-hidden" data-testid={`upgrade-plan-${plan.slug}`}>
                {holding && (
                  <div className="absolute top-4 right-4 inline-flex items-center gap-1 px-2 py-1 bg-rb-success/10 text-rb-success rb-mono text-[10px] uppercase tracking-[0.18em]" data-testid={`upgrade-holding-${plan.slug}`}>
                    <Check size={12} /> Active
                  </div>
                )}
                <div>
                  <div className="rb-display text-3xl text-rb-navy leading-none">{plan.name}</div>
                  <p className="text-rb-text2 text-xs mt-2 line-clamp-2">{plan.tagline}</p>
                </div>

                <div className="grid grid-cols-2 gap-3 border-t border-b border-rb-border py-4">
                  <div>
                    <div className="rb-label">Target</div>
                    <div className="rb-mono text-lg text-rb-navy">{formatPlanReturn(plan)}</div>
                  </div>
                  <div>
                    <div className="rb-label">Minimum</div>
                    <div className="rb-mono text-lg text-rb-navy">{formatMoney(plan.min_investment, { compact: true })}</div>
                  </div>
                  <div>
                    <div className="rb-label">Lock-in</div>
                    <div className="rb-mono text-lg text-rb-navy">{plan.duration_months} mo</div>
                  </div>
                  <div>
                    <div className="rb-label">Risk</div>
                    <div className="rb-risk mt-1" data-level={plan.risk_level}>{[...Array(5)].map((_, i) => <span key={i} />)}</div>
                  </div>
                </div>

                {holding ? (
                  <div className="bg-rb-bg2 border border-rb-border px-3 py-2">
                    <div className="rb-label">Your Position</div>
                    <div className="rb-mono text-rb-navy text-lg mt-1">{formatMoney(invested)}</div>
                  </div>
                ) : (
                  <div className="text-rb-text2 text-xs flex items-center gap-2">
                    <Lock size={12} /> Not yet activated
                  </div>
                )}

                <div className="flex flex-wrap gap-1.5">
                  {plan.asset_classes.slice(0, 4).map((a) => (
                    <span key={a} className="rb-mono text-[10px] uppercase tracking-[0.16em] border border-rb-border px-1.5 py-0.5">{a}</span>
                  ))}
                </div>

                <div className="mt-auto pt-3 flex flex-col gap-2">
                  <Link to={`/fund/${plan.slug}`} className="rb-btn rb-btn-primary" data-testid={`upgrade-fund-${plan.slug}`}>
                    <span>{holding ? "Top Up" : "Activate Plan"}</span>
                    <ArrowUpRight size={14} />
                  </Link>
                  <Link to={`/plans#${plan.slug}`} className="rb-btn rb-btn-ghost" data-testid={`upgrade-details-${plan.slug}`}>
                    <span className="rb-line">See full details</span>
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-6">
        {[
          { Icon: TrendingUp, title: "Higher target return", body: "Each tier widens the band of expected returns by 4 to 6 percentage points." },
          { Icon: Lock, title: "Longer compounding", body: "Lock-in extends from 12 to 48 months as you move up, multiplying compounding cycles." },
          { Icon: Check, title: "Broader asset universe", body: "Elite unlocks private markets and hedge strategies not available in lower tiers." },
        ].map(({ Icon, title, body }) => (
          <div key={title} className="bg-white border border-rb-border p-6">
            <Icon size={20} className="text-rb-gold" />
            <div className="rb-display text-xl text-rb-navy mt-3">{title}</div>
            <div className="text-rb-text2 text-sm mt-2">{body}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
