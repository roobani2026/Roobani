import React, { useState } from "react";
import { toast } from "sonner";
import { api } from "../../lib/api";
import DataTable from "../../components/DataTable";
import { useAdminAuth } from "../../lib/adminAuth";

const STATUS_STYLES = {
  approved: { bg: "#3A7D5C", fg: "#FAFAF8" },
  rejected: { bg: "#C0392B", fg: "#FAFAF8" },
  pending: { bg: "#C9A84C", fg: "#1C1C1E" },
};

function Pill({ label, bg, fg }) {
  return (
    <span className="text-[10px] tracking-[0.2em] uppercase font-mono px-2 py-1" style={{ background: bg, color: fg }}>
      {label}
    </span>
  );
}

export default function AdminWithdrawals() {
  const { admin } = useAdminAuth();
  const isSuper = admin?.access_level === 0;
  const [reload, setReload] = useState(0);
  const [decisionNote, setDecisionNote] = useState({});

  const load = async ({ offset, limit, sort, order, filters }) => {
    const params = { offset, limit, sort, order };
    Object.entries(filters || {}).forEach(([k, v]) => { if (v !== "" && v !== undefined && v !== null) params[k] = v; });
    // Backwards-compat: backend uses `status_filter` not `status`.
    if (params.status) { params.status_filter = params.status; delete params.status; }
    const r = await api.get("/admin/withdrawals", { params });
    return { items: r.data.items, total: r.data.total };
  };

  const decide = async (w, approve) => {
    try {
      await api.post(`/admin/withdrawals/${w.withdrawal_id}/decide`, { approve, note: decisionNote[w.withdrawal_id] || "" });
      toast.success(approve ? "Approved" : "Rejected");
      setReload((k) => k + 1);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Action failed");
    }
  };

  const bulkDecide = async (action, ids) => {
    try {
      const r = await api.post("/admin/withdrawals/bulk-decide", { action, withdrawal_ids: ids });
      const ok = r.data.succeeded?.length || 0;
      const failed = r.data.failed?.length || 0;
      if (failed === 0) toast.success(`${ok} withdrawal${ok === 1 ? "" : "s"} ${action === "approve" ? "approved" : "rejected"}.`);
      else toast.message(`${ok} ${action}d, ${failed} skipped.`, { description: r.data.failed.map((f) => f.reason).slice(0, 3).join(", ") });
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Bulk action failed");
    }
  };

  const columns = [
    {
      id: "created_at", header: "When", sortable: true, pinnable: true,
      accessor: (w) => (w.created_at || "").slice(0, 19),
      cell: (w) => <span className="font-mono text-xs text-[#6B6B6B] whitespace-nowrap">{(w.created_at || "").slice(0, 19)}</span>,
    },
    {
      id: "customer_user_id", header: "Customer",
      accessor: (w) => w.customer_user_id,
      cell: (w) => <span className="font-mono text-xs">{w.customer_user_id}</span>,
    },
    {
      id: "amount", header: "Amount", sortable: true, align: "right",
      accessor: (w) => `${w.currency || "USD"} ${(w.amount || 0).toLocaleString()}`,
      cell: (w) => <span className="font-mono">{(w.currency || "USD")} {(w.amount || 0).toLocaleString()}</span>,
    },
    {
      id: "destination_type", header: "Dest.", optional: true, defaultHidden: false,
      accessor: (w) => w.destination_type || "-",
      cell: (w) => <span className="text-xs font-mono uppercase">{w.destination_type || "-"}</span>,
    },
    {
      id: "destination_summary", header: "Beneficiary / Wallet", optional: true, defaultHidden: false,
      accessor: (w) => w.destination_summary || w.bank_beneficiary || "-",
      cell: (w) => <span className="text-xs text-[#6B6B6B] block max-w-xs truncate">{w.destination_summary || w.bank_beneficiary || "-"}</span>,
    },
    {
      id: "status", header: "Status", sortable: true,
      accessor: (w) => w.status,
      cell: (w) => {
        const s = STATUS_STYLES[w.status] || STATUS_STYLES.pending;
        return <Pill label={w.status} bg={s.bg} fg={s.fg} />;
      },
    },
    {
      id: "payout", header: "Payout", optional: true, defaultHidden: false,
      accessor: (w) => w.payout_status ? `${w.payout_status} ${w.payout_provider || ""}` : "",
      cell: (w) => w.payout_status ? (
        <div className="text-[10px] font-mono text-[#6B6B6B]" data-testid={`payout-${w.withdrawal_id}`}>
          <div className="uppercase tracking-[0.18em]">{w.payout_status} :: {w.payout_mode || "test"}</div>
          {w.payout_provider && <div className="mt-1">{w.payout_provider}</div>}
          {w.payout_reference && <div className="mt-1 truncate max-w-[10rem]">{w.payout_reference}</div>}
        </div>
      ) : "-",
    },
    {
      id: "_actions", header: "Actions",
      accessor: (w) => w.status,
      cell: (w) => isSuper && w.status === "pending" ? (
        <div className="space-y-2 min-w-[12rem]">
          <input
            placeholder="Note (optional)"
            value={decisionNote[w.withdrawal_id] || ""}
            onChange={(e) => setDecisionNote({ ...decisionNote, [w.withdrawal_id]: e.target.value })}
            className="w-full px-2 py-1 border border-[#E0DDD5] text-xs"
            data-testid={`note-${w.withdrawal_id}`}
          />
          <div className="flex gap-2">
            <button type="button" onClick={() => decide(w, true)} data-testid={`approve-${w.withdrawal_id}`} className="px-3 py-1 text-white text-[10px] tracking-[0.2em] uppercase font-mono" style={{ background: "#3A7D5C" }}>Approve</button>
            <button type="button" onClick={() => decide(w, false)} data-testid={`reject-${w.withdrawal_id}`} className="px-3 py-1 text-white text-[10px] tracking-[0.2em] uppercase font-mono" style={{ background: "#C0392B" }}>Reject</button>
          </div>
        </div>
      ) : <span className="text-[10px] text-[#6B6B6B]">-</span>,
    },
  ];

  const filters = [
    {
      id: "status_filter", label: "Status", type: "select",
      options: [
        { value: "", label: "All" },
        { value: "pending", label: "Pending" },
        { value: "approved", label: "Approved" },
        { value: "rejected", label: "Rejected" },
      ],
    },
    { id: "q", label: "Search", type: "text", placeholder: "Customer / wallet / id", widthClass: "flex-1 min-w-[12rem]" },
    { id: "from_date", label: "From", type: "date" },
    { id: "to_date", label: "To", type: "date" },
  ];

  const bulkActions = isSuper ? [
    {
      id: "approve",
      label: "Approve selected",
      confirm: "Approve {n} pending withdrawals? Each will trigger a payout intent.",
      onRun: (_, ids) => bulkDecide("approve", ids),
    },
    {
      id: "reject",
      label: "Reject selected",
      variant: "danger",
      confirm: "Reject {n} pending withdrawals?",
      onRun: (_, ids) => bulkDecide("reject", ids),
    },
  ] : [];

  return (
    <section className="p-6 md:p-10" aria-labelledby="withdrawals-heading">
      <header className="mb-8">
        <h1 id="withdrawals-heading" className="font-serif text-4xl md:text-5xl tracking-tight text-[#1C1C1E]">Withdrawals.</h1>
        <p className="text-sm text-[#6B6B6B] mt-2 max-w-2xl">
          {isSuper
            ? "Approve, reject, or record withdrawals. On approval, a payout intent is recorded. Set PAYOUT_LIVE_MODE=true to transfer funds."
            : "Your withdrawal requests. Awaiting Access 0 approval."}
        </p>
      </header>
      <DataTable
        tableId="withdrawals"
        columns={columns}
        filters={filters}
        bulkActions={bulkActions}
        load={load}
        reloadSignal={reload}
        getRowId={(w) => w.withdrawal_id}
        defaultSort="created_at"
        defaultOrder="desc"
        emptyMessage="No withdrawals match these filters."
        exportName="roobani-withdrawals"
        cardTitle={(w) => `${w.currency || "USD"} ${(w.amount || 0).toLocaleString()}`}
        cardSubtitle={(w) => w.customer_user_id}
      />
    </section>
  );
}
