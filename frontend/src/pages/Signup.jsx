import React, { useState, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Eye, EyeOff } from "lucide-react";
import { Logo } from "../components/Logo";
import SEO from "../components/SEO";

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden>
      <path fill="#4285F4" d="M22.5 12.27c0-.83-.07-1.62-.21-2.39H12v4.51h5.92a5.07 5.07 0 0 1-2.2 3.33v2.77h3.56c2.08-1.92 3.22-4.74 3.22-8.22Z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.47-.98 7.29-2.66l-3.56-2.77c-.99.66-2.26 1.05-3.73 1.05-2.87 0-5.3-1.94-6.17-4.55H2.16v2.85A11 11 0 0 0 12 23Z"/>
      <path fill="#FBBC05" d="M5.83 14.07A6.6 6.6 0 0 1 5.46 12c0-.72.13-1.42.36-2.07V7.08H2.16A11 11 0 0 0 1 12c0 1.77.43 3.45 1.16 4.92l3.67-2.85Z"/>
      <path fill="#EA4335" d="M12 5.42c1.62 0 3.07.56 4.21 1.65l3.16-3.16C17.46 2.06 14.97 1 12 1A11 11 0 0 0 2.16 7.08l3.67 2.85C6.7 7.36 9.13 5.42 12 5.42Z"/>
    </svg>
  );
}

function strength(pw) {
  let s = 0;
  if (pw.length >= 8) s++;
  if (pw.length >= 12) s++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++;
  if (/\d/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  return s;
}

export default function Signup() {
  const nav = useNavigate();
  const { refresh } = useAuth();
  const [form, setForm] = useState({ full_name: "", email: "", password: "", confirm: "", consent: false });
  const [show, setShow] = useState(false);
  const [state, setState] = useState({ loading: false, error: "" });
  const score = useMemo(() => strength(form.password), [form.password]);
  const labels = ["", "Weak", "Weak", "Fair", "Strong", "Strong"];

  const startGoogle = () => {
    // REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
    const redirectUrl = window.location.origin + "/dashboard";
    window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
  };

  const submit = async (e) => {
    e.preventDefault();
    setState({ loading: true, error: "" });
    if (form.password !== form.confirm) {
      setState({ loading: false, error: "Passwords do not match." });
      return;
    }
    if (!form.consent) {
      setState({ loading: false, error: "Please accept the terms to continue." });
      return;
    }
    try {
      await api.post("/auth/register", {
        full_name: form.full_name,
        email: form.email,
        password: form.password,
        consent: form.consent,
      });
      await refresh();
      nav("/dashboard");
    } catch (err) {
      const msg = err.response?.data?.detail || "Could not create account.";
      setState({ loading: false, error: typeof msg === "string" ? msg : "Sign up failed." });
    }
  };

  return (
    <div className="min-h-screen grid grid-cols-1 lg:grid-cols-2" data-testid="signup-page">
      <SEO
        title="Open Account"
        description="Open your Roobani client account. KYC in 48 hours, paired with a dedicated portfolio manager."
        noindex
      />
      <div className="flex items-center justify-center p-8 md:p-16 pt-32 md:pt-32">
        <div className="w-full max-w-md">
          <Link to="/" className="inline-flex"><Logo size={36} /></Link>

          <div className="rb-mono text-[11px] uppercase tracking-[0.22em] text-rb-text2 mt-12">Open Account</div>
          <h1 className="rb-display text-4xl md:text-5xl text-rb-navy mt-2">Start with intent.</h1>

          <div className="mt-10 space-y-3">
            <button onClick={startGoogle} className="rb-btn rb-btn-secondary w-full justify-center" data-testid="signup-google">
              <GoogleIcon /><span>Continue with Google</span>
            </button>
          </div>

          <div className="flex items-center gap-4 my-8">
            <div className="h-px flex-1 bg-rb-border" />
            <div className="rb-mono text-[10px] uppercase tracking-[0.22em] text-rb-text2">or create with email</div>
            <div className="h-px flex-1 bg-rb-border" />
          </div>

          <form onSubmit={submit} className="space-y-6" data-testid="signup-form">
            <div>
              <label className="rb-label" htmlFor="signup-name">Full Name</label>
              <input id="signup-name" data-testid="signup-name" required className="rb-input"
                value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} placeholder="Your name" />
            </div>
            <div>
              <label className="rb-label" htmlFor="signup-email">Email Address</label>
              <input id="signup-email" data-testid="signup-email" required type="email" className="rb-input"
                value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="you@example.com" />
            </div>
            <div>
              <label className="rb-label" htmlFor="signup-password">Password</label>
              <div className="relative">
                <input id="signup-password" data-testid="signup-password" required type={show ? "text" : "password"} className="rb-input pr-10"
                  value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} minLength={8} />
                <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-0 top-1/2 -translate-y-1/2 p-2 text-rb-text2" aria-label="Toggle password visibility">
                  {show ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              <div className="flex items-center gap-2 mt-2">
                <div className="flex gap-1 flex-1">
                  {[1,2,3,4,5].map((i) => (
                    <span key={i} className={`h-1 flex-1 ${i <= score ? (score < 3 ? "bg-rb-alert" : score < 4 ? "bg-rb-gold" : "bg-rb-success") : "bg-rb-border"}`} />
                  ))}
                </div>
                <div className="rb-mono text-[10px] uppercase tracking-[0.18em] text-rb-text2 w-14 text-right" data-testid="signup-strength">{labels[score] || ""}</div>
              </div>
            </div>
            <div>
              <label className="rb-label" htmlFor="signup-confirm">Confirm Password</label>
              <input id="signup-confirm" data-testid="signup-confirm" required type={show ? "text" : "password"} className="rb-input"
                value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} minLength={8} />
            </div>

            <label className="flex items-start gap-3 cursor-pointer">
              <input type="checkbox" className="mt-1 accent-rb-navy" required
                checked={form.consent} onChange={(e) => setForm({ ...form, consent: e.target.checked })} data-testid="signup-consent" />
              <span className="text-sm text-rb-text2">I agree to the Terms of Service and Privacy Policy.</span>
            </label>

            {state.error && <div className="text-sm text-rb-alert border border-rb-alert/40 bg-rb-alert/5 px-4 py-3" data-testid="signup-error">{state.error}</div>}

            <button type="submit" disabled={state.loading} className="rb-btn rb-btn-primary w-full justify-center" data-testid="signup-submit">
              <span>{state.loading ? "Creating account ..." : "Create Account"}</span>
            </button>

            <div className="text-sm text-rb-text2">
              Already have an account? <Link to="/login" className="rb-underline text-rb-text" data-testid="signup-login-link">Sign in</Link>
            </div>
          </form>
        </div>
      </div>

      <div className="hidden lg:block relative">
        <img src="https://images.unsplash.com/photo-1660020619062-70b16c44bf0f?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NTY2Njd8MHwxfHNlYXJjaHwzfHxmaW5hbmNpYWwlMjBjaGFydHN8ZW58MHx8fGJsdWV8MTc4MTI0NDMxM3ww&ixlib=rb-4.1.0&q=85" alt="Live trading terminal showing financial charts and market data." className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0 bg-rb-navy/5 mix-blend-multiply" />
      </div>
    </div>
  );
}
