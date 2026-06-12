import React, { useEffect, useState } from "react";
import { Link, NavLink, Navigate, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAdminAuth } from "../../lib/adminAuth";
import CurrencySwitcher from "../../components/CurrencySwitcher";

/**
 * Admin shell with a grouped, collapsible navigation organised by business
 * logic (User Management / Operations / Platform / Data & Logs) rather than
 * by raw table name. Each group's open/closed state is persisted in
 * localStorage so admins keep their preferred layout across sessions.
 *
 * Mobile: the sidebar is hidden behind a hamburger toggle and slides in as
 * a drawer with an aria-modal=true container and an Escape handler.
 */
const NAV_PREFS_KEY = "roobani.admin.nav.groups";

function readGroupPrefs() {
  try {
    const raw = localStorage.getItem(NAV_PREFS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (_e) { return null; }
}
function writeGroupPrefs(state) {
  try { localStorage.setItem(NAV_PREFS_KEY, JSON.stringify(state)); } catch (_e) { /* ignore */ }
}

const NavItem = ({ to, end, children, testid, onNavigate }) => (
  <NavLink
    end={end}
    to={to}
    data-testid={testid}
    onClick={onNavigate}
    className={({ isActive }) =>
      `block pl-7 pr-4 py-2 text-[11px] tracking-[0.18em] uppercase font-mono transition-colors border-l-2 ${
        isActive
          ? "bg-[#1A1F3D] text-white border-l-[#C9A84C]"
          : "text-[#6B6B6B] border-l-transparent hover:text-[#1A1F3D] hover:bg-[#F0EDE6]"
      }`
    }
  >
    {children}
  </NavLink>
);

function NavGroup({ id, label, children, defaultOpen = true, openMap, setOpenMap, activePath, routes }) {
  const open = openMap[id] ?? defaultOpen;
  // Force-open if a route inside is active, even when the user collapsed it.
  const forcedOpen = open || (routes || []).some((r) => activePath === r || activePath.startsWith(r + "/"));
  const onToggle = () => {
    const next = { ...openMap, [id]: !open };
    setOpenMap(next);
    writeGroupPrefs(next);
  };
  return (
    <div className="mb-2">
      <button
        type="button"
        onClick={onToggle}
        data-testid={`nav-group-${id}`}
        aria-expanded={forcedOpen}
        className="w-full flex items-center justify-between px-3 py-2 text-[10px] tracking-[0.25em] uppercase font-mono text-[#1A1F3D] hover:text-[#C0392B] transition-colors"
      >
        <span>{label}</span>
        <span aria-hidden="true" className="text-[10px] text-[#6B6B6B]">{forcedOpen ? "−" : "+"}</span>
      </button>
      {forcedOpen && <div className="space-y-0.5">{children}</div>}
    </div>
  );
}

export default function AdminLayout() {
  const { admin, loading, logout } = useAdminAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const isSuper = admin?.access_level === 0;
  const [openMap, setOpenMap] = useState(() => readGroupPrefs() || { users: true, ops: true, platform: true, logs: true });
  const [mobileOpen, setMobileOpen] = useState(false);

  // Close drawer on route change
  useEffect(() => { setMobileOpen(false); }, [location.pathname]);
  // Escape closes drawer
  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e) => { if (e.key === "Escape") setMobileOpen(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [mobileOpen]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#FAFAF8" }}>
        <div className="font-mono text-xs tracking-[0.2em] uppercase text-[#6B6B6B]">Loading...</div>
      </div>
    );
  }
  if (!admin) return <Navigate to="/admin/login" replace />;

  const onLogout = async () => { await logout(); navigate("/admin/login"); };
  const onNavigate = () => setMobileOpen(false);

  const SidebarContent = (
    <>
      <div className="px-6 pt-8 pb-6 border-b border-[#E0DDD5]">
        <Link to="/admin" className="font-serif text-2xl tracking-tight text-[#1A1F3D]">Roobani</Link>
        <div className="text-[10px] tracking-[0.25em] uppercase font-mono text-[#6B6B6B] mt-1">Admin Console</div>
      </div>
      <nav className="flex-1 px-3 py-6 overflow-y-auto" aria-label="Admin sections">
        <NavLink
          to="/admin"
          end
          data-testid="nav-dashboard"
          onClick={onNavigate}
          className={({ isActive }) =>
            `block px-3 py-2 mb-3 text-[11px] tracking-[0.18em] uppercase font-mono transition-colors border-l-2 ${
              isActive ? "bg-[#1A1F3D] text-white border-l-[#C9A84C]" : "text-[#1A1F3D] border-l-transparent hover:bg-[#F0EDE6]"
            }`
          }
        >
          Dashboard
        </NavLink>

        <NavGroup id="users" label="User Management" openMap={openMap} setOpenMap={setOpenMap} activePath={location.pathname} routes={["/admin/customers", "/admin/managers"]}>
          <NavItem to="/admin/customers" testid="nav-customers" onNavigate={onNavigate}>Customers</NavItem>
          {isSuper && <NavItem to="/admin/managers" testid="nav-managers" onNavigate={onNavigate}>Admins &amp; Managers</NavItem>}
        </NavGroup>

        <NavGroup id="ops" label="Operations" openMap={openMap} setOpenMap={setOpenMap} activePath={location.pathname} routes={["/admin/withdrawals"]}>
          <NavItem to="/admin/withdrawals" testid="nav-withdrawals" onNavigate={onNavigate}>Withdrawals</NavItem>
        </NavGroup>

        {isSuper && (
          <NavGroup id="platform" label="Platform" openMap={openMap} setOpenMap={setOpenMap} activePath={location.pathname} routes={["/admin/settings"]}>
            <NavItem to="/admin/settings" testid="nav-settings" onNavigate={onNavigate}>Settings</NavItem>
          </NavGroup>
        )}

        {isSuper && (
          <NavGroup id="logs" label="Data &amp; Logs" openMap={openMap} setOpenMap={setOpenMap} activePath={location.pathname} routes={["/admin/audit"]}>
            <NavItem to="/admin/audit" testid="nav-audit" onNavigate={onNavigate}>Audit Log</NavItem>
          </NavGroup>
        )}
      </nav>
      <div className="px-6 py-6 border-t border-[#E0DDD5]">
        <div className="text-[10px] tracking-[0.2em] uppercase font-mono text-[#6B6B6B]">Signed in</div>
        <div className="text-sm font-medium text-[#1C1C1E] mt-1 truncate">{admin.full_name}</div>
        <div className="text-[11px] text-[#6B6B6B] truncate font-mono">{admin.email}</div>
        <div className="mt-2 flex items-center gap-2 flex-wrap">
          <span className="inline-block text-[10px] tracking-[0.2em] uppercase font-mono px-2 py-1" style={{ background: isSuper ? "#1A1F3D" : "#C9A84C", color: isSuper ? "#FAFAF8" : "#1C1C1E" }}>Access {admin.access_level}</span>
          <span
            className="inline-block text-[10px] tracking-[0.2em] uppercase font-mono px-2 py-1"
            style={{ background: admin.mfa_enabled ? "#3A7D5C" : "#C0392B", color: "#FAFAF8" }}
            title={admin.mfa_enabled ? `MFA on · ${admin.recovery_codes_remaining}/8 recovery codes left` : "MFA not enrolled"}
          >
            2FA {admin.mfa_enabled ? "ON" : "OFF"}
          </span>
        </div>
        <div className="mt-4">
          <CurrencySwitcher variant="labeled" data-testid="admin-currency-switcher" />
        </div>
        <button
          data-testid="admin-logout"
          onClick={onLogout}
          className="mt-4 w-full text-[11px] tracking-[0.2em] uppercase font-mono text-[#6B6B6B] hover:text-[#C0392B] text-left transition-colors"
        >
          Sign out
        </button>
      </div>
    </>
  );

  return (
    <div className="min-h-screen flex" style={{ background: "#FAFAF8" }}>
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-64 border-r border-[#E0DDD5] flex-col sticky top-0 h-screen" style={{ background: "#FAFAF8" }} aria-label="Primary">
        {SidebarContent}
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <>
          <div
            className="md:hidden fixed inset-0 bg-black/40 z-40"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
          <aside
            role="dialog"
            aria-modal="true"
            aria-label="Admin navigation"
            className="md:hidden fixed top-0 left-0 bottom-0 w-72 z-50 flex flex-col border-r border-[#E0DDD5]"
            style={{ background: "#FAFAF8" }}
          >
            {SidebarContent}
          </aside>
        </>
      )}

      <main className="flex-1 min-w-0">
        {/* Mobile top bar */}
        <div className="md:hidden flex items-center justify-between px-4 py-3 border-b border-[#E0DDD5] bg-[#FAFAF8] sticky top-0 z-30">
          <button
            type="button"
            data-testid="admin-mobile-nav-toggle"
            onClick={() => setMobileOpen(true)}
            aria-label="Open navigation"
            aria-expanded={mobileOpen}
            className="px-3 py-1.5 text-[11px] tracking-[0.2em] uppercase font-mono border border-[#E0DDD5] text-[#1A1F3D]"
          >
            Menu
          </button>
          <Link to="/admin" className="font-serif text-xl tracking-tight text-[#1A1F3D]">Roobani</Link>
          <span className="text-[10px] tracking-[0.2em] uppercase font-mono text-[#6B6B6B]">Access {admin.access_level}</span>
        </div>
        <Outlet />
      </main>
    </div>
  );
}
