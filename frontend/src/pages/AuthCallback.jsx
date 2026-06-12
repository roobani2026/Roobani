import React, { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";

export default function AuthCallback() {
  const nav = useNavigate();
  const { refresh } = useAuth();
  const processed = useRef(false);

  useEffect(() => {
    // REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
    if (processed.current) return;
    processed.current = true;
    const hash = window.location.hash || "";
    const m = hash.match(/session_id=([^&]+)/);
    const sessionId = m ? decodeURIComponent(m[1]) : "";
    (async () => {
      if (!sessionId) {
        nav("/login", { replace: true });
        return;
      }
      try {
        await api.post("/auth/session", { session_id: sessionId });
        // Clear the hash BEFORE calling refresh so the auth.jsx guard doesn't skip /auth/me
        window.history.replaceState({}, "", "/dashboard");
        await refresh();
        nav("/dashboard", { replace: true });
      } catch (e) {
        nav("/login?error=oauth", { replace: true });
      }
    })();
  }, [nav, refresh]);

  return (
    <div className="min-h-screen flex items-center justify-center" data-testid="auth-callback">
      <div className="rb-mono text-[11px] uppercase tracking-[0.22em] text-rb-text2">Signing you in ...</div>
    </div>
  );
}
