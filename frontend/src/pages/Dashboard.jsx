import React, { useEffect, useState } from "react";
import { Navigate, Link, useSearchParams, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { useCurrency } from "../lib/currency";
import { api } from "../lib/api";
import { PLANS, formatPlanReturn } from "../data/plans";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, PieChart, Pie, Cell } from "recharts";
import { LogOut, Mail, Check, AlertCircle, ArrowUpRight, Plus, ArrowDownToLine, Wallet } from "lucide-react";
import DashboardLiveMarket from "../components/DashboardLiveMarket";
import AddFundsModal from "../components/AddFundsModal";

function fmtMoney(n) {
  return `$${Number(n || 0).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

function EmailVerifyBanner({ user, onResent }) {
  const [state, setState] = useState({ sending: false, sent: false, devToken: "" });
  if (user.email_verified) return null;
  const resend = async () => {
    setState({ sending: true, sent: false, devToken: "" });
    try {
      const r = await api.post("/auth/email/verify/request");
      setState({ sending: false, sent: true, devToken: r.data?.dev_token || "" });
      onResent?.();
    } catch (e) {
      setState({ sending: false, sent: false, devToken: "" });
    }
  };
  return (
    <div className="border border-rb-gold bg-rb-gold/10 p-5 md:p-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4 mt-6" data-testid="email-verify-banner">
      <div className="flex items-start gap-3">
        <Mail size={20} className="text-rb-navy mt-0.5" strokeWidth={1.4} />
        <div>
          <div className="rb-display text-lg text-rb-navy">Verify your email.</div>
          <p className="text-sm text-rb-text2">Confirm {user.email} to enable withdrawals and reports.</p>
        </div>
      </div>
      <div className="flex flex-col items-start md:items-end gap-2">
        {state.sent ? (
          <div className="text-sm text-rb-success rb-mono uppercase tracking-[0.18em] text-[10px]">Verification email sent.</div>
        ) : (
          <button onClick={resend} disabled={state.sending} className="rb-btn rb-btn-secondary" data-testid="resend-verification">
            <span>{state.sending ? "Sending ..." : "Resend Verification"}</span>
          </button>
        )}
        {state.devToken && (
          <Link to={`/auth/verify?token=${state.devToken}`} className="rb-mono text-[10px] uppercase tracking-[0.18em] text-rb-navy rb-underline" data-testid="dev-verify-link">
            Dev verify link
          </Link>
        )}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { user, loading, logout, refresh } = useAuth();
  const { formatMoney, currency } = useCurrency();
  const nav = useNavigate();
  const handleLogout = async () => { await logout(); nav("/", { replace: true }); };
  const [holdings, setHoldings] = useState({ items: [], total_invested: 0 });
  const [paymentNotice, setPaymentNotice] = useState({ status: "", error: "", amount: 0, plan: "" });
  const [params, setParams] = useSearchParams();
  const fundSessionId = params.get("fund_session_id");
  const [addFundsOpen, setAddFundsOpen] = useState(false);

  // Allow other pages to open Add Funds via `?add=1` (used by sub-nav link).
  useEffect(() => {
    if (params.get("add") === "1") {
      setAddFundsOpen(true);
      const next = new URLSearchParams(params);
      next.delete("add");
      setParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const r = await api.get("/holdings");
        setHoldings(r.data);
      } catch (e) { /* silent */ }
    })();
  }, [user]);

  useEffect(() => {
    if (!fundSessionId || !user) return;
    let attempts = 0;
    let stopped = false;
    const poll = async () => {
      if (stopped) return;
      attempts += 1;
      try {
        const r = await api.get(`/checkout/status/${fundSessionId}`);
        const data = r.data;
        if (data.payment_status === "paid") {
          setPaymentNotice({ status: "paid", error: "", amount: data.amount, plan: data.plan_slug });
          // refresh holdings
          try { const h = await api.get("/holdings"); setHoldings(h.data); } catch (e) { /* ignore */ }
          window.history.replaceState({}, "", "/dashboard");
          return;
        }
        if (data.status === "expired") {
          setPaymentNotice({ status: "expired", error: "Checkout session expired.", amount: 0, plan: "" });
          return;
        }
      } catch (err) {
        // 404 means transaction not found (different user). Stop.
        setPaymentNotice({ status: "error", error: "Could not verify payment.", amount: 0, plan: "" });
        return;
      }
      if (attempts < 6) setTimeout(poll, 2000);
      else setPaymentNotice({ status: "timeout", error: "Status check timed out. Refresh in a moment.", amount: 0, plan: "" });
    };
    setPaymentNotice({ status: "pending", error: "", amount: 0, plan: "" });
    poll();
    return () => { stopped = true; };
  }, [fundSessionId, user]);

  if (loading) return <div className="pt-40 px-12 rb-mono text-sm text-rb-text2" data-testid="dashboard-loading">Loading ...</div>;
  if (!user) return <Navigate to="/login" replace />;

  // Build allocation pie data from holdings
  const allocByPlan = holdings.items.reduce((acc, h) => {
    acc[h.plan_slug] = (acc[h.plan_slug] || 0) + Number(h.amount || 0);
    return acc;
  }, {});
  const palette = { foundation: "#1A1F3D", growth: "#C9A84C", accelerator: "#2A9D8F", elite: "#3A7D5C" };
  const pie = Object.entries(allocByPlan).map(([slug, v]) => ({ name: PLANS.find((p) => p.slug === slug)?.name || slug, value: v, color: palette[slug] }));

  // Build trajectory: cumulative invested timeline
  const sorted = [...holdings.items].sort((a, b) => (a.created_at || "").localeCompare(b.created_at || ""));
  const trajectory = sorted.length === 0
    ? Array.from({ length: 12 }, (_, i) => ({ x: `M${i + 1}`, v: 0 }))
    : sorted.map((h, i) => ({ x: (h.created_at || "").slice(0, 10), v: sorted.slice(0, i + 1).reduce((s, x) => s + Number(x.amount), 0) }));

  return (
    <div data-testid="dashboard-page" className="pt-6 md:pt-10 pb-24">
      <div className="max-w-[1400px] mx-auto px-6 md:px-12">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-6">
          <div>
            <div className="rb-mono text-[11px] uppercase tracking-[0.22em] text-rb-text2">Investor Dashboard</div>
            <h1 className="rb-display text-5xl md:text-6xl text-rb-navy mt-2">Welcome, {user.full_name?.split(" ")[0] || "Investor"}.</h1>
            <div className="rb-mono text-[11px] uppercase tracking-[0.18em] text-rb-text2 mt-3">
              Signed in via {user.auth_provider} :: {user.email}
              {user.is_admin && <span className="ml-3 text-rb-gold">:: ADMIN</span>}
            </div>
          </div>
          <div className="flex gap-3">
            {user.is_admin && (
              <Link to="/admin" className="rb-btn rb-btn-secondary" data-testid="dashboard-admin-link"><span>Admin</span></Link>
            )}
            <button onClick={handleLogout} className="rb-btn rb-btn-secondary" data-testid="dashboard-logout">
              <LogOut size={14} /><span>Sign Out</span>
            </button>
          </div>
        </div>

        <EmailVerifyBanner user={user} onResent={refresh} />

        {paymentNotice.status === "paid" && (
          <div className="border border-rb-success bg-rb-success/10 p-5 md:p-6 mt-6 flex items-center gap-3" data-testid="payment-success">
            <Check size={20} className="text-rb-success" />
            <div>
              <div className="rb-display text-lg text-rb-navy">Funding complete.</div>
              <div className="text-sm text-rb-text2">Funded {formatMoney(paymentNotice.amount)} to {paymentNotice.plan}. Your holding is now live.</div>
            </div>
          </div>
        )}
        {paymentNotice.status === "pending" && (
          <div className="border border-rb-border bg-white p-5 mt-6 rb-mono text-[11px] uppercase tracking-[0.18em] text-rb-text2" data-testid="payment-pending">
            Confirming your payment ...
          </div>
        )}
        {paymentNotice.error && (
          <div className="border border-rb-alert bg-rb-alert/5 p-5 mt-6 flex items-center gap-3" data-testid="payment-error">
            <AlertCircle size={20} className="text-rb-alert" />
            <span className="text-sm text-rb-alert">{paymentNotice.error}</span>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-8">
          {/* Wallet hero card */}
          <div className="lg:col-span-2 bg-rb-navy text-rb-on-navy p-8 md:p-10 relative overflow-hidden" data-testid="wallet-card">
            <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ background: "radial-gradient(circle at 90% 10%, var(--rb-gold) 0%, transparent 60%)" }} />
            <div className="relative">
              <div className="flex items-center gap-2 rb-mono text-[10px] uppercase tracking-[0.22em] text-rb-gold">
                <Wallet size={12} strokeWidth={1.6} />
                <span>Wallet Balance</span>
              </div>
              <div className="rb-mono text-5xl md:text-6xl mt-3 tracking-tight" data-testid="wallet-balance">
                {formatMoney(holdings.total_invested)}
              </div>
              <div className="rb-mono text-[11px] uppercase tracking-[0.18em] text-rb-on-navy/70 mt-2">
                {holdings.items.length} active holding{holdings.items.length === 1 ? "" : "s"} :: settled {currency}
              </div>

              <div className="flex flex-wrap gap-3 mt-8">
                <button
                  type="button"
                  onClick={() => setAddFundsOpen(true)}
                  className="inline-flex items-center gap-2 bg-rb-gold text-rb-navy px-5 py-3 rb-mono text-[11px] uppercase tracking-[0.18em] hover:bg-rb-on-navy transition-colors"
                  data-testid="dashboard-add-funds"
                >
                  <Plus size={14} strokeWidth={2} />
                  <span>Add Funds</span>
                </button>
                <Link
                  to="/dashboard/withdraw"
                  className="inline-flex items-center gap-2 border border-rb-on-navy/30 text-rb-on-navy px-5 py-3 rb-mono text-[11px] uppercase tracking-[0.18em] hover:border-rb-gold hover:text-rb-gold transition-colors"
                  data-testid="dashboard-withdraw"
                >
                  <ArrowDownToLine size={14} strokeWidth={1.6} />
                  <span>Withdraw</span>
                </Link>
                <Link
                  to="/plans"
                  className="inline-flex items-center gap-2 text-rb-on-navy/80 hover:text-rb-on-navy px-3 py-3 rb-mono text-[11px] uppercase tracking-[0.18em] transition-colors"
                  data-testid="dashboard-explore-plans"
                >
                  <span>Explore Plans</span>
                  <ArrowUpRight size={12} />
                </Link>
              </div>
            </div>
          </div>

          {/* Right column: status stack */}
          <div className="flex flex-col gap-6">
            <div className="bg-white border border-rb-border p-6">
              <div className="rb-label">Account Status</div>
              <div className="rb-mono text-2xl text-rb-navy mt-1">{user.email_verified ? "Verified" : "Pending"}</div>
              <div className="rb-mono text-[11px] uppercase tracking-[0.18em] text-rb-text2 mt-2">Email verification</div>
              {!user.email_verified && (
                <div className="rb-mono text-[10px] uppercase tracking-[0.18em] text-rb-alert mt-2">
                  Verify to enable withdrawals
                </div>
              )}
            </div>
            <div className="bg-white border border-rb-border p-6">
              <div className="rb-label">Holdings</div>
              <div className="rb-mono text-2xl text-rb-navy mt-1">{holdings.items.length}</div>
              <div className="rb-mono text-[11px] uppercase tracking-[0.18em] text-rb-text2 mt-2">
                {holdings.items.length === 0 ? "Fund a plan to start" : `Across ${new Set(holdings.items.map((h) => h.plan_slug)).size} plan${new Set(holdings.items.map((h) => h.plan_slug)).size === 1 ? "" : "s"}`}
              </div>
            </div>
          </div>
        </div>

        <DashboardLiveMarket />

        <AddFundsModal open={addFundsOpen} onClose={() => setAddFundsOpen(false)} />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
          <div className="bg-white border border-rb-border p-6 md:p-8">
            <div className="flex items-baseline justify-between mb-4">
              <h2 className="rb-display text-2xl text-rb-navy">Cumulative Invested</h2>
              <div className="rb-mono text-[11px] uppercase tracking-[0.18em] text-rb-text2">timeline</div>
            </div>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                <LineChart data={trajectory} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <XAxis dataKey="x" stroke="#6B6B6B" tick={{ fontFamily: "JetBrains Mono", fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis stroke="#6B6B6B" tick={{ fontFamily: "JetBrains Mono", fontSize: 10 }} axisLine={false} tickLine={false} width={48} />
                  <Tooltip contentStyle={{ background: "#fff", border: "1px solid #E0DDD5", borderRadius: 0, fontFamily: "JetBrains Mono", fontSize: 12 }} />
                  <Line type="monotone" dataKey="v" stroke="#1A1F3D" strokeWidth={1.6} dot={{ r: 2, fill: "#C9A84C" }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-white border border-rb-border p-6 md:p-8">
            <div className="flex items-baseline justify-between mb-4">
              <h2 className="rb-display text-2xl text-rb-navy">Allocation by Plan</h2>
              <div className="rb-mono text-[11px] uppercase tracking-[0.18em] text-rb-text2">target</div>
            </div>
            <div className="h-56">
              {pie.length === 0 ? (
                <div className="h-full flex items-center justify-center text-rb-text2 text-sm">No holdings yet. Fund a plan to begin.</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                  <PieChart>
                    <Pie data={pie} dataKey="value" nameKey="name" innerRadius={50} outerRadius={88} strokeWidth={1}>
                      {pie.map((a, i) => <Cell key={i} fill={a.color} stroke="#FAFAF8" />)}
                    </Pie>
                    <Tooltip contentStyle={{ background: "#fff", border: "1px solid #E0DDD5", borderRadius: 0, fontFamily: "JetBrains Mono", fontSize: 12 }} formatter={(v) => formatMoney(v)} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </div>

        <div className="bg-rb-bg2 border border-rb-border p-6 md:p-8 mt-6" data-testid="dashboard-holdings">
          <div className="flex items-end justify-between mb-6">
            <h2 className="rb-display text-2xl text-rb-navy">Your Holdings</h2>
            <Link to="/plans" className="rb-btn rb-btn-ghost"><span className="rb-line">Add holding</span></Link>
          </div>
          {holdings.items.length === 0 ? (
            <div className="bg-white border border-rb-border p-10 text-center">
              <div className="rb-display text-2xl text-rb-navy">No holdings yet.</div>
              <p className="text-rb-text2 mt-3 text-sm">Pick a plan, fund it, and watch it grow. You can fund via card or crypto.</p>
              <Link to="/plans" className="rb-btn rb-btn-primary mt-6 inline-flex" data-testid="empty-fund-cta"><span>Browse Plans</span></Link>
            </div>
          ) : (
            <div className="overflow-x-auto bg-white border border-rb-border">
              <table className="w-full text-sm">
                <thead className="bg-rb-bg2">
                  <tr>
                    {["Plan", "Amount", "Currency", "Funded", "Status"].map((h) => (
                      <th key={h} className="text-left p-3 rb-mono uppercase text-[10px] tracking-[0.18em] text-rb-text2 border-r border-rb-border last:border-r-0">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {holdings.items.map((h) => {
                    const plan = PLANS.find((p) => p.slug === h.plan_slug);
                    return (
                      <tr key={h.holding_id} className="border-t border-rb-border">
                        <td className="p-3"><div className="rb-display text-lg text-rb-navy">{plan?.name || h.plan_slug}</div>{plan && <div className="text-xs text-rb-text2">{formatPlanReturn(plan)}</div>}</td>
                        <td className="p-3 rb-mono text-rb-navy">{formatMoney(h.amount)}</td>
                        <td className="p-3 rb-mono text-xs uppercase">{currency}</td>
                        <td className="p-3 rb-mono text-xs text-rb-text2">{(h.created_at || "").slice(0, 10)}</td>
                        <td className="p-3 rb-mono text-xs text-rb-success">Active</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="mt-6 bg-white border border-rb-border p-8">
          <div className="flex items-end justify-between mb-6">
            <h2 className="rb-display text-2xl text-rb-navy">Fund a Plan</h2>
            <Link to="/plans" className="rb-btn rb-btn-ghost"><span className="rb-line">Compare All Plans</span></Link>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {PLANS.map((p) => (
              <Link key={p.slug} to={`/fund/${p.slug}`} className="rb-card p-5 bg-white block" data-testid={`dashboard-fund-${p.slug}`}>
                <div className="rb-display text-2xl text-rb-navy">{p.name}</div>
                <div className="rb-mono text-sm text-rb-text2 mt-1">{formatPlanReturn(p)}</div>
                <div className="rb-mono text-[10px] uppercase tracking-[0.18em] text-rb-text2 mt-3">From {formatMoney(p.min_investment)}</div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
