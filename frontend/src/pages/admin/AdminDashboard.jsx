import React, { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { useAdminAuth } from "../../lib/adminAuth";
import { Link } from "react-router-dom";

const Stat = ({ label, value, prefix = "", suffix = "" }) => (
  <div className="p-8 border border-[#E0DDD5] bg-white">
    <div className="text-[10px] tracking-[0.25em] uppercase font-mono text-[#6B6B6B]">{label}</div>
    <div className="font-mono text-4xl tracking-tight text-[#1C1C1E] mt-3">{prefix}{value}{suffix}</div>
  </div>
);

export default function AdminDashboard() {
  const { admin } = useAdminAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    (async () => {
      try { const r = await api.get("/admin/dashboard"); setData(r.data); }
      catch (e) { setError(e?.response?.data?.detail || "Failed to load"); }
    })();
  }, []);
  if (error) return <div className="p-12 text-[#C0392B] font-mono text-sm">{error}</div>;
  if (!data) return <div className="p-12 font-mono text-xs tracking-[0.2em] uppercase text-[#6B6B6B]">Loading...</div>;
  const m = data.metrics;
  const isSuper = data.is_super;
  return (
    <div className="p-10">
      <div className="mb-10">
        <div className="text-[11px] tracking-[0.25em] uppercase font-mono text-[#6B6B6B]">{isSuper ? "Access 0 / Super Admin" : "Access 1 / Account Manager"}</div>
        <h1 className="font-serif text-5xl tracking-tight text-[#1C1C1E] mt-2">Overview.</h1>
        <p className="text-sm text-[#6B6B6B] mt-2">Welcome back, {admin?.full_name}.</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {isSuper ? (<>
          <Stat label="Customers" value={m.users.toLocaleString()} />
          <Stat label="Holdings" value={m.holdings.toLocaleString()} />
          <Stat label="Total Invested" value={m.total_invested.toLocaleString()} prefix="$" />
          <Stat label="Pending Withdrawals" value={m.pending_withdrawals.toLocaleString()} />
          <Stat label="Access 1 Managers" value={`${m.managers} / 500`} />
          <Stat label="Access 0 Super Admins" value={`${m.super_admins} / 5`} />
          <Stat label="Leads" value={m.leads.toLocaleString()} />
          <Stat label="Contact Forms" value={m.contacts.toLocaleString()} />
        </>) : (<>
          <Stat label="My Customers" value={m.my_customers.toLocaleString()} />
          <Stat label="AUM" value={m.total_aum.toLocaleString()} prefix="$" />
          <Stat label="My Pending Withdrawals" value={m.pending_withdrawals.toLocaleString()} />
        </>)}
      </div>
      <div className="mt-12">
        <div className="flex items-end justify-between mb-6">
          <h2 className="font-serif text-2xl tracking-tight text-[#1C1C1E]">Recent customers</h2>
          <Link to="/admin/customers" className="text-[11px] tracking-[0.2em] uppercase font-mono text-[#1A1F3D] underline">View all</Link>
        </div>
        <div className="border border-[#E0DDD5] bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#E0DDD5]">
                <th className="text-left p-4 text-[10px] tracking-[0.2em] uppercase font-mono text-[#6B6B6B]">Name</th>
                <th className="text-left p-4 text-[10px] tracking-[0.2em] uppercase font-mono text-[#6B6B6B]">Email</th>
                <th className="text-left p-4 text-[10px] tracking-[0.2em] uppercase font-mono text-[#6B6B6B]">KYC</th>
                <th className="text-right p-4 text-[10px] tracking-[0.2em] uppercase font-mono text-[#6B6B6B]">Invested</th>
                <th className="text-left p-4 text-[10px] tracking-[0.2em] uppercase font-mono text-[#6B6B6B]">Manager</th>
              </tr>
            </thead>
            <tbody>
              {data.recent_customers.map((c) => (
                <tr key={c.user_id} className="border-b border-[#E0DDD5] last:border-0 hover:bg-[#FAFAF8]">
                  <td className="p-4"><Link className="text-[#1A1F3D] hover:underline" to={`/admin/customers/${c.user_id}`}>{c.full_name || "-"}</Link></td>
                  <td className="p-4 font-mono text-xs text-[#6B6B6B]">{c.email}</td>
                  <td className="p-4"><span className="text-[10px] tracking-[0.2em] uppercase font-mono px-2 py-1" style={{ background: c.kyc_status === "verified" ? "#3A7D5C" : c.kyc_status === "rejected" ? "#C0392B" : "#F0EDE6", color: c.kyc_status === "pending" ? "#1C1C1E" : "#FAFAF8" }}>{c.kyc_status}</span></td>
                  <td className="p-4 text-right font-mono text-sm">${c.total_invested.toLocaleString()}</td>
                  <td className="p-4 text-xs text-[#6B6B6B]">{c.manager ? c.manager.full_name : "-"}</td>
                </tr>
              ))}
              {data.recent_customers.length === 0 && (<tr><td colSpan={5} className="p-8 text-center text-[#6B6B6B] text-sm">No customers yet.</td></tr>)}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
