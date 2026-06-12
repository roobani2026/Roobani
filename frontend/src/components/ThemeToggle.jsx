import React from "react";
import { Sun, Moon } from "lucide-react";
import { useTheme } from "../lib/theme";

/**
 * Compact theme toggle button.
 *
 * Props:
 *   variant: "icon"   – icon-only (default, used in navbars)
 *           "labeled" – icon + "Light"/"Dark" label (used in menus)
 *   className: extra classes to merge
 *   "data-testid": override test id (default "theme-toggle")
 */
export default function ThemeToggle({ variant = "icon", className = "", ...rest }) {
  const { resolvedTheme, toggleTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const label = isDark ? "Switch to light mode" : "Switch to dark mode";
  const testid = rest["data-testid"] || "theme-toggle";

  const Icon = isDark ? Sun : Moon;

  const base =
    "inline-flex items-center justify-center border border-rb-border " +
    "text-rb-text hover:border-rb-navy hover:text-rb-navy " +
    "transition-colors duration-200 select-none";

  if (variant === "labeled") {
    return (
      <button
        type="button"
        onClick={toggleTheme}
        aria-label={label}
        title={label}
        data-testid={testid}
        className={`${base} gap-2 px-3 py-2 rb-mono text-[10px] uppercase tracking-[0.2em] ${className}`}
      >
        <Icon size={14} />
        <span>{isDark ? "Light" : "Dark"}</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={label}
      title={label}
      data-testid={testid}
      className={`${base} w-9 h-9 ${className}`}
    >
      <Icon size={16} />
    </button>
  );
}
