import React, { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { api } from "../../lib/api";
import { useAdminAuth } from "../../lib/adminAuth";
import { toast } from "sonner";

export default function AdminCustomerDetail() {
  const { id } = useParams();
  const { admin } = useAdminAuth();
  const isSuper = admin?.access_level === 0;
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [managers, setManagers] = useState([]);
  const [form, setForm] = useState({ plan_slug: "", kyc_status: "pending", notes: "", blocked: false });
  const [adj, setAdj] = useState({ plan_slug: "foundation", amount: "", reason: "" });
  const [wd, setWd] = useState({ amount: "", reason: "", bank_beneficiary: "" });
  const [assignTo, setAssignTo] = useState("");

  const load = async () => {
    try { const r = await api.get(`/admin/customers/${id}`); setData(r.data); const c = r.data.customer; setForm({ plan_slug: c.plan_slug || "", kyc_status: c.kyc_status || "pending", notes: c.notes || "", blocked: !!c.blocked }); setAssignTo(c.manager?.admin_id || ""); }
    catch (e) { toast.error(e?.response?.data?.detail || "Failed to load"); }
  };
  useEffect(() => { load(); if (isSuper) api.get("/admin/admins").then(r => setManagers(r.data.items.filter(a => a.access_level === 1 && a.active))).catch(() => {}); }, [id]);

  const save = async () => {
    try {
      const body = {};
      if (form.plan_slug) body.plan_slug = form.plan_slug;
      body.kyc_status = form.kyc_status;
      body.notes = form.notes;
      body.blocked = form.blocked;
      await api.patch(`/admin/customers/${id}`, body);
      toast.success("Customer updated");
      load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Update failed"); }
  };
  const assign = async () => {
    try { await api.post(`/admin/customers/${id}/assign`, { manager_admin_id: assignTo || null }); toast.success("Assignment updated"); load(); }
    catch (e) { toast.error(e?.response?.data?.detail || "Assignment failed"); }
  };
  const adjust = async () => {
    try { await api.post(`/admin/customers/${id}/holdings/adjust`, { plan_slug: adj.plan_slug, amount: parseFloat(adj.amount), reason: adj.reason }); toast.success("Holding adjusted"); setAdj({ plan_slug: "foundation", amount: "", reason: "" }); load(); }
    catch (e) { toast.error(e?.response?.data?.detail || "Adjust failed"); }
  };
  const requestWd = async () => {
    try { await api.post(`/admin/withdrawals`, { customer_user_id: id, amount: parseFloat(wd.amount), reason: wd.reason, bank_beneficiary: wd.bank_beneficiary }); toast.success(isSuper ? "Withdrawal recorded and approved" : "Withdrawal requested. Pending Access 0 approval."); setWd({ amount: "", reason: "", bank_beneficiary: "" }); }
    catch (e) { toast.error(e?.response?.data?.detail || "Withdrawal failed"); }
  };

  if (!data) return <div className="p-12 font-mono text-xs tracking-[0.2em] uppercase text-[#6B6B6B]">Loading...</div>;
  const c = data.customer;
  return (
    <div className="p-10">
      <Link to="/admin/customers" className="text-[11px] tracking-[0.2em] uppercase font-mono text-[#6B6B6B] hover:text-[#1A1F3D]">&larr; Back to customers</Link>
      <div className="flex items-end justify-between mt-3 mb-8">
        <div>
          <h1 className="font-serif text-5xl tracking-tight text-[#1C1C1E]">{c.full_name}</h1>
          <div className="font-mono text-xs text-[#6B6B6B] mt-2">{c.email}  /  {c.user_id}</div>
        </div>
        <div className="text-right">
          <div className="text-[10px] tracking-[0.25em] uppercase font-mono text-[#6B6B6B]">Total Invested</div>
          <div className="font-mono text-3xl tracking-tight text-[#1C1C1E] mt-1">${c.total_invested.toLocaleString()}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="border border-[#E0DDD5] bg-white p-8">
          <h2 className="font-serif text-2xl tracking-tight mb-6">Profile & status</h2>
          <div className="space-y-5">
            <div>
              <label className="block text-[10px] tracking-[0.25em] uppercase font-mono text-[#6B6B6B] mb-2">Plan</label>
              <select data-testid="plan-select" value={form.plan_slug} onChange={(e) => setForm({ ...form, plan_slug: e.target.value })} className="w-full px-3 py-2.5 border border-[#E0DDD5] bg-white outline-none focus:border-[#1A1F3D] text-sm">
                <option value="">(none)</option>
                <option value="foundation">Foundation</option>
                <option value="growth">Growth</option>
                <option value="accelerator">Accelerator</option>
                <option value="elite">Elite</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] tracking-[0.25em] uppercase font-mono text-[#6B6B6B] mb-2">KYC Status</label>
              <select data-testid="kyc-select" value={form.kyc_status} onChange={(e) => setForm({ ...form, kyc_status: e.target.value })} className="w-full px-3 py-2.5 border border-[#E0DDD5] bg-white outline-none focus:border-[#1A1F3D] text-sm">
                <option value="pending">Pending</option>
                <option value="verified">Verified</option>
                <option value="rejected">Rejected</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] tracking-[0.25em] uppercase font-mono text-[#6B6B6B] mb-2">Notes</label>
              <textarea data-testid="notes-input" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} className="w-full px-3 py-2.5 border border-[#E0DDD5] bg-white outline-none focus:border-[#1A1F3D] text-sm" />
            </div>
            <label className="flex items-center gap-3 cursor-pointer">
              <input data-testid="block-toggle" type="checkbox" checked={form.blocked} onChange={(e) => setForm({ ...form, blocked: e.target.checked })} />
              <span className="text-sm">Block customer account</span>
            </label>
            <button data-testid="save-customer" onClick={save} className="px-6 py-3 text-white text-xs tracking-[0.2em] uppercase font-mono" style={{ background: "#1A1F3D" }}>Save changes</button>
          </div>
        </div>

        {isSuper && (
          <div className="border border-[#E0DDD5] bg-white p-8">
            <h2 className="font-serif text-2xl tracking-tight mb-6">Account manager</h2>
            <div className="mb-4 text-sm text-[#6B6B6B]">Current: <strong className="text-[#1C1C1E]">{c.manager?.full_name || "Unassigned"}</strong></div>
            <select data-testid="assign-select" value={assignTo} onChange={(e) => setAssignTo(e.target.value)} className="w-full px-3 py-2.5 border border-[#E0DDD5] bg-white outline-none focus:border-[#1A1F3D] text-sm mb-4">
              <option value="">(Unassign)</option>
              {managers.map((m) => <option key={m.admin_id} value={m.admin_id}>{m.full_name} - {m.email}</option>)}
            </select>
            <button data-testid="assign-btn" onClick={assign} className="px-6 py-3 text-white text-xs tracking-[0.2em] uppercase font-mono" style={{ background: "#1A1F3D" }}>Update assignment</button>
          </div>
        )}

        <div className="border border-[#E0DDD5] bg-white p-8">
          <h2 className="font-serif text-2xl tracking-tight mb-6">Adjust holding</h2>
          <div className="space-y-4">
            <select value={adj.plan_slug} onChange={(e) => setAdj({ ...adj, plan_slug: e.target.value })} className="w-full px-3 py-2.5 border border-[#E0DDD5] bg-white text-sm">
              <option value="foundation">Foundation</option>
              <option value="growth">Growth</option>
              <option value="accelerator">Accelerator</option>
              <option value="elite">Elite</option>
            </select>
            <input data-testid="adj-amount" placeholder="Amount (negative to deduct)" value={adj.amount} onChange={(e) => setAdj({ ...adj, amount: e.target.value })} className="w-full px-3 py-2.5 border border-[#E0DDD5] bg-white text-sm" />
            <input data-testid="adj-reason" placeholder="Reason" value={adj.reason} onChange={(e) => setAdj({ ...adj, reason: e.target.value })} className="w-full px-3 py-2.5 border border-[#E0DDD5] bg-white text-sm" />
            <button data-testid="adj-btn" onClick={adjust} className="px-6 py-3 text-xs tracking-[0.2em] uppercase font-mono border border-[#1A1F3D] text-[#1A1F3D] hover:bg-[#1A1F3D] hover:text-white transition-colors">Record adjustment</button>
          </div>
        </div>

        <div className="border border-[#E0DDD5] bg-white p-8">
          <h2 className="font-serif text-2xl tracking-tight mb-6">{isSuper ? "Process withdrawal" : "Request withdrawal"}</h2>
          <div className="text-xs text-[#6B6B6B] mb-4 leading-relaxed">{isSuper ? "As Access 0 you can record + auto-approve a withdrawal. Payout to bank beneficiary fires in Phase 5." : "Submit a withdrawal request. An Access 0 super admin must approve before payout fires (Phase 5)."}</div>
          <div className="space-y-4">
            <input data-testid="wd-amount" placeholder="Amount (USD)" value={wd.amount} onChange={(e) => setWd({ ...wd, amount: e.target.value })} className="w-full px-3 py-2.5 border border-[#E0DDD5] bg-white text-sm" />
            <input data-testid="wd-beneficiary" placeholder="Bank beneficiary (name + acct ref)" value={wd.bank_beneficiary} onChange={(e) => setWd({ ...wd, bank_beneficiary: e.target.value })} className="w-full px-3 py-2.5 border border-[#E0DDD5] bg-white text-sm" />
            <input data-testid="wd-reason" placeholder="Reason / investment purpose" value={wd.reason} onChange={(e) => setWd({ ...wd, reason: e.target.value })} className="w-full px-3 py-2.5 border border-[#E0DDD5] bg-white text-sm" />
            <button data-testid="wd-btn" onClick={requestWd} className="px-6 py-3 text-white text-xs tracking-[0.2em] uppercase font-mono" style={{ background: "#C9A84C", color: "#1C1C1E" }}>{isSuper ? "Record withdrawal" : "Request withdrawal"}</button>
          </div>
        </div>
      </div>

      <div className="mt-10">
        <h2 className="font-serif text-2xl tracking-tight mb-4">Holdings ({data.holdings.length})</h2>
        <div className="border border-[#E0DDD5] bg-white">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-[#E0DDD5]">{["Plan", "Amount", "Type", "Created"].map(h => <th key={h} className="text-left p-3 text-[10px] tracking-[0.2em] uppercase font-mono text-[#6B6B6B]">{h}</th>)}</tr></thead>
            <tbody>
              {data.holdings.map(h => (
                <tr key={h.holding_id} className="border-b border-[#E0DDD5] last:border-0">
                  <td className="p-3 uppercase text-xs">{h.plan_slug}</td>
                  <td className="p-3 font-mono">${h.amount.toLocaleString()}</td>
                  <td className="p-3 text-xs text-[#6B6B6B]">{h.adjustment ? "adjustment" : "funded"}</td>
                  <td className="p-3 font-mono text-xs text-[#6B6B6B]">{(h.created_at || "").slice(0, 19)}</td>
                </tr>
              ))}
              {data.holdings.length === 0 && <tr><td colSpan={4} className="p-6 text-center text-[#6B6B6B] text-sm">No holdings.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-10">
        <h2 className="font-serif text-2xl tracking-tight mb-4">Transactions ({data.transactions.length})</h2>
        <div className="border border-[#E0DDD5] bg-white">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-[#E0DDD5]">{["Session", "Plan", "Amount", "Status", "Created"].map(h => <th key={h} className="text-left p-3 text-[10px] tracking-[0.2em] uppercase font-mono text-[#6B6B6B]">{h}</th>)}</tr></thead>
            <tbody>
              {data.transactions.map(t => (
                <tr key={t.session_id} className="border-b border-[#E0DDD5] last:border-0">
                  <td className="p-3 font-mono text-xs text-[#6B6B6B]">{(t.session_id || "").slice(0, 16)}...</td>
                  <td className="p-3 uppercase text-xs">{t.plan_slug}</td>
                  <td className="p-3 font-mono">${(t.amount || 0).toLocaleString()}</td>
                  <td className="p-3 text-xs uppercase">{t.payment_status}</td>
                  <td className="p-3 font-mono text-xs text-[#6B6B6B]">{(t.created_at || "").slice(0, 19)}</td>
                </tr>
              ))}
              {data.transactions.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-[#6B6B6B] text-sm">No transactions.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
