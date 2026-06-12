import React, { useEffect, useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { Menu, X } from "lucide-react";
import { Logo } from "./Logo";
import { useAuth } from "../lib/auth";
import ThemeToggle from "./ThemeToggle";
import CurrencySwitcher from "./CurrencySwitcher";

const NAV = [
  { to: "/", label: "Home" },
  { to: "/plans#foundation", label: "Investment Plans" },
  { to: "/about", label: "About" },
  { to: "/contact", label: "Contact" },
];

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const { user, logout } = useAuth();
  const loc = useLocation();
  const nav = useNavigate();
  const handleLogout = async () => { await logout(); nav("/", { replace: true }); };

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 16);
    onScroll();
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => { setOpen(false); }, [loc.pathname]);

  return (
    <header
      data-testid="navbar"
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled ? "rb-glass border-b border-rb-border" : "bg-transparent"
      }`}
    >
      <div className="max-w-[1400px] mx-auto px-6 md:px-12 h-24 md:h-32 flex items-center justify-between">
        <Link to="/" data-testid="nav-logo-link" className="flex items-center">
          <span className="hidden md:inline-flex"><Logo size={92} /></span>
          <span className="inline-flex md:hidden"><Logo size={56} /></span>
        </Link>

        <nav className="hidden lg:flex items-center gap-10">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              data-testid={`nav-link-${n.label.toLowerCase().replace(/\s+/g, "-")}`}
              className={({ isActive }) =>
                `text-[13px] tracking-[0.08em] uppercase font-medium rb-underline transition-colors ${
                  isActive ? "text-rb-navy" : "text-rb-text"
                }`
              }
            >
              {n.label}
            </NavLink>
          ))}
        </nav>

        <div className="hidden lg:flex items-center gap-4">
          <CurrencySwitcher data-testid="nav-currency-switcher" />
          <ThemeToggle data-testid="nav-theme-toggle" />
          {user ? (
            <>
              <Link to="/dashboard" className="rb-btn rb-btn-secondary" data-testid="nav-dashboard">
                <span>Dashboard</span>
              </Link>
              <button onClick={handleLogout} className="rb-btn rb-btn-ghost" data-testid="nav-logout">
                <span className="rb-line">Sign Out</span>
              </button>
            </>
          ) : (
            <>
              <Link to="/login" className="rb-btn rb-btn-ghost" data-testid="nav-login">
                <span className="rb-line">Sign In</span>
              </Link>
              <Link to="/signup" className="rb-btn rb-btn-primary" data-testid="nav-signup">
                <span>Open Account</span>
              </Link>
            </>
          )}
        </div>

        <button
          className="lg:hidden p-2"
          onClick={() => setOpen((s) => !s)}
          aria-label="Toggle navigation"
          data-testid="nav-mobile-toggle"
        >
          {open ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>

      {open && (
        <div className="lg:hidden rb-glass border-t border-rb-border" data-testid="nav-mobile-panel">
          <div className="max-w-[1400px] mx-auto px-6 py-8 flex flex-col gap-6">
            {NAV.map((n) => (
              <Link
                key={n.to}
                to={n.to}
                data-testid={`nav-mobile-${n.label.toLowerCase().replace(/\s+/g, "-")}`}
                className="text-base tracking-[0.06em] uppercase font-medium text-rb-text"
              >
                {n.label}
              </Link>
            ))}
            <div className="rb-hr my-2" />
            <div className="flex items-center gap-2">
              <CurrencySwitcher variant="labeled" data-testid="nav-mobile-currency-switcher" />
              <ThemeToggle variant="labeled" data-testid="nav-mobile-theme-toggle" />
            </div>
            {user ? (
              <>
                <Link to="/dashboard" className="rb-btn rb-btn-secondary" data-testid="nav-mobile-dashboard"><span>Dashboard</span></Link>
                <button onClick={handleLogout} className="rb-btn rb-btn-primary" data-testid="nav-mobile-logout"><span>Sign Out</span></button>
              </>
            ) : (
              <>
                <Link to="/login" className="rb-btn rb-btn-secondary" data-testid="nav-mobile-login"><span>Sign In</span></Link>
                <Link to="/signup" className="rb-btn rb-btn-primary" data-testid="nav-mobile-signup"><span>Open Account</span></Link>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
