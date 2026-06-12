import React, { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { api } from "../../lib/api";
import DataTable from "../../components/DataTable";
import { useAdminAuth } from "../../lib/adminAuth";

const KYC_STYLES = {
  verified: { bg: "#3A7D5C", fg: "#FAFAF8" },
  rejected: { bg: "#C0392B", fg: "#FAFAF8" },
  pending: { bg: "#F0EDE6", fg: "#1C1C1E" },
};

function Pill({ label, bg, fg }) {
  return (
    <span className="text-[10px] tracking-[0.2em] uppercase font-mono px-2 py-1" style={{ background: bg, color: fg }}>
      {label}
    </span>
  );
}

export default function AdminCustomers() {
  const { admin } = useAdminAuth();
  const isSuper = admin?.access_level === 0;
  const [scope, setScope] = useState("");

  const load = async ({ offset, limit, sort, order, filters }) => {
    const params = { offset, limit, sort, order };
    Object.entries(filters || {}).forEach(([k, v]) => { if (v !== "" && v !== undefined && v !== null) params[k] = v; });
    const r = await api.get("/admin/customers", { params });
    setScope(r.data.scope);
    return { items: r.data.items, total: r.data.total };
  };

  const runBulk = async (action, user_ids, extra = {}) => {
    try {
      const r = await api.post("/admin/customers/bulk", { action, user_ids, ...extra });
      const ok = r.data.succeeded?.length || 0;
      const failed = r.data.failed?.length || 0;
      if (failed === 0) toast.success(`${ok} customer${ok === 1 ? "" : "s"} updated.`);
      else toast.message(`${ok} updated, ${failed} skipped.`, { description: r.data.failed.map((f) => f.reason).slice(0, 3).join(", ") });
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Bulk action failed.");
    }
  };

  const columns = [
    {
      id: "full_name",
      header: "Name",
      sortable: true,
      pinnable: true,
      accessor: (r) => r.full_name || "-",
      cell: (r) => (
        <Link to={`/admin/customers/${r.user_id}`} data-testid={`customer-link-${r.user_id}`} className="text-[#1A1F3D] hover:underline">
          {r.full_name || "-"}
        </Link>
      ),
    },
    {
      id: "email",
      header: "Email",
      sortable: true,
      sortKey: "email_lookup",
      accessor: (r) => r.email,
      cell: (r) => <span className="font-mono text-xs text-[#6B6B6B]">{r.email}</span>,
    },
    {
      id: "plan_slug",
      header: "Plan",
      sortable: true,
      accessor: (r) => r.plan_slug || "-",
      cell: (r) => <span className="text-xs uppercase tracking-wider">{r.plan_slug || "-"}</span>,
    },
    {
      id: "kyc_status",
      header: "KYC",
      sortable: true,
      accessor: (r) => r.kyc_status,
      cell: (r) => {
        const s = KYC_STYLES[r.kyc_status] || KYC_STYLES.pending;
        return <Pill label={r.kyc_status} bg={s.bg} fg={s.fg} />;
      },
    },
    {
      id: "total_invested",
      header: "Invested",
      align: "right",
      accessor: (r) => r.total_invested,
      cell: (r) => <span className="font-mono text-sm">${(r.total_invested || 0).toLocaleString()}</span>,
    },
    {
      id: "manager",
      header: "Manager",
      optional: true,
      defaultHidden: !isSuper,
      accessor: (r) => r.manager?.full_name || "",
      cell: (r) => <span className="text-xs text-[#6B6B6B]">{r.manager ? r.manager.full_name : "-"}</span>,
      cardLabel: "Account manager",
    },
    {
      id: "status",
      header: "Status",
      accessor: (r) => (r.blocked ? "blocked" : "active"),
      cell: (r) => r.blocked
        ? <Pill label="Blocked" bg="#C0392B" fg="#FAFAF8" />
        : <Pill label="Active" bg="#F0EDE6" fg="#1C1C1E" />,
    },
    {
      id: "created_at",
      header: "Joined",
      sortable: true,
      optional: true,
      defaultHidden: true,
      accessor: (r) => (r.created_at || "").slice(0, 10),
      cell: (r) => <span className="font-mono text-xs text-[#6B6B6B]">{(r.created_at || "").slice(0, 10)}</span>,
    },
  ];

  const filters = [
    { id: "q", label: "Search", type: "text", placeholder: "Name or email", widthClass: "flex-1 min-w-[12rem]" },
    {
      id: "kyc",
      label: "KYC",
      type: "select",
      options: [
        { value: "", label: "Any" },
        { value: "pending", label: "Pending" },
        { value: "verified", label: "Verified" },
        { value: "rejected", label: "Rejected" },
      ],
    },
    {
      id: "blocked",
      label: "Status",
      type: "select",
      options: [
        { value: "", label: "Any" },
        { value: "false", label: "Active" },
        { value: "true", label: "Blocked" },
      ],
    },
    { id: "plan", label: "Plan", type: "text", placeholder: "plan-slug" },
  ];

  const bulkActions = [
    { id: "verify-kyc", label: "Mark KYC Verified", onRun: (_, ids) => runBulk("set_kyc", ids, { kyc_status: "verified" }) },
    { id: "pending-kyc", label: "Mark KYC Pending", onRun: (_, ids) => runBulk("set_kyc", ids, { kyc_status: "pending" }) },
    { id: "unblock", label: "Unblock", onRun: (_, ids) => runBulk("unblock", ids) },
    { id: "block", label: "Block", variant: "danger", confirm: "Block {n} customers and kill all their sessions?", onRun: (_, ids) => runBulk("block", ids) },
  ];

  return (
    <section className="p-6 md:p-10" aria-labelledby="customers-heading">
      <header className="mb-8">
        <div className="text-[11px] tracking-[0.25em] uppercase font-mono text-[#6B6B6B]">
          Scope: {scope === "all" ? "All customers" : scope === "assigned" ? "Assigned to you" : "—"}
        </div>
        <h1 id="customers-heading" className="font-serif text-4xl md:text-5xl tracking-tight text-[#1C1C1E] mt-2">Customers.</h1>
      </header>
      <DataTable
        tableId="customers"
        columns={columns}
        filters={filters}
        bulkActions={bulkActions}
        load={load}
        getRowId={(r) => r.user_id}
        defaultSort="created_at"
        defaultOrder="desc"
        emptyMessage="No customers match these filters."
        exportName="roobani-customers"
        cardTitle={(r) => r.full_name || "Unnamed"}
        cardSubtitle={(r) => r.email}
      />
    </section>
  );
}
