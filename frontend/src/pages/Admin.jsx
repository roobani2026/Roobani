import React, { useEffect, useState } from "react";
import { Navigate, Link } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { api } from "../lib/api";
import { Users, Inbox, Wallet, DollarSign } from "lucide-react";

function fmtMoney(n) { return `$${Number(n || 0).toLocaleString("en-US", { maximumFractionDigits: 0 })}`; }

export default function Admin() {
  const { user, loading } = useAuth();
  const [data, setData] = useState({ stats: null, leads: [], contacts: [] });
  const [tab, setTab] = useState("leads");

  useEffect(() => {
    if (!user?.is_admin) return;
    (async () => {
      try {
        const [s, l, c] = await Promise.all([
          api.get("/admin/stats"),
          api.get("/admin/leads"),
          api.get("/admin/contacts"),
        ]);
        setData({ stats: s.data, leads: l.data.items || [], contacts: c.data.items || [] });
      } catch (e) { /* silent */ }
    })();
  }, [user]);

  if (loading) return <div className="pt-40 px-12 rb-mono text-sm text-rb-text2">Loading ...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (!user.is_admin) {
    return (
      <div className="pt-40 px-12 text-center" data-testid="admin-forbidden">
        <div className="rb-display text-4xl text-rb-navy">Restricted area.</div>
        <p className="text-rb-text2 mt-3">Your account does not have admin privileges.</p>
        <Link to="/dashboard" className="rb-btn rb-btn-secondary mt-8 inline-flex"><span>Back to Dashboard</span></Link>
      </div>
    );
  }

  const s = data.stats || {};

  return (
    <div data-testid="admin-page" className="pt-32 md:pt-40 pb-24">
      <div className="max-w-[1400px] mx-auto px-6 md:px-12">
        <div className="rb-mono text-[11px] uppercase tracking-[0.22em] text-rb-text2">Admin :: Roobani</div>
        <h1 className="rb-display text-5xl md:text-6xl text-rb-navy mt-2">Funnel and inbox.</h1>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-rb-border border border-rb-border mt-10">
          {[
            { Icon: Inbox, label: "Leads", value: s.leads },
            { Icon: Users, label: "Users", value: s.users },
            { Icon: Wallet, label: "Holdings", value: s.holdings },
            { Icon: DollarSign, label: "Invested", value: fmtMoney(s.total_invested_usd) },
          ].map(({ Icon, label, value }) => (
            <div key={label} className="bg-white p-6 md:p-8">
              <div className="flex items-center justify-between">
                <Icon size={18} strokeWidth={1.2} className="text-rb-gold" />
                <div className="rb-label">{label}</div>
              </div>
              <div className="rb-mono text-3xl md:text-4xl text-rb-navy mt-3">{value ?? "0"}</div>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-6 mt-12 border-b border-rb-border">
          {[{ k: "leads", l: `Leads (${data.leads.length})` }, { k: "contacts", l: `Contacts (${data.contacts.length})` }].map((t) => (
            <button
              key={t.k}
              onClick={() => setTab(t.k)}
              data-testid={`admin-tab-${t.k}`}
              className={`pb-3 rb-mono text-[11px] uppercase tracking-[0.18em] border-b-2 -mb-px transition-colors ${
                tab === t.k ? "text-rb-navy border-rb-navy" : "text-rb-text2 border-transparent hover:text-rb-navy"
              }`}
            >
              {t.l}
            </button>
          ))}
        </div>

        {tab === "leads" && (
          <div className="overflow-x-auto mt-6 border border-rb-border" data-testid="admin-leads-table">
            <table className="w-full text-sm">
              <thead className="bg-rb-bg2">
                <tr>
                  {["Name", "Email", "Phone", "Budget", "Goal", "Contact", "Source", "When"].map((h) => (
                    <th key={h} className="text-left p-3 rb-mono uppercase text-[10px] tracking-[0.18em] text-rb-text2 border-r border-rb-border last:border-r-0">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.leads.length === 0 && <tr><td colSpan={8} className="p-8 text-center text-rb-text2">No leads yet.</td></tr>}
                {data.leads.map((l) => (
                  <tr key={l.lead_id} className="border-t border-rb-border">
                    <td className="p-3">{l.full_name}</td>
                    <td className="p-3 rb-mono text-xs text-rb-navy">{l.email}</td>
                    <td className="p-3 rb-mono text-xs">{l.phone}</td>
                    <td className="p-3 rb-mono text-xs">{l.budget_range}</td>
                    <td className="p-3 text-xs">{l.investment_goal}</td>
                    <td className="p-3 rb-mono text-xs">{l.preferred_contact}</td>
                    <td className="p-3 rb-mono text-xs">{l.source_page}</td>
                    <td className="p-3 rb-mono text-xs text-rb-text2">{(l.created_at || "").slice(0, 16).replace("T", " ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {tab === "contacts" && (
          <div className="overflow-x-auto mt-6 border border-rb-border" data-testid="admin-contacts-table">
            <table className="w-full text-sm">
              <thead className="bg-rb-bg2">
                <tr>
                  {["Name", "Email", "Subject", "Message", "When"].map((h) => (
                    <th key={h} className="text-left p-3 rb-mono uppercase text-[10px] tracking-[0.18em] text-rb-text2 border-r border-rb-border last:border-r-0">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.contacts.length === 0 && <tr><td colSpan={5} className="p-8 text-center text-rb-text2">No contacts yet.</td></tr>}
                {data.contacts.map((c) => (
                  <tr key={c.contact_id} className="border-t border-rb-border">
                    <td className="p-3">{c.name}</td>
                    <td className="p-3 rb-mono text-xs text-rb-navy">{c.email}</td>
                    <td className="p-3 text-xs">{c.subject}</td>
                    <td className="p-3 text-xs max-w-md truncate" title={c.message}>{c.message}</td>
                    <td className="p-3 rb-mono text-xs text-rb-text2">{(c.created_at || "").slice(0, 16).replace("T", " ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
