export const PLANS = [
  {
    slug: "foundation",
    name: "Foundation",
    tagline: "Stable wealth preservation for cautious investors.",
    min_investment: 1000,
    max_investment: 50000,
    expected_return_low: 6,
    expected_return_high: 9,
    duration_months: 12,
    risk_level: 1,
    management_fee: 0.6,
    performance_fee: 0,
    asset_classes: ["Bonds", "Treasuries", "Gold"],
    allocation: [
      { name: "Bonds", value: 55, color: "#1A1F3D" },
      { name: "Treasuries", value: 30, color: "#C9A84C" },
      { name: "Gold", value: 15, color: "#2A9D8F" },
    ],
    history: [100, 101.2, 102.1, 102.8, 103.4, 104.9, 105.8, 106.7, 107.4, 108.1, 108.9, 109.6],
    visual: "/brand/plan_foundation.webp",
  },
  {
    slug: "growth",
    name: "Growth",
    tagline: "Balanced exposure for steady multi-asset appreciation.",
    min_investment: 5000,
    max_investment: 250000,
    expected_return_low: 10,
    expected_return_high: 14,
    duration_months: 24,
    risk_level: 2,
    management_fee: 0.9,
    performance_fee: 5,
    asset_classes: ["Equities", "Bonds", "Real Estate", "Gold"],
    allocation: [
      { name: "Equities", value: 50, color: "#1A1F3D" },
      { name: "Bonds", value: 25, color: "#C9A84C" },
      { name: "Real Estate", value: 15, color: "#2A9D8F" },
      { name: "Gold", value: 10, color: "#6B6B6B" },
    ],
    history: [100, 101, 99.4, 103.1, 105.7, 104.2, 108.1, 110.4, 109.2, 112.8, 114.3, 116.1],
    visual: "/brand/plan_growth.webp",
  },
  {
    slug: "accelerator",
    name: "Accelerator",
    tagline: "Higher conviction equity tilt with crypto satellite exposure.",
    min_investment: 25000,
    max_investment: 1000000,
    expected_return_low: 14,
    expected_return_high: 22,
    duration_months: 36,
    risk_level: 4,
    management_fee: 1.2,
    performance_fee: 10,
    asset_classes: ["Equities", "Crypto", "Commodities"],
    allocation: [
      { name: "Equities", value: 60, color: "#1A1F3D" },
      { name: "Crypto", value: 25, color: "#C9A84C" },
      { name: "Commodities", value: 15, color: "#2A9D8F" },
    ],
    history: [100, 104, 99, 108, 112, 107, 116, 122, 118, 128, 134, 142],
    visual: "/brand/plan_accelerator.webp",
  },
  {
    slug: "elite",
    name: "Elite",
    tagline: "Institutional grade multi-strategy portfolio for sophisticated investors.",
    min_investment: 100000,
    max_investment: 5000000,
    expected_return_low: 16,
    expected_return_high: 28,
    duration_months: 48,
    risk_level: 5,
    management_fee: 1.5,
    performance_fee: 15,
    asset_classes: ["Equities", "Crypto", "Private Markets", "Hedge", "Gold"],
    allocation: [
      { name: "Equities", value: 40, color: "#1A1F3D" },
      { name: "Private Markets", value: 25, color: "#C9A84C" },
      { name: "Crypto", value: 15, color: "#2A9D8F" },
      { name: "Hedge", value: 12, color: "#6B6B6B" },
      { name: "Gold", value: 8, color: "#3A7D5C" },
    ],
    history: [100, 103, 101, 108, 115, 112, 124, 130, 126, 140, 152, 162],
    visual: "/brand/plan_elite.webp",
  },
];

export const BUDGET_OPTIONS = [
  { value: "under_5k", label: "Under 5,000" },
  { value: "5k_25k", label: "5,000 to 25,000" },
  { value: "25k_100k", label: "25,000 to 100,000" },
  { value: "100k_500k", label: "100,000 to 500,000" },
  { value: "500k_plus", label: "500,000 or more" },
];

export const GOAL_OPTIONS = [
  { value: "wealth_preservation", label: "Wealth Preservation" },
  { value: "steady_growth", label: "Steady Growth" },
  { value: "aggressive_growth", label: "Aggressive Growth" },
  { value: "retirement_planning", label: "Retirement Planning" },
  { value: "passive_income", label: "Passive Income" },
];

export const COUNTRY_CODES = [
  { code: "+1", country: "US / CA" },
  { code: "+44", country: "UK" },
  { code: "+91", country: "IN" },
  { code: "+61", country: "AU" },
  { code: "+971", country: "AE" },
  { code: "+65", country: "SG" },
  { code: "+49", country: "DE" },
  { code: "+33", country: "FR" },
  { code: "+81", country: "JP" },
  { code: "+86", country: "CN" },
];

export const TESTIMONIALS = [
  {
    name: "Aanya Mehta",
    title: "Growth Plan Investor",
    quote: "Roobani gave me a real plan, not a sales pitch. My portfolio is up 14.2% in 11 months.",
    avatar: "/brand/avatar_1.webp",
  },
  {
    name: "Marcus Whitfield",
    title: "Elite Plan Investor",
    quote: "Institutional discipline, boutique attention. The reporting alone is worth the fee.",
    avatar: "/brand/avatar_2.webp",
  },
  {
    name: "Kenji Tanaka",
    title: "Accelerator Investor",
    quote: "Sharp insights, zero noise. My team finally trusts the macro calls we are getting.",
    avatar: "/brand/avatar_3.webp",
  },
  {
    name: "Elin Bergstrom",
    title: "Foundation Plan Investor",
    quote: "I wanted clarity over hype. Roobani delivered, every quarter, on time.",
    avatar: "/brand/avatar_4.webp",
  },
];

export const STEPS = [
  { num: "01", title: "Create Your Account", body: "Verify in under three minutes with secure encrypted onboarding.", img: "/brand/step_account.webp" },
  { num: "02", title: "Choose Your Plan", body: "Pick a plan that matches your risk profile and timeline.", img: "/brand/step_plan.webp" },
  { num: "03", title: "Fund Your Investment", body: "Transfer funds securely via bank or compliant on-ramp.", img: "/brand/step_fund.webp" },
  { num: "04", title: "Track and Grow", body: "Monitor performance with live dashboards and quarterly reviews.", img: "/brand/step_track.webp" },
];

export const TRUST_METRICS = [
  { value: "$72M", label: "Assets Under Guidance", usd: 72_000_000, isCurrency: true },
  { value: "18,400", label: "Active Investors" },
  { value: "12.8%", label: "Average Annual Return" },
  { value: "2018", label: "Operating Since" },
];

export function formatPlanReturn(plan) {
  return `${plan.expected_return_low}% to ${plan.expected_return_high}%`;
}
