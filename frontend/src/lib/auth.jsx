import React, { useEffect, useState, useContext, createContext, useCallback } from "react";
import { api } from "../lib/api";
import { identify, resetAnalytics } from "../lib/observability";

const AuthContext = createContext({ user: null, loading: true, refresh: async () => {}, logout: async () => {} });

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    // CRITICAL: If returning from OAuth callback, skip the /me check.
    // AuthCallback will exchange the session_id and establish the session first.
    if (typeof window !== "undefined" && window.location.hash?.includes("session_id=")) {
      setLoading(false);
      return;
    }
    try {
      const r = await api.get("/auth/me");
      setUser(r.data);
      // Stitch anonymous → authenticated in Mixpanel + give Sentry the user
      // context (id only — sendDefaultPii is off so we never get the email).
      if (r.data?.user_id) {
        identify(r.data.user_id, { user_id: r.data.user_id });
      }
    } catch (e) {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    try { await api.post("/auth/logout", {}); } catch (e) { /* ignore */ }
    setUser(null);
    resetAnalytics();
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  return (
    <AuthContext.Provider value={{ user, loading, refresh, setUser, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() { return useContext(AuthContext); }
