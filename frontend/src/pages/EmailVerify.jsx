import React, { useEffect, useRef, useState } from "react";
import { useSearchParams, useNavigate, Link } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Check, AlertCircle } from "lucide-react";

export default function EmailVerify() {
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const nav = useNavigate();
  const { refresh } = useAuth();
  const [state, setState] = useState({ loading: true, ok: false, error: "" });
  const firedRef = useRef(false);

  useEffect(() => {
    if (firedRef.current) return; // guard React 18 StrictMode double-fire
    firedRef.current = true;
    if (!token) { setState({ loading: false, ok: false, error: "Missing token" }); return; }
    (async () => {
      try {
        await api.post("/auth/email/verify/confirm", { token });
        await refresh();
        setState({ loading: false, ok: true, error: "" });
      } catch (err) {
        // If token was already consumed (e.g. by a previous successful call), check /auth/me.
        // The backend treats "used" tokens as 400. If the user is now verified, treat as success.
        try {
          const me = await api.get("/auth/me");
          if (me?.data?.email_verified) {
            setState({ loading: false, ok: true, error: "" });
            await refresh();
            return;
          }
        } catch (e) { /* ignore */ }
        const msg = err.response?.data?.detail || "Verification failed.";
        setState({ loading: false, ok: false, error: typeof msg === "string" ? msg : "Verification failed." });
      }
    })();
  }, [token, refresh]);

  return (
    <div className="min-h-screen flex items-center justify-center px-6 pt-32 pb-16" data-testid="email-verify-page">
      <div className="w-full max-w-md text-center">
        {state.loading && (
          <div className="rb-mono text-[11px] uppercase tracking-[0.22em] text-rb-text2">Verifying your email ...</div>
        )}
        {!state.loading && state.ok && (
          <div data-testid="email-verify-success">
            <div className="inline-flex items-center justify-center w-14 h-14 border border-rb-navy mb-6"><Check className="text-rb-navy" /></div>
            <div className="rb-display text-4xl text-rb-navy">Email verified.</div>
            <p className="text-rb-text2 mt-3">Thank you. You can now use all Roobani features.</p>
            <button onClick={() => nav("/dashboard")} className="rb-btn rb-btn-primary mt-8" data-testid="email-verify-continue">
              <span>Continue to Dashboard</span>
            </button>
          </div>
        )}
        {!state.loading && !state.ok && (
          <div data-testid="email-verify-error">
            <div className="inline-flex items-center justify-center w-14 h-14 border border-rb-alert mb-6"><AlertCircle className="text-rb-alert" /></div>
            <div className="rb-display text-4xl text-rb-navy">Verification failed.</div>
            <p className="text-rb-text2 mt-3">{state.error}</p>
            <Link to="/dashboard" className="rb-btn rb-btn-secondary mt-8"><span>Back to Dashboard</span></Link>
          </div>
        )}
      </div>
    </div>
  );
}
