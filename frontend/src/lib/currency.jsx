import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { api } from "./api";

/**
 * Sitewide currency system.
 *
 * - Default currency: KES (Kenyan Shilling). User preference is persisted in
 *   localStorage under "rb-currency".
 * - Live FX rates pulled from GET /api/fx/rates (Yahoo Finance, USD base),
 *   refreshed every 60s. A sensible static fallback is used until the first
 *   network call completes, so amounts never render as `$NaN`.
 * - All monetary values in the codebase are stored / received as USD numbers
 *   (Stripe + holdings store in USD). Components should call
 *   `formatMoney(usdAmount)` from `useCurrency()` to display.
 */

const STORAGE_KEY = "rb-currency";
const DEFAULT_CURRENCY = "KES";

const FALLBACK_RATES = {
  USD: 1.0,
  EUR: 0.92,
  GBP: 0.79,
  KES: 129.0,
};

export const SUPPORTED = [
  { code: "KES", label: "Kenyan Shilling", symbol: "KES", display: "KES" },
  { code: "USD", label: "US Dollar", symbol: "$", display: "USD" },
  { code: "EUR", label: "Euro", symbol: "€", display: "EUR" },
  { code: "GBP", label: "British Pound", symbol: "£", display: "GBP" },
];

const CurrencyContext = createContext(null);

function readStored() {
  if (typeof window === "undefined") return DEFAULT_CURRENCY;
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    if (v && SUPPORTED.find((c) => c.code === v)) return v;
  } catch (e) {
    /* ignore */
  }
  return DEFAULT_CURRENCY;
}

export function CurrencyProvider({ children }) {
  const [currency, setCurrencyState] = useState(() => readStored());
  const [rates, setRates] = useState(FALLBACK_RATES);
  const [updatedAt, setUpdatedAt] = useState(null);

  const setCurrency = useCallback((code) => {
    if (!SUPPORTED.find((c) => c.code === code)) return;
    setCurrencyState(code);
    try {
      window.localStorage.setItem(STORAGE_KEY, code);
    } catch (e) {
      /* ignore */
    }
  }, []);

  // Poll FX rates every 60 seconds
  useEffect(() => {
    let cancelled = false;
    const pull = async () => {
      try {
        const r = await api.get("/fx/rates");
        if (cancelled) return;
        const next = r.data?.rates;
        if (next && typeof next === "object") {
          setRates((prev) => ({ ...prev, ...next }));
          setUpdatedAt(r.data?.updated_at || null);
        }
      } catch (e) {
        /* keep last good rates */
      }
    };
    pull();
    const id = setInterval(pull, 60000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const convertFromUSD = useCallback(
    (usdAmount) => {
      const n = Number(usdAmount || 0);
      const rate = rates[currency] ?? FALLBACK_RATES[currency] ?? 1;
      return n * rate;
    },
    [currency, rates]
  );

  const formatMoney = useCallback(
    (usdAmount, opts = {}) => {
      const { maximumFractionDigits, compact = false } = opts;
      const converted = convertFromUSD(usdAmount);
      // KES rarely shows decimals; majors get up to 2.
      const defaultDigits = currency === "KES" ? 0 : 2;
      const md =
        typeof maximumFractionDigits === "number"
          ? maximumFractionDigits
          : defaultDigits;
      const sym = SUPPORTED.find((c) => c.code === currency)?.symbol || "";
      const display = SUPPORTED.find((c) => c.code === currency)?.display || currency;
      try {
        const numStr = new Intl.NumberFormat("en-US", {
          maximumFractionDigits: md,
          minimumFractionDigits: 0,
          notation: compact ? "compact" : "standard",
        }).format(converted);
        // For KES we render the canonical "KSH" prefix per user preference;
        // for others, render the conventional symbol ($, €, £) before the amount.
        if (currency === "KES") return `${display} ${numStr}`;
        return `${sym}${numStr}`;
      } catch (e) {
        return `${sym} ${converted.toFixed(md)}`;
      }
    },
    [convertFromUSD, currency]
  );

  const value = useMemo(
    () => ({
      currency,
      setCurrency,
      rates,
      updatedAt,
      formatMoney,
      convertFromUSD,
      supported: SUPPORTED,
    }),
    [currency, setCurrency, rates, updatedAt, formatMoney, convertFromUSD]
  );

  return (
    <CurrencyContext.Provider value={value}>
      {children}
    </CurrencyContext.Provider>
  );
}

export function useCurrency() {
  const ctx = useContext(CurrencyContext);
  if (!ctx) {
    // Fail-safe — render USD without conversion if provider missing
    return {
      currency: "USD",
      setCurrency: () => {},
      rates: FALLBACK_RATES,
      updatedAt: null,
      supported: SUPPORTED,
      convertFromUSD: (n) => Number(n || 0),
      formatMoney: (n) =>
        `$${Number(n || 0).toLocaleString("en-US", {
          maximumFractionDigits: 2,
        })}`,
    };
  }
  return ctx;
}
