import React, { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { toast } from "sonner";

export default function AdminSettings() {
  const [s, setS] = useState({ maintenance_mode: false, maintenance_message: "" });
  const [loading, setLoading] = useState(true);
  useEffect(() => { api.get("/admin/settings").then(r => { setS(r.data); setLoading(false); }).catch(() => setLoading(false)); }, []);
  const save = async () => {
    try { const r = await api.patch("/admin/settings", s); setS(r.data); toast.success("Settings saved"); }
    catch (e) { toast.error(e?.response?.data?.detail || "Save failed"); }
  };
  if (loading) return <div className="p-12 font-mono text-xs tracking-[0.2em] uppercase text-[#6B6B6B]">Loading...</div>;
  return (
    <div className="p-10 max-w-3xl">
      <h1 className="font-serif text-5xl tracking-tight text-[#1C1C1E] mb-8">Site settings.</h1>
      <div className="border border-[#E0DDD5] bg-white p-8">
        <h2 className="font-serif text-2xl tracking-tight mb-2">Maintenance mode</h2>
        <p className="text-sm text-[#6B6B6B] mb-6">When enabled, a banner is shown across the public site. Admins can still log in.</p>
        <label className="flex items-center gap-3 cursor-pointer mb-6">
          <input data-testid="maintenance-toggle" type="checkbox" checked={!!s.maintenance_mode} onChange={(e) => setS({ ...s, maintenance_mode: e.target.checked })} />
          <span className="text-sm font-medium">Enable maintenance mode</span>
        </label>
        <label className="block text-[10px] tracking-[0.25em] uppercase font-mono text-[#6B6B6B] mb-2">Banner message</label>
        <textarea data-testid="maintenance-message" rows={3} value={s.maintenance_message} onChange={(e) => setS({ ...s, maintenance_message: e.target.value })} className="w-full px-3 py-2.5 border border-[#E0DDD5] text-sm mb-5" />
        <button data-testid="settings-save" onClick={save} className="px-6 py-3 text-white text-xs tracking-[0.2em] uppercase font-mono" style={{ background: "#1A1F3D" }}>Save settings</button>
      </div>
    </div>
  );
}
