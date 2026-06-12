import React, { useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { PieChart, Pie, Cell, ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip } from "recharts";
import { PLANS, formatPlanReturn } from "../data/plans";
import { ArrowRight } from "lucide-react";
import LiveMarketPanel from "../components/LiveMarketPanel";
import PlanExplainer from "../components/PlanExplainer";
import { useCurrency } from "../lib/currency";

function PlanSection({ plan, idx }) {
  const { formatMoney } = useCurrency();
  return (
    <article id={plan.slug} className="py-20 md:py-28 border-t border-rb-border scroll-mt-24" data-testid={`plan-section-${plan.slug}`}>
      <div className="max-w-[1400px] mx-auto px-6 md:px-12">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
          <div className="lg:col-span-5">
            <h2 className="rb-display text-5xl md:text-7xl text-rb-navy leading-[0.95]">{plan.name}</h2>
            <p className="text-rb-text2 mt-6 text-lg max-w-md">{plan.tagline}</p>

            <div className="grid grid-cols-2 gap-px mt-10 bg-rb-border">
              <div className="bg-white p-5">
                <div className="rb-label">Target Return</div>
                <div className="rb-mono text-2xl text-rb-navy">{formatPlanReturn(plan)}</div>
              </div>
              <div className="bg-white p-5">
                <div className="rb-label">Risk Level</div>
                <div className="rb-risk mt-2" data-level={plan.risk_level}>{[...Array(5)].map((_, i) => <span key={i} />)}</div>
              </div>
              <div className="bg-white p-5">
                <div className="rb-label">Minimum</div>
                <div className="rb-mono text-2xl text-rb-navy">{formatMoney(plan.min_investment, { compact: true })}</div>
              </div>
              <div className="bg-white p-5">
                <div className="rb-label">Maximum</div>
                <div className="rb-mono text-2xl text-rb-navy">{formatMoney(plan.max_investment, { compact: true })}</div>
              </div>
              <div className="bg-white p-5">
                <div className="rb-label">Lock In</div>
                <div className="rb-mono text-2xl text-rb-navy">{plan.duration_months} months</div>
              </div>
              <div className="bg-white p-5">
                <div className="rb-label">Fees</div>
                <div className="rb-mono text-2xl text-rb-navy">{plan.management_fee}% + {plan.performance_fee}%</div>
              </div>
            </div>

            <div className="mt-10 flex gap-4">
              <Link to={`/fund/${plan.slug}`} className="rb-btn rb-btn-primary" data-testid={`plan-start-${plan.slug}`}>
                <span>Start Investing</span><ArrowRight size={16} />
              </Link>
              <Link to="/contact" className="rb-btn rb-btn-ghost" data-testid={`plan-contact-${plan.slug}`}>
                <span className="rb-line">Speak to a strategist</span>
              </Link>
            </div>
          </div>

          <div className="lg:col-span-7">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-white border border-rb-border p-6">
                <div className="flex items-baseline justify-between mb-4">
                  <div className="rb-display text-xl text-rb-navy">Allocation</div>
                  <div className="rb-mono text-[10px] uppercase tracking-[0.18em] text-rb-text2">target</div>
                </div>
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                    <PieChart>
                      <Pie data={plan.allocation} dataKey="value" nameKey="name" innerRadius={50} outerRadius={88} strokeWidth={1}>
                        {plan.allocation.map((a, i) => <Cell key={i} fill={a.color} stroke="#FAFAF8" />)}
                      </Pie>
                      <Tooltip contentStyle={{ background: "#fff", border: "1px solid #E0DDD5", borderRadius: 0, fontFamily: "JetBrains Mono", fontSize: 12 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="grid grid-cols-2 gap-2 mt-3">
                  {plan.allocation.map((a) => (
                    <div key={a.name} className="flex items-center gap-2 text-xs">
                      <span style={{ background: a.color }} className="inline-block w-3 h-3" />
                      <span className="text-rb-text2 flex-1">{a.name}</span>
                      <span className="rb-mono text-rb-navy">{a.value}%</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-white border border-rb-border p-6">
                <div className="flex items-baseline justify-between mb-4">
                  <div className="rb-display text-xl text-rb-navy">12 Month Trajectory</div>
                  <div className="rb-mono text-[10px] uppercase tracking-[0.18em] text-rb-success">simulated</div>
                </div>
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                    <LineChart data={plan.history.map((y, i) => ({ x: `M${i + 1}`, y }))} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                      <XAxis dataKey="x" stroke="#6B6B6B" tick={{ fontFamily: "JetBrains Mono", fontSize: 10 }} axisLine={false} tickLine={false} />
                      <YAxis stroke="#6B6B6B" tick={{ fontFamily: "JetBrains Mono", fontSize: 10 }} axisLine={false} tickLine={false} width={36} />
                      <Tooltip contentStyle={{ background: "#fff", border: "1px solid #E0DDD5", borderRadius: 0, fontFamily: "JetBrains Mono", fontSize: 12 }} />
                      <Line type="monotone" dataKey="y" stroke="#1A1F3D" strokeWidth={1.6} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            <div className="bg-white border border-rb-border p-6 mt-6">
              <div className="rb-label">Asset Classes Included</div>
              <div className="mt-3 flex flex-wrap gap-2">
                {plan.asset_classes.map((a) => (
                  <span key={a} className="rb-mono text-[11px] uppercase tracking-[0.16em] border border-rb-border px-3 py-1.5">{a}</span>
                ))}
              </div>
              <div className="rb-hr my-6" />
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-sm">
                <div><div className="rb-label">Rebalancing</div><div className="rb-mono text-rb-navy">Quarterly</div></div>
                <div><div className="rb-label">Withdrawal</div><div className="rb-mono text-rb-navy">Monthly window</div></div>
                <div><div className="rb-label">Reporting</div><div className="rb-mono text-rb-navy">Monthly PDF</div></div>
                <div><div className="rb-label">Custody</div><div className="rb-mono text-rb-navy">Tier 1 partner</div></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}

export default function Plans() {
  const { hash } = useLocation();
  const { formatMoney } = useCurrency();
  useEffect(() => {
    if (hash) {
      const el = document.getElementById(hash.replace("#", ""));
      if (el) setTimeout(() => el.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
    }
  }, [hash]);

  return (
    <div data-testid="plans-page">
      <section className="pt-40 pb-16 md:pt-48 md:pb-20 relative overflow-hidden">
        <div className="rb-grain absolute inset-0" />
        <div className="relative max-w-[1400px] mx-auto px-6 md:px-12 grid grid-cols-1 lg:grid-cols-12 gap-10 items-end">
          <div className="lg:col-span-8">
            <h1 className="rb-display text-5xl md:text-7xl lg:text-8xl text-rb-navy leading-[0.95]">
              Four plans, calibrated to <em className="not-italic text-rb-gold">your conviction</em>.
            </h1>
          </div>
          <div className="lg:col-span-4">
            <p className="text-rb-text2">
              Compare side by side. Pick the discipline that fits your timeline and tolerance.
              Switch any time, capital permitting.
            </p>
          </div>
        </div>
      </section>

      {/* What is an investment plan */}
      <PlanExplainer />

      {/* Comparison table */}
      <section className="py-12">
        <div className="max-w-[1400px] mx-auto px-6 md:px-12">
          <div className="overflow-x-auto border border-rb-border">
            <table className="w-full text-sm border-collapse" data-testid="plans-compare-table">
              <thead>
                <tr className="bg-rb-bg2">
                  <th className="text-left p-4 rb-mono uppercase text-[11px] tracking-[0.16em] border-r border-rb-border">Metric</th>
                  {PLANS.map((p) => (
                    <th key={p.slug} className="text-left p-4 rb-display text-2xl text-rb-navy border-r border-rb-border last:border-0">{p.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  ["Target Return", (p) => <span>{formatPlanReturn(p)}</span>],
                  ["Risk", (p) => (
                    <span className="rb-risk inline-flex" data-level={p.risk_level}>
                      {[...Array(5)].map((_, i) => <span key={i} />)}
                    </span>
                  )],
                  ["Minimum", (p) => <span>{formatMoney(p.min_investment)}</span>],
                  ["Maximum", (p) => <span>{formatMoney(p.max_investment)}</span>],
                  ["Lock In", (p) => <span>{`${p.duration_months} months`}</span>],
                  ["Management Fee", (p) => <span>{`${p.management_fee}%`}</span>],
                  ["Performance Fee", (p) => <span>{`${p.performance_fee}%`}</span>],
                  ["Assets", (p) => <span className="text-xs">{p.asset_classes.join(", ")}</span>],
                ].map(([label, fn], rowIdx) => (
                  <tr key={label} className={rowIdx % 2 === 1 ? "bg-rb-bg" : "bg-white"}>
                    <td className="p-4 border-t border-r border-rb-border rb-mono text-[11px] uppercase tracking-[0.14em] text-rb-text2">{label}</td>
                    {PLANS.map((p) => (
                      <td key={p.slug} className="p-4 border-t border-r border-rb-border last:border-r-0 rb-mono text-rb-navy">{fn(p)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {PLANS.map((p, i) => <PlanSection key={p.slug} plan={p} idx={i} />)}

      <section className="py-24 md:py-32 bg-rb-bg2 relative">
        <div className="rb-grain absolute inset-0" />
        <div className="relative max-w-[1400px] mx-auto px-6 md:px-12">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
            <h2 className="rb-display text-4xl md:text-6xl text-rb-navy">Markets, right now.</h2>
            <p className="text-rb-text2 max-w-sm">
              Real time pricing across asset classes included in our plans.
            </p>
          </div>
          <LiveMarketPanel />
        </div>
      </section>
    </div>
  );
}
