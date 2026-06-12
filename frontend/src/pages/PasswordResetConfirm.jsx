import React, { useState, useMemo } from "react";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { Logo } from "../components/Logo";
import SEO from "../components/SEO";

export default function PasswordResetConfirm() {
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const nav = useNavigate();
  const [form, setForm] = useState({ password: "", confirm: "" });
  const [state, setState] = useState({ loading: false, error: "", success: false });

  const mismatch = useMemo(() => form.confirm && form.password !== form.confirm, [form.password, form.confirm]);

  const submit = async (e) => {
    e.preventDefault();
    if (mismatch) { setState({ loading: false, error: "Passwords do not match.", success: false }); return; }
    setState({ loading: true, error: "", success: false });
    try {
      await api.post("/auth/password/reset/confirm", { token, new_password: form.password });
      setState({ loading: false, error: "", success: true });
      setTimeout(() => nav("/login"), 1600);
    } catch (err) {
      const msg = err.response?.data?.detail || "Could not reset password.";
      setState({ loading: false, error: typeof msg === "string" ? msg : "Reset failed.", success: false });
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-6 pt-32 pb-16" data-testid="password-reset-confirm-page">
      <SEO title="Set New Password" description="Choose a new password for your Roobani account." noindex />
      <div className="w-full max-w-md">
        <Link to="/" className="inline-flex"><Logo size={56} /></Link>
        <div className="rb-mono text-[11px] uppercase tracking-[0.22em] text-rb-text2 mt-10">Set New Password</div>
        <h1 className="rb-display text-4xl md:text-5xl text-rb-navy mt-2">Choose a new password.</h1>

        {!token && (
          <div className="mt-6 text-sm text-rb-alert border border-rb-alert/40 bg-rb-alert/5 px-4 py-3" data-testid="reset-missing-token">
            Reset token missing or invalid. Request a new one.
          </div>
        )}

        {state.success ? (
          <div className="mt-10 border border-rb-border bg-white p-8" data-testid="reset-success">
            <div className="rb-display text-2xl text-rb-navy">Password updated.</div>
            <p className="text-rb-text2 text-sm mt-3">Redirecting you to sign in ...</p>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-10 space-y-6" data-testid="password-reset-confirm-form">
            <div>
              <label className="rb-label">New Password</label>
              <input required type="password" minLength={8} className="rb-input" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} data-testid="reset-password" />
            </div>
            <div>
              <label className="rb-label">Confirm Password</label>
              <input required type="password" minLength={8} className="rb-input" value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} data-testid="reset-confirm" />
              {mismatch && <div className="text-xs text-rb-alert mt-2">Passwords do not match.</div>}
            </div>
            {state.error && <div className="text-sm text-rb-alert border border-rb-alert/40 bg-rb-alert/5 px-4 py-3">{state.error}</div>}
            <button type="submit" disabled={state.loading || !token} className="rb-btn rb-btn-primary w-full justify-center" data-testid="reset-submit">
              <span>{state.loading ? "Updating ..." : "Set New Password"}</span>
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
