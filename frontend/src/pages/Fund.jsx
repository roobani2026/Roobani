import React, { useMemo, useState } from "react";
import { Navigate, useParams, Link } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { api } from "../lib/api";
import { PLANS, formatPlanReturn } from "../data/plans";
import { ArrowRight, CreditCard, Bitcoin } from "lucide-react";

// Curated list of major Stripe-supported currencies (135+ supported on backend).
// Format: { code, name, symbol, zeroDecimal }
const CURRENCIES = [
  { code: "USD", name: "US Dollar", symbol: "$" },
  { code: "EUR", name: "Euro", symbol: "€" },
  { code: "GBP", name: "British Pound", symbol: "£" },
  { code: "KES", name: "Kenyan Shilling", symbol: "KSh" },
  { code: "NGN", name: "Nigerian Naira", symbol: "₦" },
  { code: "ZAR", name: "South African Rand", symbol: "R" },
  { code: "GHS", name: "Ghanaian Cedi", symbol: "₵" },
  { code: "UGX", name: "Ugandan Shilling", symbol: "USh", zeroDecimal: true },
  { code: "TZS", name: "Tanzanian Shilling", symbol: "TSh" },
  { code: "RWF", name: "Rwandan Franc", symbol: "FRw", zeroDecimal: true },
  { code: "EGP", name: "Egyptian Pound", symbol: "E£" },
  { code: "MAD", name: "Moroccan Dirham", symbol: "DH" },
  { code: "AED", name: "UAE Dirham", symbol: "د.إ" },
  { code: "SAR", name: "Saudi Riyal", symbol: "﷼" },
  { code: "QAR", name: "Qatari Riyal", symbol: "QR" },
  { code: "INR", name: "Indian Rupee", symbol: "₹" },
  { code: "PKR", name: "Pakistani Rupee", symbol: "₨" },
  { code: "BDT", name: "Bangladeshi Taka", symbol: "৳" },
  { code: "LKR", name: "Sri Lankan Rupee", symbol: "Rs" },
  { code: "JPY", name: "Japanese Yen", symbol: "¥", zeroDecimal: true },
  { code: "KRW", name: "South Korean Won", symbol: "₩", zeroDecimal: true },
  { code: "CNY", name: "Chinese Yuan", symbol: "¥" },
  { code: "HKD", name: "Hong Kong Dollar", symbol: "HK$" },
  { code: "SGD", name: "Singapore Dollar", symbol: "S$" },
  { code: "THB", name: "Thai Baht", symbol: "฿" },
  { code: "PHP", name: "Philippine Peso", symbol: "₱" },
  { code: "MYR", name: "Malaysian Ringgit", symbol: "RM" },
  { code: "IDR", name: "Indonesian Rupiah", symbol: "Rp" },
  { code: "VND", name: "Vietnamese Dong", symbol: "₫", zeroDecimal: true },
  { code: "AUD", name: "Australian Dollar", symbol: "A$" },
  { code: "NZD", name: "New Zealand Dollar", symbol: "NZ$" },
  { code: "CAD", name: "Canadian Dollar", symbol: "C$" },
  { code: "MXN", name: "Mexican Peso", symbol: "Mex$" },
  { code: "BRL", name: "Brazilian Real", symbol: "R$" },
  { code: "ARS", name: "Argentine Peso", symbol: "AR$" },
  { code: "CLP", name: "Chilean Peso", symbol: "CLP$", zeroDecimal: true },
  { code: "COP", name: "Colombian Peso", symbol: "COL$" },
  { code: "PEN", name: "Peruvian Sol", symbol: "S/" },
  { code: "CHF", name: "Swiss Franc", symbol: "Fr" },
  { code: "SEK", name: "Swedish Krona", symbol: "kr" },
  { code: "NOK", name: "Norwegian Krone", symbol: "kr" },
  { code: "DKK", name: "Danish Krone", symbol: "kr" },
  { code: "PLN", name: "Polish Zloty", symbol: "zł" },
  { code: "CZK", name: "Czech Koruna", symbol: "Kč" },
  { code: "HUF", name: "Hungarian Forint", symbol: "Ft" },
  { code: "RON", name: "Romanian Leu", symbol: "lei" },
  { code: "TRY", name: "Turkish Lira", symbol: "₺" },
  { code: "ILS", name: "Israeli Shekel", symbol: "₪" },
  { code: "RUB", name: "Russian Ruble", symbol: "₽" },
  { code: "UAH", name: "Ukrainian Hryvnia", symbol: "₴" },
];

function formatMoney(amount, currency) {
  const c = CURRENCIES.find((x) => x.code === currency) || CURRENCIES[0];
  const n = Number(amount || 0);
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: c.code, maximumFractionDigits: c.zeroDecimal ? 0 : 2 }).format(n);
  } catch {
    return `${c.symbol} ${n.toLocaleString()}`;
  }
}

export default function Fund() {
  const { user, loading } = useAuth();
  const { slug } = useParams();
  const plan = PLANS.find((p) => p.slug === slug);
  const [currency, setCurrency] = useState("USD");
  const [amount, setAmount] = useState(plan ? plan.min_investment : 1000);
  const [method, setMethod] = useState("card_and_crypto");
  const [state, setState] = useState({ loading: false, error: "" });

  const currencyMeta = useMemo(() => CURRENCIES.find((c) => c.code === currency) || CURRENCIES[0], [currency]);

  if (loading) return <div className="pt-40 px-12 rb-mono text-sm text-rb-text2">Loading ...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (!plan) return <Navigate to="/plans" replace />;

  const submit = async (e) => {
    e.preventDefault();
    setState({ loading: true, error: "" });
    try {
      const r = await api.post("/checkout/fund", {
        plan_slug: plan.slug,
        amount: Number(amount),
        origin_url: window.location.origin,
        payment_method: method,
        currency: currency.toLowerCase(),
      });
      if (r.data?.url) {
        window.location.href = r.data.url;
      } else {
        setState({ loading: false, error: "No checkout URL received." });
      }
    } catch (err) {
      const msg = err.response?.data?.detail || "Could not start checkout.";
      setState({ loading: false, error: typeof msg === "string" ? msg : "Checkout failed." });
    }
  };

  const isUSD = currency === "USD";

  return (
    <div className="pt-32 md:pt-40 pb-24" data-testid={`fund-page-${plan.slug}`}>
      <div className="max-w-[1100px] mx-auto px-6 md:px-12">
        <Link to={`/plans#${plan.slug}`} className="rb-btn rb-btn-ghost"><span className="rb-line">{"<-"} Back to {plan.name}</span></Link>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 mt-8">
          <div className="lg:col-span-7">
            <div className="rb-mono text-[11px] uppercase tracking-[0.22em] text-rb-text2">Fund Investment</div>
            <h1 className="rb-display text-5xl md:text-6xl text-rb-navy mt-2">{plan.name}</h1>
            <p className="text-rb-text2 mt-4 max-w-md">{plan.tagline}</p>

            <form onSubmit={submit} className="bg-white border border-rb-border p-8 mt-10 space-y-8" data-testid="fund-form">
              <div>
                <label className="rb-label">Currency</label>
                <select
                  className="rb-input rb-mono text-base"
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  data-testid="fund-currency"
                >
                  {CURRENCIES.map((c) => (
                    <option key={c.code} value={c.code}>{c.code} - {c.name} ({c.symbol})</option>
                  ))}
                </select>
                <div className="rb-mono text-[10px] uppercase tracking-[0.18em] text-rb-text2 mt-2">
                  All Stripe-supported currencies. Settles to merchant in {currency}.
                </div>
              </div>

              <div>
                <label className="rb-label">Amount in {currency}</label>
                <input
                  required
                  type="number"
                  min={isUSD ? plan.min_investment : 1}
                  max={isUSD ? plan.max_investment : undefined}
                  step={currencyMeta.zeroDecimal ? "1" : "0.01"}
                  className="rb-input rb-mono text-2xl"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  data-testid="fund-amount"
                />
                <div className="rb-mono text-[10px] uppercase tracking-[0.18em] text-rb-text2 mt-2">
                  {isUSD
                    ? `Min $${plan.min_investment.toLocaleString()} :: Max $${plan.max_investment.toLocaleString()}`
                    : `Minimums shown in USD. Stripe will accept any valid amount in ${currency}.`}
                </div>
              </div>

              <div>
                <div className="rb-label">Payment Method</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {[
                    { v: "card", l: "Card only", sub: "Visa / Mastercard / Amex + Apple Pay / Google Pay", Icon: CreditCard },
                    { v: "crypto", l: "Crypto only", sub: "USDC / ETH / BTC via Stripe Crypto", Icon: Bitcoin },
                    { v: "card_and_crypto", l: "Card or Crypto", sub: "Cards + crypto on checkout", Icon: CreditCard },
                    { v: "all_methods", l: "All payment methods", sub: "Cards, BNPL (Klarna / Afterpay / Affirm), Cash App, ACH, Alipay, Amazon Pay, Crypto", Icon: CreditCard },
                  ].map(({ v, l, sub, Icon }) => (
                    <label key={v} className={`border p-4 cursor-pointer transition-colors ${method === v ? "border-rb-navy bg-rb-bg2" : "border-rb-border hover:border-rb-navy"}`}>
                      <input type="radio" name="method" value={v} checked={method === v} onChange={() => setMethod(v)} className="sr-only" data-testid={`fund-method-${v}`} />
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="rb-mono text-[11px] uppercase tracking-[0.18em] text-rb-navy">{l}</div>
                          <div className="text-xs text-rb-text2 mt-1 leading-snug">{sub}</div>
                        </div>
                        <Icon size={16} strokeWidth={1.2} className="text-rb-gold flex-shrink-0 mt-1" />
                      </div>
                    </label>
                  ))}
                </div>
                {currency !== "USD" && method === "all_methods" && (
                  <div className="rb-mono text-[10px] uppercase tracking-[0.18em] text-rb-text2 mt-2">
                    Note: Some methods (BNPL, Cash App, ACH, Amazon Pay) are USD-only; they will only appear when paying in USD. EUR / GBP / AUD / CAD / NZD / SEK will see Klarna and Afterpay where available.
                  </div>
                )}
              </div>

              {state.error && <div className="text-sm text-rb-alert border border-rb-alert/40 bg-rb-alert/5 px-4 py-3" data-testid="fund-error">{state.error}</div>}

              <button type="submit" disabled={state.loading} className="rb-btn rb-btn-primary" data-testid="fund-submit">
                <span>{state.loading ? "Preparing checkout ..." : "Continue to Secure Checkout"}</span>
                <ArrowRight size={16} />
              </button>

              <div className="rb-mono text-[10px] uppercase tracking-[0.18em] text-rb-text2">
                Secure Stripe Checkout. Cards accepted in {currency}. Crypto via Stripe Crypto where available.
              </div>
            </form>
          </div>

          <div className="lg:col-span-5">
            <div className="bg-rb-bg2 border border-rb-border p-8 sticky top-32">
              <div className="rb-label">Summary</div>
              <div className="mt-4 space-y-4">
                <div className="flex items-baseline justify-between">
                  <span className="text-rb-text2 text-sm">Plan</span>
                  <span className="rb-display text-2xl text-rb-navy">{plan.name}</span>
                </div>
                <div className="flex items-baseline justify-between">
                  <span className="text-rb-text2 text-sm">Target Return</span>
                  <span className="rb-mono text-rb-navy">{formatPlanReturn(plan)}</span>
                </div>
                <div className="flex items-baseline justify-between">
                  <span className="text-rb-text2 text-sm">Lock In</span>
                  <span className="rb-mono text-rb-navy">{plan.duration_months} mo</span>
                </div>
                <div className="flex items-baseline justify-between">
                  <span className="text-rb-text2 text-sm">Management Fee</span>
                  <span className="rb-mono text-rb-navy">{plan.management_fee}%</span>
                </div>
                <div className="flex items-baseline justify-between">
                  <span className="text-rb-text2 text-sm">Currency</span>
                  <span className="rb-mono text-rb-navy">{currency}</span>
                </div>
                <div className="rb-hr" />
                <div className="flex items-baseline justify-between">
                  <span className="text-rb-text2 text-sm">Funding Amount</span>
                  <span className="rb-mono text-2xl text-rb-navy">{formatMoney(amount, currency)}</span>
                </div>
              </div>
              <p className="text-xs text-rb-text2 mt-6">
                Funds are held with our tier 1 custody partner upon clearance. Past performance does not guarantee future results.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
