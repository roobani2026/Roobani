import React, { useEffect, useState } from "react";
import { NavLink, Link } from "react-router-dom";
import { api } from "../lib/api";
import { LayoutGrid, ListOrdered, ArrowDownToLine, ShieldCheck, Bell, User, TrendingUp, Plus } from "lucide-react";
import ThemeToggle from "./ThemeToggle";
import CurrencySwitcher from "./CurrencySwitcher";

const ITEMS = [
  { to: "/dashboard", label: "Portfolio", Icon: LayoutGrid, end: true, testid: "subnav-portfolio" },
  { to: "/dashboard/transactions", label: "Transactions", Icon: ListOrdered, testid: "subnav-transactions" },
  { to: "/dashboard/withdraw", label: "Withdraw", Icon: ArrowDownToLine, testid: "subnav-withdraw" },
  { to: "/dashboard/upgrade", label: "Upgrade", Icon: TrendingUp, testid: "subnav-upgrade" },
  { to: "/dashboard/kyc", label: "KYC", Icon: ShieldCheck, testid: "subnav-kyc" },
  { to: "/dashboard/notifications", label: "Notifications", Icon: Bell, testid: "subnav-notifications", showBadge: true },
  { to: "/dashboard/profile", label: "Profile", Icon: User, testid: "subnav-profile" },
];

export default function DashboardSubNav() {
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const pull = async () => {
      try {
        const r = await api.get("/notifications", { params: { unread_only: true } });
        if (!cancelled) setUnread(Number(r.data?.unread_count || 0));
      } catch { /* silent */ }
    };
    pull();
    const id = setInterval(pull, 30000);
    const onRefresh = () => pull();
    window.addEventListener("notif:refresh", onRefresh);
    return () => { cancelled = true; clearInterval(id); window.removeEventListener("notif:refresh", onRefresh); };
  }, []);

  return (
    <div className="border-b border-rb-border bg-white sticky top-[64px] md:top-[72px] z-30" data-testid="dashboard-subnav">
      <div className="max-w-[1400px] mx-auto px-6 md:px-12">
        <nav className="flex items-center gap-1 overflow-x-auto -mx-2 px-2 py-1">
          {ITEMS.map(({ to, label, Icon, end, testid, showBadge }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              data-testid={testid}
              className={({ isActive }) =>
                `relative inline-flex items-center gap-2 px-4 py-3 rb-mono text-[11px] uppercase tracking-[0.18em] whitespace-nowrap transition-colors ${
                  isActive
                    ? "text-rb-navy border-b-2 border-rb-gold"
                    : "text-rb-text2 border-b-2 border-transparent hover:text-rb-navy"
                }`
              }
            >
              <Icon size={14} strokeWidth={1.4} />
              <span>{label}</span>
              {showBadge && unread > 0 && (
                <span className="ml-1 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] rb-mono bg-rb-gold text-rb-navy" data-testid="notif-unread-badge">
                  {unread > 99 ? "99+" : unread}
                </span>
              )}
            </NavLink>
          ))}
          <div className="ml-auto flex items-center gap-2 pl-2">
            <Link
              to="/dashboard?add=1"
              data-testid="subnav-add-funds"
              className="inline-flex items-center gap-1.5 bg-rb-navy text-rb-on-navy hover:bg-rb-gold hover:text-rb-navy px-3 py-2 rb-mono text-[10px] uppercase tracking-[0.18em] whitespace-nowrap transition-colors"
            >
              <Plus size={12} strokeWidth={2.2} />
              <span>Add Funds</span>
            </Link>
            <ThemeToggle data-testid="dashboard-theme-toggle" className="w-8 h-8" />
            <CurrencySwitcher data-testid="dashboard-currency-switcher" />
          </div>
        </nav>
      </div>
    </div>
  );
}
