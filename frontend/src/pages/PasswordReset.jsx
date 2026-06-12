import React, { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { Logo } from "../components/Logo";
import SEO from "../components/SEO";

export default function PasswordReset() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState({ loading: false, sent: false, devToken: "", error: "" });

  const submit = async (e) => {
    e.preventDefault();
    setState({ loading: true, sent: false, devToken: "", error: "" });
    try {
      const r = await api.post("/auth/password/reset/request", { email });
      setState({ loading: false, sent: true, devToken: r.data?.dev_token || "", error: "" });
    } catch (err) {
      const msg = err.response?.data?.detail || "Could not start reset.";
      setState({ loading: false, sent: false, devToken: "", error: typeof msg === "string" ? msg : "Reset failed." });
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-6 pt-32 pb-16" data-testid="password-reset-page">
      <SEO title="Password Reset" description="Reset your Roobani account password." noindex />
      <div className="w-full max-w-md">
        <Link to="/" className="inline-flex"><Logo size={56} /></Link>
        <div className="rb-mono text-[11px] uppercase tracking-[0.22em] text-rb-text2 mt-10">Password Reset</div>
        <h1 className="rb-display text-4xl md:text-5xl text-rb-navy mt-2">Forgot your password.</h1>
        <p className="text-rb-text2 mt-3">Enter your email. We will send a reset link valid for two hours.</p>

        {state.sent ? (
          <div className="mt-10 border border-rb-border bg-white p-8" data-testid="password-reset-sent">
            <div className="rb-display text-2xl text-rb-navy">Check your inbox.</div>
            <p className="text-rb-text2 text-sm mt-3">
              If an account exists for that email, a reset link is on its way.
            </p>
            {state.devToken && (
              <div className="mt-6 border-t border-rb-border pt-4">
                <div className="rb-label">Dev token (mock email)</div>
                <Link to={`/auth/reset?token=${state.devToken}`} className="rb-mono text-xs text-rb-navy rb-underline break-all" data-testid="password-reset-dev-link">
                  {state.devToken}
                </Link>
                <p className="text-xs text-rb-text2 mt-2">Production builds will send this via email. Click the token to continue.</p>
              </div>
            )}
            <div className="mt-6">
              <Link to="/login" className="rb-btn rb-btn-ghost"><span className="rb-line">Back to sign in</span></Link>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-10 space-y-6" data-testid="password-reset-form">
            <div>
              <label className="rb-label">Email Address</label>
              <input required type="email" className="rb-input" value={email} onChange={(e) => setEmail(e.target.value)} data-testid="password-reset-email" />
            </div>
            {state.error && <div className="text-sm text-rb-alert border border-rb-alert/40 bg-rb-alert/5 px-4 py-3">{state.error}</div>}
            <button type="submit" disabled={state.loading} className="rb-btn rb-btn-primary w-full justify-center" data-testid="password-reset-submit">
              <span>{state.loading ? "Sending ..." : "Send Reset Link"}</span>
            </button>
            <div className="text-sm text-rb-text2">
              Remembered it? <Link to="/login" className="rb-underline text-rb-text">Sign in</Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
