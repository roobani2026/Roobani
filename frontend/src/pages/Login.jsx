import React, { useState } from "react";
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

export default function Login() {
  const nav = useNavigate();
  const { refresh } = useAuth();
  const [form, setForm] = useState({ email: "", password: "" });
  const [show, setShow] = useState(false);
  const [state, setState] = useState({ loading: false, error: "" });

  const startGoogle = () => {
    // REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
    const redirectUrl = window.location.origin + "/dashboard";
    window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
  };

  const submit = async (e) => {
    e.preventDefault();
    setState({ loading: true, error: "" });
    try {
      await api.post("/auth/login", form);
      await refresh();
      nav("/dashboard");
    } catch (err) {
      const msg = err.response?.data?.detail || "Could not sign in.";
      setState({ loading: false, error: typeof msg === "string" ? msg : "Sign in failed." });
    }
  };

  return (
    <div className="min-h-screen grid grid-cols-1 lg:grid-cols-2" data-testid="login-page">
      <SEO
        title="Sign In"
        description="Sign in to your Roobani client portal."
        noindex
      />
      <div className="flex items-center justify-center p-8 md:p-16 pt-32 md:pt-32">
        <div className="w-full max-w-md">
          <Link to="/" className="inline-flex"><Logo size={36} /></Link>

          <div className="rb-mono text-[11px] uppercase tracking-[0.22em] text-rb-text2 mt-12">Sign In</div>
          <h1 className="rb-display text-4xl md:text-5xl text-rb-navy mt-2">Welcome back.</h1>

          <div className="mt-10 space-y-3">
            <button onClick={startGoogle} className="rb-btn rb-btn-secondary w-full justify-center" data-testid="login-google">
              <GoogleIcon /><span>Continue with Google</span>
            </button>
          </div>

          <div className="flex items-center gap-4 my-8">
            <div className="h-px flex-1 bg-rb-border" />
            <div className="rb-mono text-[10px] uppercase tracking-[0.22em] text-rb-text2">or continue with email</div>
            <div className="h-px flex-1 bg-rb-border" />
          </div>

          <form onSubmit={submit} className="space-y-6" data-testid="login-form">
            <div>
              <label className="rb-label" htmlFor="login-email">Email Address</label>
              <input id="login-email" data-testid="login-email" required type="email" className="rb-input"
                value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="you@example.com" autoComplete="email" />
            </div>
            <div>
              <label className="rb-label" htmlFor="login-password">Password</label>
              <div className="relative">
                <input id="login-password" data-testid="login-password" required type={show ? "text" : "password"} className="rb-input pr-10"
                  value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="" autoComplete="current-password" />
                <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-0 top-1/2 -translate-y-1/2 p-2 text-rb-text2" data-testid="login-show-password" aria-label="Toggle password visibility">
                  {show ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {state.error && <div className="text-sm text-rb-alert border border-rb-alert/40 bg-rb-alert/5 px-4 py-3" data-testid="login-error">{state.error}</div>}

            <button type="submit" disabled={state.loading} className="rb-btn rb-btn-primary w-full justify-center" data-testid="login-submit">
              <span>{state.loading ? "Signing in ..." : "Sign In"}</span>
            </button>
          </form>

          <div className="flex items-center justify-between mt-8 text-sm">
            <Link to="/auth/forgot" className="rb-underline text-rb-text2" data-testid="login-forgot">Forgot password</Link>
            <Link to="/signup" className="rb-underline text-rb-text2" data-testid="login-signup-link">Create account</Link>
          </div>
        </div>
      </div>

      <div className="hidden lg:block relative">
        <img src="https://images.unsplash.com/photo-1660020619062-70b16c44bf0f?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NTY2Njd8MHwxfHNlYXJjaHwzfHxmaW5hbmNpYWwlMjBjaGFydHN8ZW58MHx8fGJsdWV8MTc4MTI0NDMxM3ww&ixlib=rb-4.1.0&q=85" alt="Live trading terminal showing financial charts and market data." className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0 bg-rb-navy/5 mix-blend-multiply" />
        <div className="absolute bottom-12 left-12 right-12 rb-glass border border-rb-border p-8 max-w-md">
          <div className="rb-mono text-[10px] uppercase tracking-[0.22em] text-rb-text2">Investor Note</div>
          <p className="rb-display text-2xl text-rb-navy mt-2">
            Discipline beats intuition. Process beats prediction.
          </p>
        </div>
      </div>
    </div>
  );
}
