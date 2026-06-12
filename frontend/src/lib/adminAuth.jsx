import React, { useEffect, useState, useContext, createContext, useCallback } from "react";
import { api } from "./api";

const AdminAuthContext = createContext({ admin: null, loading: true, refresh: async () => {}, logout: async () => {} });

export function AdminAuthProvider({ children }) {
  const [admin, setAdmin] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const r = await api.get("/admin/auth/me");
      setAdmin(r.data);
    } catch (e) {
      setAdmin(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    try { await api.post("/admin/auth/logout", {}); } catch (e) {}
    setAdmin(null);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  return (
    <AdminAuthContext.Provider value={{ admin, loading, refresh, setAdmin, logout }}>
      {children}
    </AdminAuthContext.Provider>
  );
}

export function useAdminAuth() { return useContext(AdminAuthContext); }
