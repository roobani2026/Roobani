import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

/**
 * Theme system
 * - Persists user choice in localStorage under "rb-theme"
 * - Falls back to system preference (prefers-color-scheme: dark)
 * - Adds/removes `dark` class on <html> so Tailwind dark mode + CSS variable
 *   overrides take effect
 *
 * Public API:
 *   const { theme, resolvedTheme, setTheme, toggleTheme } = useTheme();
 *     theme:         "light" | "dark" | "system"
 *     resolvedTheme: "light" | "dark"  (what's actually applied)
 */

const STORAGE_KEY = "rb-theme";
const ThemeContext = createContext(null);

function getSystemPref() {
  if (typeof window === "undefined") return "light";
  try {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  } catch (e) {
    return "light";
  }
}

function readStored() {
  if (typeof window === "undefined") return "system";
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    if (v === "light" || v === "dark" || v === "system") return v;
  } catch (e) { /* ignore */ }
  return "system";
}

function applyClass(resolved) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (resolved === "dark") root.classList.add("dark");
  else root.classList.remove("dark");
  root.setAttribute("data-theme", resolved);
  root.style.colorScheme = resolved;
}

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() => readStored());
  const [systemPref, setSystemPref] = useState(() => getSystemPref());

  const resolvedTheme = theme === "system" ? systemPref : theme;

  // Apply class on every change
  useEffect(() => { applyClass(resolvedTheme); }, [resolvedTheme]);

  // Listen for system preference changes (only matters when theme === "system")
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e) => setSystemPref(e.matches ? "dark" : "light");
    try { mq.addEventListener("change", handler); }
    catch (e) { mq.addListener(handler); /* legacy Safari */ }
    return () => {
      try { mq.removeEventListener("change", handler); }
      catch (e) { mq.removeListener(handler); }
    };
  }, []);

  const setTheme = useCallback((value) => {
    if (value !== "light" && value !== "dark" && value !== "system") return;
    setThemeState(value);
    try { window.localStorage.setItem(STORAGE_KEY, value); } catch (e) { /* ignore */ }
  }, []);

  const toggleTheme = useCallback(() => {
    // Toggle between explicit light <-> dark (ignores "system")
    setTheme(resolvedTheme === "dark" ? "light" : "dark");
  }, [resolvedTheme, setTheme]);

  const value = useMemo(
    () => ({ theme, resolvedTheme, setTheme, toggleTheme }),
    [theme, resolvedTheme, setTheme, toggleTheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    // Fail-safe no-op so components don't crash if Provider is missing
    return { theme: "light", resolvedTheme: "light", setTheme: () => {}, toggleTheme: () => {} };
  }
  return ctx;
}
