import React from "react";
import { Link } from "react-router-dom";
import { Shield, Layers, Compass, TrendingUp } from "lucide-react";

const POINTS = [
  {
    Icon: Layers,
    title: "A curated bundle",
    body: "Each plan is a single investment that already holds many assets. You buy one plan, and a senior strategy team manages the underlying mix on your behalf.",
  },
  {
    Icon: Compass,
    title: "Calibrated to your goal",
    body: "Plans are tiered by risk and timeline. Pick the one that matches what you want from your money, whether that is preservation, growth, or aggressive compounding.",
  },
  {
    Icon: TrendingUp,
    title: "Targeted returns, transparent fees",
    body: "Every plan shows an expected annualized return range and a flat management fee. No hidden spreads, no surprise charges.",
  },
  {
    Icon: Shield,
    title: "Built in protection",
    body: "Assets are held with regulated tier 1 custodians. Plans are stress tested quarterly. You can withdraw inside the published window.",
  },
];

export default function PlanExplainer() {
  return (
    <section className="py-24 md:py-32" data-testid="plans-explainer">
      <div className="max-w-[1400px] mx-auto px-6 md:px-12">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-start">
          <div className="lg:col-span-5 lg:sticky lg:top-32">
            <h2 className="rb-display text-4xl md:text-6xl text-rb-navy leading-[0.98]">
              An investment plan, explained in plain language.
            </h2>
            <p className="text-rb-text2 mt-6 text-base md:text-lg max-w-md leading-relaxed">
              Think of it as a recipe for your money. Instead of guessing which single stock, bond, or coin to buy,
              you choose a plan that already blends them in the right proportions for your goal. Our team rebalances the
              mix every quarter so the recipe stays true through changing markets.
            </p>
            <div className="mt-8 flex gap-4">
              <Link to="/plans" className="rb-btn rb-btn-primary" data-testid="explainer-view-plans">
                <span>View All Plans</span>
              </Link>
              <Link to="/contact" className="rb-btn rb-btn-ghost" data-testid="explainer-ask-question">
                <span className="rb-line">Ask a strategist</span>
              </Link>
            </div>
          </div>

          <div className="lg:col-span-7">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-px bg-rb-border border border-rb-border">
              {POINTS.map(({ Icon, title, body }, i) => (
                <div key={title} className="bg-white p-8 md:p-10 flex flex-col gap-4" data-testid={`explainer-point-${i}`}>
                  <Icon size={22} strokeWidth={1.2} className="text-rb-gold" />
                  <h3 className="rb-display text-2xl text-rb-navy">{title}</h3>
                  <p className="text-sm text-rb-text2 leading-relaxed">{body}</p>
                </div>
              ))}
            </div>

            <div className="bg-rb-bg2 border border-rb-border p-8 md:p-10 mt-6">
              <div className="rb-mono text-[11px] uppercase tracking-[0.18em] text-rb-text2 mb-3">How it differs from a single stock</div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-sm">
                <div>
                  <div className="rb-display text-xl text-rb-navy mb-1">Diversified</div>
                  <p className="text-rb-text2">A plan spreads risk across many assets. One bad day in one asset is absorbed by the rest.</p>
                </div>
                <div>
                  <div className="rb-display text-xl text-rb-navy mb-1">Managed</div>
                  <p className="text-rb-text2">A strategy team picks, rebalances, and reports. You do not need to time the market.</p>
                </div>
                <div>
                  <div className="rb-display text-xl text-rb-navy mb-1">Rule based</div>
                  <p className="text-rb-text2">Every plan follows a documented mandate. No improvisation, no narrative trading.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
