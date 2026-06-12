import React, { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { ArrowUpRight, ArrowDownRight, Filter } from "lucide-react";

function fmtAmt(n, ccy) {
  const v = Number(n || 0);
  try { return new Intl.NumberFormat(undefined, { style: "currency", currency: ccy || "USD", maximumFractionDigits: 2 }).format(v); }
  catch { return `${(ccy || "USD")} ${v.toLocaleString()}`; }
}

const STATUS_STYLES = {
  paid: "text-rb-success",
  approved: "text-rb-success",
  pending: "text-rb-gold",
  initiated: "text-rb-gold",
  rejected: "text-rb-alert",
  failed: "text-rb-alert",
  expired: "text-rb-alert",
  complete: "text-rb-success",
};

export default function Transactions() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all"); // all | deposit | withdrawal
  const [statusFilter, setStatusFilter] = useState("all");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const r = await api.get("/transactions", { params: { kind: filter === "all" ? "" : filter, limit: 200 } });
        if (!cancelled) setItems(r.data?.items || []);
      } catch (e) {
        if (!cancelled) setError(e.response?.data?.detail || "Failed to load transactions.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [filter]);

  const filtered = useMemo(() => {
    if (statusFilter === "all") return items;
    return items.filter((x) => (x.status || "").toLowerCase() === statusFilter);
  }, [items, statusFilter]);

  return (
    <div className="max-w-[1400px] mx-auto px-6 md:px-12 py-10" data-testid="page-transactions">
      <div className="flex items-end justify-between mb-6">
        <div>
          <div className="rb-mono text-[11px] uppercase tracking-[0.22em] text-rb-text2">Activity</div>
          <h1 className="rb-display text-4xl md:text-5xl text-rb-navy mt-2">Transactions</h1>
        </div>
        <div className="rb-mono text-[11px] uppercase tracking-[0.18em] text-rb-text2">{filtered.length} record{filtered.length === 1 ? "" : "s"}</div>
      </div>

      <div className="bg-white border border-rb-border p-4 md:p-6 mb-6 flex flex-col md:flex-row md:items-center gap-4">
        <div className="flex items-center gap-2 text-rb-text2"><Filter size={14} /><span className="rb-mono text-[11px] uppercase tracking-[0.18em]">Filters</span></div>
        <div className="flex flex-wrap gap-2">
          {[
            { v: "all", l: "All" }, { v: "deposit", l: "Deposits" }, { v: "withdrawal", l: "Withdrawals" },
          ].map(({ v, l }) => (
            <button key={v} onClick={() => setFilter(v)} data-testid={`tx-filter-${v}`}
              className={`px-3 py-1.5 rb-mono text-[10px] uppercase tracking-[0.18em] border ${filter === v ? "border-rb-navy bg-rb-navy text-rb-bg" : "border-rb-border text-rb-text2 hover:border-rb-navy"}`}>{l}</button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2 md:ml-auto">
          {["all", "paid", "approved", "pending", "rejected", "failed"].map((v) => (
            <button key={v} onClick={() => setStatusFilter(v)} data-testid={`tx-status-${v}`}
              className={`px-3 py-1.5 rb-mono text-[10px] uppercase tracking-[0.18em] border ${statusFilter === v ? "border-rb-gold text-rb-navy" : "border-rb-border text-rb-text2 hover:border-rb-navy"}`}>{v}</button>
          ))}
        </div>
      </div>

      {error && <div className="border border-rb-alert bg-rb-alert/5 p-4 text-rb-alert text-sm mb-4" data-testid="tx-error">{error}</div>}

      <div className="bg-white border border-rb-border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-rb-bg2">
            <tr>
              {["Type", "Amount", "Currency", "Status", "Plan / Destination", "Reference", "Date"].map((h) => (
                <th key={h} className="text-left p-3 rb-mono uppercase text-[10px] tracking-[0.18em] text-rb-text2 border-r border-rb-border last:border-r-0">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="p-8 text-center rb-mono text-[11px] text-rb-text2" data-testid="tx-loading">Loading ...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={7} className="p-10 text-center" data-testid="tx-empty">
                <div className="rb-display text-2xl text-rb-navy">No transactions yet.</div>
                <p className="text-rb-text2 mt-2 text-sm">Fund a plan or submit a withdrawal to see activity here.</p>
              </td></tr>
            ) : filtered.map((t) => {
              const isDep = t.type === "deposit";
              return (
                <tr key={`${t.type}-${t.id}`} className="border-t border-rb-border" data-testid={`tx-row-${t.id}`}>
                  <td className="p-3">
                    <div className={`inline-flex items-center gap-2 rb-mono text-[11px] uppercase tracking-[0.18em] ${isDep ? "text-rb-success" : "text-rb-navy"}`}>
                      {isDep ? <ArrowDownRight size={14} /> : <ArrowUpRight size={14} />} {t.type}
                    </div>
                  </td>
                  <td className="p-3 rb-mono text-rb-navy">{fmtAmt(t.amount, t.currency)}</td>
                  <td className="p-3 rb-mono text-xs uppercase">{t.currency}</td>
                  <td className={`p-3 rb-mono text-xs uppercase ${STATUS_STYLES[(t.status || "").toLowerCase()] || "text-rb-text2"}`}>{t.status}</td>
                  <td className="p-3 rb-mono text-xs text-rb-text2">{t.plan_slug || t.destination_type || "-"}</td>
                  <td className="p-3 rb-mono text-[10px] text-rb-text2 break-all max-w-[180px]">{t.ref}</td>
                  <td className="p-3 rb-mono text-xs text-rb-text2 whitespace-nowrap">{(t.created_at || "").slice(0, 19).replace("T", " ")}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
