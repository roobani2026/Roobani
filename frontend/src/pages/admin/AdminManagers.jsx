import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { api } from "../../lib/api";
import DataTable from "../../components/DataTable";

const createSchema = z.object({
  full_name: z.string().trim().min(2, "Full name is required"),
  email: z.string().trim().email("Enter a valid email"),
  password: z
    .string()
    .min(8, "At least 8 characters")
    .refine((v) => /[A-Za-z]/.test(v) && /\d/.test(v), "Must contain letters and digits"),
  access_level: z.union([z.literal(0), z.literal(1)]),
});

function Pill({ label, bg, fg }) {
  return (
    <span className="text-[10px] tracking-[0.2em] uppercase font-mono px-2 py-1" style={{ background: bg, color: fg }}>
      {label}
    </span>
  );
}

export default function AdminManagers() {
  const [caps, setCaps] = useState({ access_0: 5, access_1: 500 });
  const [counts, setCounts] = useState({ access_0: 0, access_1: 0 });
  const [reload, setReload] = useState(0);

  const [form, setForm] = useState({ full_name: "", email: "", password: "", access_level: 1 });
  const [formErrors, setFormErrors] = useState({});
  const [creating, setCreating] = useState(false);

  const [resetting, setResetting] = useState(null);
  const [newPw, setNewPw] = useState("");
  const [savingPw, setSavingPw] = useState(false);

  // Keep escape-to-close on the reset modal
  useEffect(() => {
    if (!resetting) return;
    const onKey = (e) => { if (e.key === "Escape") setResetting(null); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [resetting]);

  const load = async ({ offset, limit, sort, order, filters }) => {
    const params = { offset, limit, sort, order };
    Object.entries(filters || {}).forEach(([k, v]) => { if (v !== "" && v !== undefined && v !== null) params[k] = v; });
    const r = await api.get("/admin/admins", { params });
    setCaps(r.data.caps);
    setCounts(r.data.counts);
    return { items: r.data.items, total: r.data.total };
  };

  const create = async (e) => {
    e.preventDefault();
    setFormErrors({});
    const parsed = createSchema.safeParse({ ...form, access_level: parseInt(form.access_level, 10) });
    if (!parsed.success) {
      const errs = {};
      for (const issue of parsed.error.issues) errs[issue.path[0]] = issue.message;
      setFormErrors(errs);
      return;
    }
    setCreating(true);
    try {
      await api.post("/admin/admins", parsed.data);
      toast.success("Admin created.");
      setForm({ full_name: "", email: "", password: "", access_level: 1 });
      setReload((k) => k + 1);
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Create failed.");
    } finally {
      setCreating(false);
    }
  };

  const toggleActive = async (a) => {
    try {
      await api.patch(`/admin/admins/${a.admin_id}`, { active: !a.active });
      toast.success(`Admin ${!a.active ? "enabled" : "disabled"}`);
      setReload((k) => k + 1);
    } catch (e) { toast.error(e?.response?.data?.detail || "Update failed"); }
  };
  const del = async (a) => {
    if (!window.confirm(`Delete admin ${a.email}? This cannot be undone.`)) return;
    try { await api.delete(`/admin/admins/${a.admin_id}`); toast.success("Admin deleted"); setReload((k) => k + 1); }
    catch (e) { toast.error(e?.response?.data?.detail || "Delete failed"); }
  };
  const resetPw = async () => {
    if (newPw.length < 8 || !/[A-Za-z]/.test(newPw) || !/\d/.test(newPw)) {
      toast.error("Password too weak");
      return;
    }
    setSavingPw(true);
    try {
      await api.patch(`/admin/admins/${resetting.admin_id}`, { password: newPw });
      toast.success("Password reset");
      setResetting(null);
      setNewPw("");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Reset failed");
    } finally {
      setSavingPw(false);
    }
  };

  const bulkDelete = async (_, ids) => {
    try {
      const r = await api.post("/admin/admins/bulk-delete", { admin_ids: ids });
      const ok = r.data.succeeded?.length || 0;
      const failed = r.data.failed?.length || 0;
      if (failed === 0) toast.success(`${ok} admin${ok === 1 ? "" : "s"} deleted.`);
      else toast.message(`${ok} deleted, ${failed} skipped.`, { description: r.data.failed.map((f) => f.reason).slice(0, 3).join(", ") });
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Bulk delete failed.");
    }
  };

  const columns = [
    { id: "full_name", header: "Name", sortable: true, pinnable: true, accessor: (a) => a.full_name },
    {
      id: "email", header: "Email", sortable: true, sortKey: "email_lookup",
      accessor: (a) => a.email,
      cell: (a) => <span className="font-mono text-xs text-[#6B6B6B]">{a.email}</span>,
    },
    {
      id: "access_level", header: "Level", sortable: true,
      accessor: (a) => `Access ${a.access_level}`,
      cell: (a) => <Pill label={`Access ${a.access_level}`} bg={a.access_level === 0 ? "#1A1F3D" : "#C9A84C"} fg={a.access_level === 0 ? "#FAFAF8" : "#1C1C1E"} />,
    },
    {
      id: "active", header: "Status", sortable: true,
      accessor: (a) => (a.active ? "active" : "disabled"),
      cell: (a) => a.active
        ? <Pill label="Active" bg="#3A7D5C" fg="#FAFAF8" />
        : <Pill label="Disabled" bg="#F0EDE6" fg="#6B6B6B" />,
    },
    {
      id: "mfa_enabled", header: "MFA", optional: true, defaultHidden: false,
      accessor: (a) => (a.mfa_enabled ? "on" : "off"),
      cell: (a) => a.mfa_enabled
        ? <Pill label={`On · ${a.recovery_codes_remaining}/8`} bg="#3A7D5C" fg="#FAFAF8" />
        : <Pill label="Off" bg="#C0392B" fg="#FAFAF8" />,
    },
    {
      id: "last_login_at", header: "Last login", sortable: true, optional: true, defaultHidden: false,
      accessor: (a) => (a.last_login_at || "—").slice(0, 19),
      cell: (a) => <span className="font-mono text-xs text-[#6B6B6B]">{(a.last_login_at || "—").slice(0, 19)}</span>,
    },
    {
      id: "created_at", header: "Created", sortable: true, optional: true, defaultHidden: true,
      accessor: (a) => (a.created_at || "").slice(0, 10),
      cell: (a) => <span className="font-mono text-xs text-[#6B6B6B]">{(a.created_at || "").slice(0, 10)}</span>,
    },
    {
      id: "_actions", header: "Actions",
      accessor: (a) => `${a.active ? "active" : "disabled"}`,
      cell: (a) => (
        <div className="flex flex-wrap gap-2 text-xs">
          <button type="button" onClick={() => toggleActive(a)} data-testid={`admin-toggle-${a.admin_id}`} className="underline text-[#1A1F3D] hover:text-[#C0392B]">{a.active ? "Disable" : "Enable"}</button>
          <button type="button" onClick={() => { setResetting(a); setNewPw(""); }} data-testid={`admin-reset-${a.admin_id}`} className="underline text-[#1A1F3D]">Reset PW</button>
          <button type="button" onClick={() => del(a)} data-testid={`admin-delete-${a.admin_id}`} className="underline text-[#C0392B]">Delete</button>
        </div>
      ),
    },
  ];

  const filters = [
    { id: "q", label: "Search", type: "text", placeholder: "Name, email, or admin ID", widthClass: "flex-1 min-w-[14rem]" },
    {
      id: "access_level", label: "Access", type: "select",
      options: [
        { value: "", label: "All access" },
        { value: "0", label: "Super Admin (0)" },
        { value: "1", label: "Manager (1)" },
      ],
    },
    {
      id: "active", label: "Status", type: "select",
      options: [
        { value: "", label: "Any" },
        { value: "true", label: "Active" },
        { value: "false", label: "Disabled" },
      ],
    },
  ];

  const bulkActions = [
    {
      id: "delete",
      label: "Delete selected",
      variant: "danger",
      confirm: "Delete {n} admins permanently? Guardrails (self, last super admin) will be respected.",
      onRun: bulkDelete,
    },
  ];

  return (
    <section className="p-6 md:p-10" aria-labelledby="admins-heading">
      <header className="mb-8">
        <h1 id="admins-heading" className="font-serif text-4xl md:text-5xl tracking-tight text-[#1C1C1E]">Admins.</h1>
        <div className="flex flex-wrap gap-6 mt-3 font-mono text-xs text-[#6B6B6B]">
          <div>Access 0: <span className="text-[#1C1C1E]">{counts.access_0} / {caps.access_0}</span></div>
          <div>Access 1: <span className="text-[#1C1C1E]">{counts.access_1} / {caps.access_1}</span></div>
        </div>
      </header>

      <form onSubmit={create} className="border border-[#E0DDD5] bg-white p-6 md:p-8 mb-8" noValidate>
        <h2 className="font-serif text-2xl tracking-tight mb-6">Create admin</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <input data-testid="create-name" required placeholder="Full name" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} className="w-full px-3 py-2.5 border border-[#E0DDD5] text-sm" aria-invalid={!!formErrors.full_name} />
            {formErrors.full_name && <div className="text-[11px] text-[#C0392B] mt-1">{formErrors.full_name}</div>}
          </div>
          <div>
            <input data-testid="create-email" required type="email" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="w-full px-3 py-2.5 border border-[#E0DDD5] text-sm" aria-invalid={!!formErrors.email} />
            {formErrors.email && <div className="text-[11px] text-[#C0392B] mt-1">{formErrors.email}</div>}
          </div>
          <div>
            <input data-testid="create-password" required type="text" placeholder="Initial password (min 8, letters + digits)" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="w-full px-3 py-2.5 border border-[#E0DDD5] text-sm" aria-invalid={!!formErrors.password} />
            {formErrors.password && <div className="text-[11px] text-[#C0392B] mt-1">{formErrors.password}</div>}
          </div>
          <select data-testid="create-access" value={form.access_level} onChange={(e) => setForm({ ...form, access_level: e.target.value })} className="px-3 py-2.5 border border-[#E0DDD5] text-sm bg-white">
            <option value={1}>Access 1 / Account Manager (cap 500)</option>
            <option value={0}>Access 0 / Super Admin (cap 5)</option>
          </select>
        </div>
        <button data-testid="create-submit" disabled={creating} aria-busy={creating} type="submit" className="mt-5 px-6 py-3 text-white text-xs tracking-[0.2em] uppercase font-mono disabled:opacity-60 transition-colors" style={{ background: "#1A1F3D" }}>
          {creating ? "Creating..." : "Create"}
        </button>
      </form>

      <DataTable
        tableId="admins"
        columns={columns}
        filters={filters}
        bulkActions={bulkActions}
        load={load}
        reloadSignal={reload}
        getRowId={(a) => a.admin_id}
        defaultSort="created_at"
        defaultOrder="desc"
        emptyMessage="No admin matches these filters."
        exportName="roobani-admins"
        cardTitle={(a) => a.full_name}
        cardSubtitle={(a) => a.email}
      />

      {resetting && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
          onClick={() => setResetting(null)}
          role="presentation"
        >
          <div
            className="bg-white p-8 max-w-md w-full mx-4"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="reset-pw-title"
          >
            <h3 id="reset-pw-title" className="font-serif text-2xl mb-4">Reset password for {resetting.email}</h3>
            <input data-testid="reset-pw-input" autoFocus type="text" value={newPw} onChange={(e) => setNewPw(e.target.value)} placeholder="New password (min 8, letters + digits)" className="w-full px-3 py-2.5 border border-[#E0DDD5] text-sm mb-4" />
            <div className="flex gap-3 justify-end">
              <button onClick={() => setResetting(null)} className="px-5 py-2.5 text-xs tracking-[0.2em] uppercase font-mono text-[#6B6B6B]">Cancel</button>
              <button data-testid="reset-pw-submit" onClick={resetPw} disabled={savingPw} aria-busy={savingPw} className="px-5 py-2.5 text-white text-xs tracking-[0.2em] uppercase font-mono disabled:opacity-60" style={{ background: "#1A1F3D" }}>
                {savingPw ? "Resetting..." : "Reset"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
