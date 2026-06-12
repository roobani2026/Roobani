import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, ArrowRight, Lock, ShieldCheck, LineChart as LineChartIcon, Award } from "lucide-react";
import { ResponsiveContainer, AreaChart, Area, LineChart, Line, Tooltip } from "recharts";
import MarketTicker from "../components/MarketTicker";
import LeadForm from "../components/LeadForm";
import SEO from "../components/SEO";
import { PLANS, TRUST_METRICS, STEPS, TESTIMONIALS, formatPlanReturn } from "../data/plans";
import LiveMarketPanel from "../components/LiveMarketPanel";
import PlanExplainer from "../components/PlanExplainer";
import { useCurrency } from "../lib/currency";

function CountUp({ value, suffix = "", duration = 1400 }) {
  const ref = useRef(null);
  const [shown, setShown] = useState("0");
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    let started = false;
    const isNumber = /^[$]?[\d.,]+/.test(value);
    if (!isNumber) { setShown(value); return; }
    const numericPart = value.match(/[\d.,]+/)[0];
    const prefix = value.startsWith("$") ? "$" : "";
    // Preserve trailing unit suffix (e.g. "M", "B", "K", "%") from the source string
    const tailMatch = value.match(/([A-Za-z%]+)\s*$/);
    const unit = tailMatch ? tailMatch[1] : "";
    const target = parseFloat(numericPart.replace(/,/g, ""));
    const obs = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && !started) {
        started = true;
        const start = performance.now();
        const step = (now) => {
          const t = Math.min(1, (now - start) / duration);
          const eased = 1 - Math.pow(1 - t, 3);
          const v = target * eased;
          let str;
          if (unit) {
            // When a unit was explicitly given (M / B / K / %), animate the
            // numeric portion and keep the unit intact.
            str = numericPart.includes(".") ? v.toFixed(1) : Math.round(v).toLocaleString();
          } else if (target >= 1000) {
            if (target >= 1_000_000_000) str = (v / 1_000_000_000).toFixed(2) + "B";
            else if (target >= 1_000_000) str = (v / 1_000_000).toFixed(2) + "M";
            else str = Math.round(v).toLocaleString();
          } else {
            str = v.toFixed(numericPart.includes(".") ? 1 : 0);
          }
          setShown(prefix + str + unit);
          if (t < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      }
    }, { threshold: 0.3 });
    obs.observe(node);
    return () => obs.disconnect();
  }, [value, duration]);
  return <span ref={ref} data-testid="trust-metric">{shown}</span>;
}

function PlanCard({ plan, idx }) {
  const { formatMoney } = useCurrency();
  const data = plan.history.map((y, i) => ({ x: i, y }));
  return (
    <article
      className="rb-card relative p-8 md:p-10 flex flex-col gap-6 rb-fadeup overflow-hidden"
      style={{ animationDelay: `${idx * 80}ms` }}
      data-testid={`plan-card-${plan.slug}`}
    >
      <div>
        <h3 className="rb-display text-4xl text-rb-navy leading-none">{plan.name}</h3>
        <div className="mt-4 flex items-center gap-3">
          <span className="rb-mono text-[10px] uppercase tracking-[0.2em] text-rb-text2">Risk</span>
          <span className="rb-risk" data-level={plan.risk_level} aria-label={`Risk level ${plan.risk_level} of 5`}>
            {[...Array(5)].map((_, i) => <span key={i} />)}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 border-t border-b border-rb-border py-5">
        <div>
          <div className="rb-label">Target Return</div>
          <div className="rb-mono text-xl text-rb-navy">{formatPlanReturn(plan)}</div>
        </div>
        <div>
          <div className="rb-label">Minimum</div>
          <div className="rb-mono text-xl text-rb-navy">{formatMoney(plan.min_investment, { compact: true })}</div>
        </div>
        <div>
          <div className="rb-label">Duration</div>
          <div className="rb-mono text-xl text-rb-navy">{plan.duration_months} mo</div>
        </div>
        <div>
          <div className="rb-label">Mgmt Fee</div>
          <div className="rb-mono text-xl text-rb-navy">{plan.management_fee}%</div>
        </div>
      </div>

      <div className="-mx-2 h-20">
        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
          <AreaChart data={data} margin={{ top: 4, bottom: 0, left: 0, right: 0 }}>
            <defs>
              <linearGradient id={`g-${plan.slug}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#C9A84C" stopOpacity={0.55} />
                <stop offset="100%" stopColor="#C9A84C" stopOpacity={0} />
              </linearGradient>
            </defs>
            <Area type="monotone" dataKey="y" stroke="#1A1F3D" strokeWidth={1.4} fill={`url(#g-${plan.slug})`} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="flex flex-wrap gap-2">
        {plan.asset_classes.map((a) => (
          <span key={a} className="rb-mono text-[11px] uppercase tracking-[0.16em] border border-rb-border px-2 py-1">
            {a}
          </span>
        ))}
      </div>

      <Link
        to={`/plans#${plan.slug}`}
        className="rb-btn rb-btn-secondary mt-auto w-full justify-between"
        data-testid={`plan-cta-${plan.slug}`}
      >
        <span>View Details</span>
        <ArrowRight size={16} />
      </Link>
    </article>
  );
}

export default function Home() {
  const { formatMoney } = useCurrency();
  const heroChart = Array.from({ length: 40 }, (_, i) => ({
    x: i,
    y: 100 + Math.sin(i / 5) * 6 + i * 1.4 + (i > 30 ? (i - 30) * 1.6 : 0),
  }));

  return (
    <div data-testid="home-page">
      <SEO
        title="Concierge wealth, audited returns"
        description="Roobani pairs every client with a dedicated portfolio manager and four curated multi-asset plans spanning equities, sukuk-style fixed income, real assets, and digital assets. Licensed in Kenya. Onboard in 48 hours."
        image="/brand/hero_visual.webp"
        imageAlt="Roobani client dashboard showing a 90-day portfolio performance curve."
        keywords={[
          "wealth management Kenya",
          "portfolio manager Nairobi",
          "investment plans East Africa",
          "sukuk fixed income",
          "managed crypto portfolio",
          "private wealth advisory",
        ]}
        structuredData={{
          "@context": "https://schema.org",
          "@type": "FinancialService",
          "name": "Roobani",
          "url": "https://roobani.com",
          "areaServed": "Kenya, East Africa, Gulf",
          "serviceType": [
            "Discretionary Portfolio Management",
            "Investment Advisory",
            "Multi-Asset Strategy",
          ],
        }}
      />
      {/* HERO */}
      <section className="relative pt-32 pb-12 md:pt-40 md:pb-16 overflow-hidden">
        <div className="rb-grain absolute inset-0" />
        <div className="relative max-w-[1400px] mx-auto px-6 md:px-12 grid grid-cols-1 lg:grid-cols-12 gap-12 items-end">
          <div className="lg:col-span-7 rb-fadeup">
            <div className="rb-mono text-[11px] tracking-[0.3em] uppercase text-rb-text2 mb-6">
              Private wealth · est. Nairobi 2018
            </div>
            <h1 className="rb-display text-5xl md:text-7xl lg:text-8xl text-rb-navy leading-[0.95]">
              A portfolio manager.<br />
              Not a <em className="not-italic text-rb-gold">robo-advisor</em>.
            </h1>
            <p className="mt-10 text-rb-text2 max-w-xl text-base md:text-lg leading-relaxed">
              Every Roobani client is paired with a senior strategist who owns the relationship end-to-end. Four curated plans — equities, sukuk-style fixed income, real assets, digital assets — rebalanced quarterly, audited annually, settled in KES, USD, or major crypto.
            </p>
            <div className="mt-10 flex flex-col sm:flex-row gap-4">
              <Link to="/signup" className="rb-btn rb-btn-primary" data-testid="hero-open-account">
                <span>Open Account in 48 hrs</span><ArrowUpRight size={16} />
              </Link>
              <a href="#plans" className="rb-btn rb-btn-secondary" data-testid="hero-explore-plans">
                <span>See the Four Plans</span>
              </a>
            </div>
            <div className="mt-10 flex flex-wrap gap-6 text-xs text-rb-text2">
              <span className="rb-mono tracking-[0.18em] uppercase">Licensed CMA Kenya</span>
              <span className="rb-mono tracking-[0.18em] uppercase">Tier 1 Custody</span>
              <span className="rb-mono tracking-[0.18em] uppercase">Audited PwC</span>
            </div>
          </div>

          <div className="lg:col-span-5 relative rb-fadeup" style={{ animationDelay: "180ms" }}>
            <div className="relative aspect-[4/5] w-full overflow-hidden">
              <picture>
                <source srcSet="/brand/hero_visual.webp" type="image/webp" />
                <img
                  src="/brand/hero_visual.png"
                  alt="Roobani client dashboard showing a 90-day portfolio performance curve and live market data."
                  className="absolute inset-0 w-full h-full object-cover"
                  loading="eager"
                  fetchpriority="high"
                  width="800"
                  height="1000"
                />
              </picture>
              <div className="absolute bottom-6 left-6 right-6 rb-glass border border-rb-border p-5 md:p-6">
                <div className="rb-label">Client Composite · 90D</div>
                <div className="flex items-baseline justify-between mb-2">
                  <div className="rb-mono text-3xl text-rb-navy">+14.62%</div>
                  <div className="rb-mono text-[11px] uppercase tracking-[0.18em] text-rb-success">live</div>
                </div>
                <div className="h-14">
                  <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                    <LineChart data={heroChart} margin={{ top: 4, bottom: 2, left: 0, right: 0 }}>
                      <Line type="monotone" dataKey="y" stroke="#1A1F3D" strokeWidth={1.4} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <MarketTicker />

      {/* TRUST METRICS */}
      <section className="py-24 md:py-32">
        <div className="max-w-[1400px] mx-auto px-6 md:px-12">
          <div className="grid grid-cols-2 md:grid-cols-4 border-y border-rb-border">
            {TRUST_METRICS.map((m, i) => (
              <div key={m.label} className={`p-8 md:p-12 ${i < 3 ? "md:border-r border-rb-border" : ""} ${i % 2 === 0 ? "border-r border-rb-border md:border-r" : ""}`}>
                <div className="rb-label">{m.label}</div>
                <div className="rb-mono text-3xl md:text-5xl text-rb-navy mt-2">
                  {m.isCurrency ? (
                    <span data-testid="trust-metric">{formatMoney(m.usd, { compact: true })}</span>
                  ) : (
                    <CountUp value={m.value} />
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* WHAT IS AN INVESTMENT PLAN */}
      <PlanExplainer />

      {/* PLANS */}
      <section id="plans" className="py-12 md:py-20 scroll-mt-32">
        <div className="max-w-[1400px] mx-auto px-6 md:px-12">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-14">
            <div>
              <h2 className="rb-display text-4xl md:text-6xl text-rb-navy max-w-3xl">
                Four plans. One discipline.
              </h2>
            </div>
            <p className="text-rb-text2 max-w-sm">
              Built and stress-tested by senior multi-asset strategists, rebalanced quarterly, fees disclosed before you sign.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 md:gap-8">
            {PLANS.map((p, i) => <PlanCard key={p.slug} plan={p} idx={i} />)}
          </div>

          <p className="mt-10 text-xs text-rb-text2">
            Past performance does not guarantee future results. All investments carry risk. Returns shown are net of management fees.
          </p>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="py-24 md:py-32 bg-rb-bg2 relative">
        <div className="rb-grain absolute inset-0" />
        <div className="relative max-w-[1400px] mx-auto px-6 md:px-12">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-16">
            <div>
              <h2 className="rb-display text-4xl md:text-6xl text-rb-navy">From sign-up to first return.</h2>
              <p className="text-rb-text2 mt-3 max-w-xl">No call centres. No bots. Your strategist signs your KYC, builds your allocation, and reports on it personally.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 md:gap-10">
            {STEPS.map((s, i) => (
              <div key={s.num} className="bg-white border border-rb-border p-6 flex flex-col gap-5" data-testid={`step-${s.num}`}>
                <div className="aspect-square w-full overflow-hidden">
                  <picture>
                    <source srcSet={s.img.replace(/\.png$/, ".webp")} type="image/webp" />
                    <img
                      src={s.img}
                      alt={`${s.title} — step ${s.num} of the Roobani onboarding journey.`}
                      className="w-full h-full object-cover"
                      loading="lazy"
                      width="600"
                      height="600"
                    />
                  </picture>
                </div>
                <h3 className="rb-display text-2xl text-rb-navy">{s.title}</h3>
                <p className="text-sm text-rb-text2">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* LIVE MARKET PANEL */}
      <section className="py-24 md:py-32">
        <div className="max-w-[1400px] mx-auto px-6 md:px-12">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
            <div>
              <h2 className="rb-display text-4xl md:text-6xl text-rb-navy">Live data, no delay.</h2>
            </div>
            <p className="text-rb-text2 max-w-sm">
              Indices, commodities, forex, and crypto quoted in real time, refreshed every forty five seconds.
            </p>
          </div>
          <LiveMarketPanel />
        </div>
      </section>

      {/* LEAD GEN */}
      <section className="py-24 md:py-32 bg-rb-bg2 relative">
        <div className="rb-grain absolute inset-0" />
        <div className="relative max-w-[1100px] mx-auto px-6 md:px-12">
          <div className="text-center mb-12">
            <h2 className="rb-display text-4xl md:text-6xl text-rb-navy">Talk to a strategist this week.</h2>
            <p className="text-rb-text2 mt-4 max-w-xl mx-auto">No call centre, no demo bot. Share a few details and a senior strategist will reach out within one business day with a tailored allocation.</p>
          </div>
          <LeadForm />
        </div>
      </section>

      {/* TESTIMONIALS */}
      <section className="py-24 md:py-32">
        <div className="max-w-[1400px] mx-auto px-6 md:px-12">
          <div className="flex items-end justify-between mb-14">
            <div>
              <h2 className="rb-display text-4xl md:text-6xl text-rb-navy max-w-3xl">Clients, in their own words.</h2>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {TESTIMONIALS.map((t, i) => (
              <figure key={t.name} className="rb-card p-6 flex flex-col gap-5" data-testid={`testimonial-${i}`}>
                <div className="w-16 h-16 overflow-hidden border border-rb-border">
                  <picture>
                    <source srcSet={t.avatar.replace(/\.png$/, ".webp")} type="image/webp" />
                    <img
                      src={t.avatar}
                      alt={`Portrait of ${t.name}, ${t.title}, a Roobani client.`}
                      className="w-full h-full object-cover"
                      loading="lazy"
                      width="120"
                      height="120"
                    />
                  </picture>
                </div>
                <blockquote className="text-rb-text leading-relaxed">{t.quote}</blockquote>
                <figcaption className="border-t border-rb-border pt-4 mt-auto">
                  <div className="rb-display text-xl text-rb-navy">{t.name}</div>
                  <div className="rb-mono text-[11px] uppercase tracking-[0.18em] text-rb-text2 mt-1">{t.title}</div>
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      {/* TRUST STRIP */}
      <section className="py-16 border-t border-rb-border">
        <div className="max-w-[1400px] mx-auto px-6 md:px-12 grid grid-cols-1 md:grid-cols-4 gap-8">
          {[
            { Icon: ShieldCheck, label: "Licensed CMA Kenya" },
            { Icon: Lock, label: "Tier 1 Custody Partners" },
            { Icon: LineChartIcon, label: "Audited Quarterly" },
            { Icon: Award, label: "Senior Strategist · 1:1" },
          ].map(({ Icon, label }) => (
            <div key={label} className="flex items-center gap-4">
              <Icon size={22} strokeWidth={1.2} className="text-rb-navy" />
              <div className="rb-mono text-[11px] uppercase tracking-[0.18em] text-rb-text">{label}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
