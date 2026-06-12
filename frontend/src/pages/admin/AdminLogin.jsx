import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { z } from "zod";
import { api } from "../../lib/api";
import { useAdminAuth } from "../../lib/adminAuth";
import { toast } from "sonner";
import AdminMfaChallenge from "./AdminMfaChallenge";

/**
 * Admin login. Now gates behind TOTP MFA:
 *  - On 200 from /admin/auth/login, we may get one of three shapes:
 *      (legacy) { admin: ... }                    → session minted immediately
 *      (mfa)    { mfa_required, challenge_token } → render verify form
 *      (setup)  { mfa_setup_required, challenge_token, qr_svg_data_uri, secret, otpauth_uri }
 *               → render enrollment QR + verify
 *
 * Zod validates the credentials on the client before we hit the API. Server-side
 * validation is still authoritative; this just gives us instant inline feedback
 * and avoids round-trips for obvious typos.
 */
const loginSchema = z.object({
  email: z.string().trim().min(1, "Email is required").email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
});

export default function AdminLogin() {
  const navigate = useNavigate();
  const { refresh } = useAdminAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [challenge, setChallenge] = useState(null); // { mode, token, qr_svg_data_uri, secret, otpauth_uri }

  const submit = async (e) => {
    e.preventDefault();
    setFieldErrors({});
    const parsed = loginSchema.safeParse({ email: email.trim(), password });
    if (!parsed.success) {
      const errs = {};
      for (const issue of parsed.error.issues) errs[issue.path[0]] = issue.message;
      setFieldErrors(errs);
      return;
    }
    setLoading(true);
    try {
      const r = await api.post("/admin/auth/login", parsed.data);
      const data = r.data || {};
      if (data.mfa_setup_required) {
        setChallenge({
          mode: "setup",
          token: data.challenge_token,
          qr_svg_data_uri: data.qr_svg_data_uri,
          secret: data.secret,
          otpauth_uri: data.otpauth_uri,
        });
        return;
      }
      if (data.mfa_required) {
        setChallenge({ mode: "verify", token: data.challenge_token });
        return;
      }
      // Legacy fall-through (no MFA gating): straight in.
      await refresh();
      toast.success("Welcome back, admin.");
      navigate("/admin");
    } catch (err) {
      const msg = err?.response?.data?.detail || "Login failed";
      toast.error(typeof msg === "string" ? msg : "Login failed");
    } finally {
      setLoading(false);
    }
  };

  if (challenge) {
    return (
      <AdminMfaChallenge
        challenge={challenge}
        onCancel={() => { setChallenge(null); setPassword(""); }}
      />
    );
  }

  return (
    <div className="min-h-screen flex" style={{ background: "#FAFAF8" }}>
      <aside className="hidden md:block w-1/2 relative" style={{ background: "#1A1F3D" }} aria-hidden="true">
        <div className="absolute inset-0 flex flex-col justify-between p-12 text-white">
          <div className="font-serif text-3xl tracking-tight">Roobani</div>
          <div>
            <div className="text-xs tracking-[0.2em] uppercase opacity-70 mb-3 font-mono">Admin Console</div>
            <div className="font-serif text-5xl leading-tight tracking-tight">Institutional control.<br/>Operational clarity.</div>
            <div className="mt-6 text-sm opacity-80 max-w-md leading-relaxed">Secure access for Roobani administrators. Two-tier permissions, immutable audit log, mandatory two-factor authentication.</div>
          </div>
          <div className="text-[11px] tracking-[0.2em] uppercase opacity-50 font-mono">v1.0 / Phase 1</div>
        </div>
      </aside>
      <main className="flex-1 flex items-center justify-center p-8">
        <form onSubmit={submit} className="w-full max-w-md" data-testid="admin-login-form" noValidate>
          <header className="mb-10">
            <div className="text-xs tracking-[0.2em] uppercase font-mono text-[#6B6B6B] mb-3">Restricted Access</div>
            <h1 className="font-serif text-4xl tracking-tight text-[#1C1C1E]">Admin sign in</h1>
            <p className="text-sm text-[#6B6B6B] mt-2">Use your administrator credentials. All actions are logged.</p>
          </header>

          <label htmlFor="admin-email" className="block text-[11px] tracking-[0.2em] uppercase font-mono text-[#6B6B6B] mb-2">Email</label>
          <input
            id="admin-email"
            data-testid="admin-email-input"
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-4 py-3 mb-1 bg-transparent border border-[#E0DDD5] focus:border-[#1A1F3D] outline-none text-[#1C1C1E]"
            placeholder="admin@roobani.com"
            aria-invalid={!!fieldErrors.email}
            aria-describedby={fieldErrors.email ? "admin-email-error" : undefined}
          />
          {fieldErrors.email && (
            <div id="admin-email-error" role="alert" className="text-xs text-[#C0392B] mb-4">{fieldErrors.email}</div>
          )}
          {!fieldErrors.email && <div className="mb-4" />}

          <label htmlFor="admin-password" className="block text-[11px] tracking-[0.2em] uppercase font-mono text-[#6B6B6B] mb-2">Password</label>
          <div className="relative">
            <input
              id="admin-password"
              data-testid="admin-password-input"
              type={showPw ? "text" : "password"}
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 bg-transparent border border-[#E0DDD5] focus:border-[#1A1F3D] outline-none text-[#1C1C1E] pr-16"
              aria-invalid={!!fieldErrors.password}
              aria-describedby={fieldErrors.password ? "admin-password-error" : undefined}
            />
            <button
              type="button"
              onClick={() => setShowPw((s) => !s)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] tracking-[0.15em] uppercase font-mono text-[#6B6B6B] hover:text-[#1A1F3D]"
              aria-label={showPw ? "Hide password" : "Show password"}
            >
              {showPw ? "Hide" : "Show"}
            </button>
          </div>
          {fieldErrors.password && (
            <div id="admin-password-error" role="alert" className="text-xs text-[#C0392B] mt-1 mb-2">{fieldErrors.password}</div>
          )}

          <button
            data-testid="admin-login-submit"
            disabled={loading}
            aria-busy={loading}
            type="submit"
            className="w-full py-3.5 mt-6 text-white text-xs tracking-[0.2em] uppercase font-mono disabled:opacity-60 transition-colors"
            style={{ background: "#1A1F3D", borderRadius: 0 }}
          >
            {loading ? "Signing in..." : "Continue"}
          </button>
          <p className="text-[11px] text-[#6B6B6B] mt-6 leading-relaxed">
            Two-factor authentication is mandatory. You will be prompted for your authenticator code (or a one-time recovery code) after submitting your password. Customer accounts use the standard <a href="/login" className="underline text-[#1A1F3D]">/login</a> page.
          </p>
        </form>
      </main>
    </div>
  );
}
