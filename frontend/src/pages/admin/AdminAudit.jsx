import React, { useEffect, useMemo, useState, useCallback } from "react";
import { api } from "../../lib/api";
import { Skeleton } from "../../components/ui/skeleton";

/**
 * Audit log viewer. Server-side filtering on action, admin, target_type,
 * date range, and free-text search. Each row can be expanded to reveal the
 * structured `diff` (before → after) plus IP and User-Agent.
 */
const PAGE_SIZE = 50;

const ACTION_PRESETS = [
  { value: "", label: "All actions" },
  { value: "admin.login", label: "Admin login" },
  { value: "admin.mfa.enroll", label: "MFA enrol" },
  { value: "admin.mfa.disable", label: "MFA disable" },
  { value: "admin.mfa.force_disable", label: "MFA force-disable" },
  { value: "admin.mfa.fail", label: "MFA failure" },
  { value: "admin.create", label: "Admin create" },
  { value: "admin.update", label: "Admin update" },
  { value: "admin.delete", label: "Admin delete" },
  { value: "customer.update", label: "Customer update" },
  { value: "customer.assign", label: "Customer assign" },
  { value: "withdrawal.approve", label: "Withdrawal approve" },
  { value: "withdrawal.reject", label: "Withdrawal reject" },
];

function Row({ entry }) {
  const [open, setOpen] = useState(false);
  const hasDetails =
    !!entry.ip ||
    !!entry.user_agent ||
    (entry.diff && Object.keys(entry.diff).length > 0) ||
    (entry.meta && Object.keys(entry.meta).length > 0);

  return (
    <>
      <tr className="border-b border-[#E0DDD5] last:border-0 align-top">
        <td className="p-4 font-mono text-xs text-[#6B6B6B] whitespace-nowrap">
          {(entry.created_at || "").slice(0, 19).replace("T", " ")}
        </td>
        <td className="p-4 text-xs">
          <div className="text-[#1C1C1E]">{entry.admin?.full_name || entry.admin_id}</div>
          <div className="text-[10px] text-[#6B6B6B] font-mono">
            {entry.admin?.email}
            {entry.admin?.access_level !== undefined && ` · Access ${entry.admin.access_level}`}
          </div>
        </td>
        <td className="p-4 font-mono text-xs text-[#1C1C1E]">{entry.action}</td>
        <td className="p-4 font-mono text-xs text-[#6B6B6B]">
          {entry.target_type ? `${entry.target_type}/${entry.target_id || "-"}` : "-"}
        </td>
        <td className="p-4 font-mono text-[11px] text-[#6B6B6B] whitespace-nowrap">{entry.ip || "—"}</td>
        <td className="p-4">
          {hasDetails ? (
            <button
              type="button"
              onClick={() => setOpen((s) => !s)}
              data-testid={`audit-row-toggle-${entry.audit_id}`}
              className="text-[10px] tracking-[0.2em] uppercase font-mono text-[#1A1F3D] hover:underline"
              aria-expanded={open}
            >
              {open ? "Hide" : "Show"}
            </button>
          ) : (
            <span className="text-[10px] text-[#6B6B6B]">—</span>
          )}
        </td>
      </tr>
      {open && hasDetails && (
        <tr className="border-b border-[#E0DDD5] bg-[#FAFAF8]">
          <td colSpan={6} className="p-5">
            {entry.user_agent && (
              <div className="mb-3">
                <div className="text-[10px] tracking-[0.2em] uppercase font-mono text-[#6B6B6B] mb-1">User-Agent</div>
                <div className="font-mono text-[11px] text-[#1C1C1E] break-all">{entry.user_agent}</div>
              </div>
            )}
            {entry.diff && Object.keys(entry.diff).length > 0 && (
              <div className="mb-3">
                <div className="text-[10px] tracking-[0.2em] uppercase font-mono text-[#6B6B6B] mb-2">Diff</div>
                <div className="border border-[#E0DDD5] bg-white">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-[#E0DDD5]">
                        <th className="text-left p-2 text-[10px] tracking-[0.2em] uppercase font-mono text-[#6B6B6B]">Field</th>
                        <th className="text-left p-2 text-[10px] tracking-[0.2em] uppercase font-mono text-[#6B6B6B]">From</th>
                        <th className="text-left p-2 text-[10px] tracking-[0.2em] uppercase font-mono text-[#6B6B6B]">To</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(entry.diff).map(([field, change]) => (
                        <tr key={field} className="border-b border-[#E0DDD5] last:border-0">
                          <td className="p-2 font-mono text-[11px] text-[#1C1C1E]">{field}</td>
                          <td className="p-2 font-mono text-[11px] text-[#C0392B] break-all">{JSON.stringify(change?.from ?? null)}</td>
                          <td className="p-2 font-mono text-[11px] text-[#1A7F3D] break-all">{JSON.stringify(change?.to ?? null)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            {entry.meta && Object.keys(entry.meta).length > 0 && (
              <div>
                <div className="text-[10px] tracking-[0.2em] uppercase font-mono text-[#6B6B6B] mb-1">Metadata</div>
                <pre className="font-mono text-[11px] text-[#1C1C1E] bg-white border border-[#E0DDD5] p-3 whitespace-pre-wrap break-all">{JSON.stringify(entry.meta, null, 2)}</pre>
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

export default function AdminAudit() {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Filters
  const [q, setQ] = useState("");
  const [action, setAction] = useState("");
  const [adminId, setAdminId] = useState("");
  const [targetType, setTargetType] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [offset, setOffset] = useState(0);
  const [reloadKey, setReloadKey] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = { limit: PAGE_SIZE, offset };
      if (q.trim()) params.q = q.trim();
      if (action) params.action = action;
      if (adminId.trim()) params.admin_id = adminId.trim();
      if (targetType.trim()) params.target_type = targetType.trim();
      if (fromDate) params.from_date = fromDate;
      if (toDate) params.to_date = toDate + "T23:59:59";
      const r = await api.get("/admin/audit", { params });
      setItems(r.data.items || []);
      setTotal(r.data.total || 0);
    } catch (e) {
      setError(e?.response?.data?.detail || "Failed to load audit log.");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offset, reloadKey]);

  useEffect(() => { load(); }, [load]);

  const onFilterSubmit = (e) => {
    e.preventDefault();
    if (offset !== 0) setOffset(0);
    else setReloadKey((k) => k + 1);
  };

  const reset = () => {
    setQ(""); setAction(""); setAdminId(""); setTargetType("");
    setFromDate(""); setToDate("");
    if (offset !== 0) setOffset(0);
    else setReloadKey((k) => k + 1);
  };

  const exportCsv = () => {
    const rows = [
      ["timestamp", "admin", "admin_email", "action", "target_type", "target_id", "ip", "user_agent"],
      ...items.map((a) => [
        a.created_at,
        a.admin?.full_name || a.admin_id,
        a.admin?.email || "",
        a.action,
        a.target_type || "",
        a.target_id || "",
        a.ip || "",
        a.user_agent || "",
      ]),
    ];
    const csv = rows.map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `roobani-audit-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const pageInfo = useMemo(() => {
    const start = total === 0 ? 0 : offset + 1;
    const end = Math.min(offset + items.length, total);
    return { start, end };
  }, [offset, items.length, total]);

  return (
    <section className="p-10" aria-labelledby="audit-heading">
      <header className="flex items-end justify-between mb-8 gap-4 flex-wrap">
        <div>
          <div className="text-[10px] tracking-[0.25em] uppercase font-mono text-[#6B6B6B] mb-2">Security</div>
          <h1 id="audit-heading" className="font-serif text-5xl tracking-tight text-[#1C1C1E]">Audit log.</h1>
          <p className="text-sm text-[#6B6B6B] mt-2">Every administrative write is captured with actor, IP, user-agent, and a field-level diff.</p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            data-testid="audit-export-csv"
            onClick={exportCsv}
            disabled={items.length === 0}
            className="px-4 py-2.5 text-[11px] tracking-[0.2em] uppercase font-mono border border-[#1A1F3D] text-[#1A1F3D] hover:bg-[#1A1F3D] hover:text-white disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:text-[#1A1F3D] transition-colors"
          >
            Export visible (CSV)
          </button>
        </div>
      </header>

      <form
        onSubmit={onFilterSubmit}
        className="border border-[#E0DDD5] bg-white p-4 grid grid-cols-1 md:grid-cols-6 gap-3 mb-6"
        aria-label="Audit log filters"
      >
        <input
          data-testid="audit-q"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search action / target / admin id"
          className="md:col-span-2 px-3 py-2 border border-[#E0DDD5] focus:border-[#1A1F3D] outline-none text-sm"
          aria-label="Free-text search"
        />
        <select
          data-testid="audit-action"
          value={action}
          onChange={(e) => setAction(e.target.value)}
          className="px-3 py-2 border border-[#E0DDD5] focus:border-[#1A1F3D] outline-none text-sm bg-white"
          aria-label="Action filter"
        >
          {ACTION_PRESETS.map((p) => (
            <option key={p.value || "any"} value={p.value}>{p.label}</option>
          ))}
        </select>
        <input
          data-testid="audit-target-type"
          value={targetType}
          onChange={(e) => setTargetType(e.target.value)}
          placeholder="Target type"
          className="px-3 py-2 border border-[#E0DDD5] focus:border-[#1A1F3D] outline-none text-sm"
          aria-label="Target type filter"
        />
        <input
          data-testid="audit-from-date"
          type="date"
          value={fromDate}
          onChange={(e) => setFromDate(e.target.value)}
          className="px-3 py-2 border border-[#E0DDD5] focus:border-[#1A1F3D] outline-none text-sm"
          aria-label="From date"
        />
        <input
          data-testid="audit-to-date"
          type="date"
          value={toDate}
          onChange={(e) => setToDate(e.target.value)}
          className="px-3 py-2 border border-[#E0DDD5] focus:border-[#1A1F3D] outline-none text-sm"
          aria-label="To date"
        />
        <input
          data-testid="audit-admin-id"
          value={adminId}
          onChange={(e) => setAdminId(e.target.value)}
          placeholder="Admin ID"
          className="md:col-span-2 px-3 py-2 border border-[#E0DDD5] focus:border-[#1A1F3D] outline-none text-sm"
          aria-label="Admin ID filter"
        />
        <div className="md:col-span-4 flex gap-2 justify-end">
          <button
            type="button"
            onClick={reset}
            data-testid="audit-reset"
            className="px-4 py-2 text-[11px] tracking-[0.2em] uppercase font-mono text-[#6B6B6B] hover:text-[#1A1F3D] transition-colors"
          >
            Reset
          </button>
          <button
            type="submit"
            data-testid="audit-apply"
            disabled={loading}
            aria-busy={loading}
            className="px-5 py-2 text-[11px] tracking-[0.2em] uppercase font-mono text-white disabled:opacity-60 transition-colors"
            style={{ background: "#1A1F3D" }}
          >
            {loading ? "Loading..." : "Apply filters"}
          </button>
        </div>
      </form>

      {error && (
        <div role="alert" className="border border-[#C0392B] bg-[#FDECEA] text-[#C0392B] text-sm p-3 mb-4 font-mono">
          {error}
        </div>
      )}

      <div className="border border-[#E0DDD5] bg-white overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#E0DDD5]">
              {["When", "Admin", "Action", "Target", "IP", "Details"].map((h) => (
                <th key={h} className="text-left p-4 text-[10px] tracking-[0.2em] uppercase font-mono text-[#6B6B6B]">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              [...Array(5)].map((_, i) => (
                <tr key={i} className="border-b border-[#E0DDD5] last:border-0">
                  {[...Array(6)].map((__, j) => (
                    <td key={j} className="p-4"><Skeleton className="h-3 w-full" /></td>
                  ))}
                </tr>
              ))
            ) : items.length === 0 ? (
              <tr><td colSpan={6} className="p-10 text-center text-[#6B6B6B] font-mono text-xs">No audit entries match these filters.</td></tr>
            ) : (
              items.map((a) => <Row key={a.audit_id} entry={a} />)
            )}
          </tbody>
        </table>
      </div>

      <nav aria-label="Audit pagination" className="flex justify-between items-center mt-4 text-xs font-mono text-[#6B6B6B]">
        <div data-testid="audit-page-info">
          Showing {pageInfo.start}–{pageInfo.end} of {total}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            data-testid="audit-prev"
            disabled={offset === 0 || loading}
            onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
            className="px-4 py-2 border border-[#E0DDD5] hover:border-[#1A1F3D] hover:text-[#1A1F3D] disabled:opacity-40 transition-colors"
          >
            Previous
          </button>
          <button
            type="button"
            data-testid="audit-next"
            disabled={offset + items.length >= total || loading}
            onClick={() => setOffset(offset + PAGE_SIZE)}
            className="px-4 py-2 border border-[#E0DDD5] hover:border-[#1A1F3D] hover:text-[#1A1F3D] disabled:opacity-40 transition-colors"
          >
            Next
          </button>
        </div>
      </nav>
    </section>
  );
}
