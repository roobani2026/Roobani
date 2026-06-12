import React from "react";
import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../lib/auth";
import DashboardSubNav from "../components/DashboardSubNav";

export default function DashboardLayout() {
  const { user, loading } = useAuth();
  if (loading) return <div className="pt-40 px-12 rb-mono text-sm text-rb-text2" data-testid="dashboard-loading">Loading ...</div>;
  if (!user) return <Navigate to="/login" replace />;
  return (
    <div data-testid="dashboard-shell">
      <div className="pt-28 md:pt-32" />
      <DashboardSubNav />
      <Outlet />
    </div>
  );
}
