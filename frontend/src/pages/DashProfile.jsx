import React, { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { User, Check, AlertCircle, Save } from "lucide-react";

export default function Profile() {
  const { refresh: refreshAuth } = useAuth();
  const [form, setForm] = useState({ full_name: "", email: "", phone: "", country: "", address: "", kyc_status: "pending", auth_provider: "email", email_verified: false });
  const [loading, setLoading] = useState(true);
  const [state, setState] = useState({ loading: false, error: "", success: "" });

  useEffect(() => {
    (async () => {
      try {
        const r = await api.get("/profile");
        setForm({
          full_name: r.data?.full_name || "",
          email: r.data?.email || "",
          phone: r.data?.phone || "",
          country: r.data?.country || "",
          address: r.data?.address || "",
          kyc_status: r.data?.kyc_status || "pending",
          auth_provider: r.data?.auth_provider || "email",
          email_verified: !!r.data?.email_verified,
        });
      } finally { setLoading(false); }
    })();
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setState({ loading: true, error: "", success: "" });
    try {
      await api.patch("/profile", {
        full_name: form.full_name,
        phone: form.phone,
        country: form.country,
        address: form.address,
      });
      setState({ loading: false, error: "", success: "Profile saved." });
      refreshAuth?.();
    } catch (err) {
      setState({ loading: false, error: err.response?.data?.detail || "Could not save profile.", success: "" });
    }
  };

  if (loading) return <div className="pt-12 px-12 rb-mono text-sm text-rb-text2" data-testid="profile-loading">Loading ...</div>;

  return (
    <div className="max-w-[900px] mx-auto px-6 md:px-12 py-10" data-testid="page-profile">
      <div className="flex items-end justify-between mb-6">
        <div>
          <div className="rb-mono text-[11px] uppercase tracking-[0.22em] text-rb-text2">Account</div>
          <h1 className="rb-display text-4xl md:text-5xl text-rb-navy mt-2">Profile</h1>
        </div>
        <div className="hidden md:flex items-center gap-2 rb-mono text-[11px] uppercase tracking-[0.18em] text-rb-text2">
          <User size={14} /> {form.auth_provider}
        </div>
      </div>

      <form onSubmit={submit} className="bg-white border border-rb-border p-8 space-y-6" data-testid="profile-form">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="rb-label">Full Name</label>
            <input className="rb-input" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} data-testid="profile-name" />
          </div>
          <div>
            <label className="rb-label">Email</label>
            <input className="rb-input rb-mono text-sm bg-rb-bg2" value={form.email} disabled data-testid="profile-email" />
            <div className={`rb-mono text-[10px] uppercase tracking-[0.18em] mt-1 ${form.email_verified ? "text-rb-success" : "text-rb-gold"}`}>
              {form.email_verified ? "Verified" : "Not verified"}
            </div>
          </div>
          <div>
            <label className="rb-label">Phone</label>
            <input className="rb-input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} data-testid="profile-phone" placeholder="+254 700 000 000" />
          </div>
          <div>
            <label className="rb-label">Country</label>
            <input className="rb-input" value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} data-testid="profile-country" placeholder="Kenya" />
          </div>
          <div className="md:col-span-2">
            <label className="rb-label">Address</label>
            <textarea className="rb-input min-h-[80px]" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} data-testid="profile-address" placeholder="Street, City, Postal Code" />
          </div>
        </div>

        <div className="rb-hr" />
        <div className="flex items-center justify-between">
          <div>
            <div className="rb-label">KYC Status</div>
            <div className={`rb-mono text-sm uppercase tracking-[0.18em] mt-1 ${form.kyc_status === "verified" ? "text-rb-success" : form.kyc_status === "rejected" ? "text-rb-alert" : "text-rb-gold"}`}>{form.kyc_status}</div>
          </div>
          <a href="/dashboard/kyc" className="rb-btn rb-btn-ghost" data-testid="profile-kyc-link"><span className="rb-line">Manage KYC -&gt;</span></a>
        </div>

        {state.error && (
          <div className="border border-rb-alert bg-rb-alert/5 p-4 flex items-start gap-2 text-rb-alert text-sm" data-testid="profile-error">
            <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
            <span>{state.error}</span>
          </div>
        )}
        {state.success && (
          <div className="border border-rb-success bg-rb-success/10 p-4 flex items-start gap-2 text-rb-success text-sm" data-testid="profile-success">
            <Check size={16} className="mt-0.5 flex-shrink-0" />
            <span>{state.success}</span>
          </div>
        )}

        <button type="submit" disabled={state.loading} className="rb-btn rb-btn-primary" data-testid="profile-submit">
          <span>{state.loading ? "Saving ..." : "Save Profile"}</span>
          <Save size={16} />
        </button>
      </form>
    </div>
  );
}
