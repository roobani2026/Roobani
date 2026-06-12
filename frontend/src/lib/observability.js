/**
 * Roobani frontend observability stack — Phase D.
 *
 * Mirrors `backend/observability.py` — three integrations, each a hard
 * no-op when its env var is missing so we can ship the bundle without
 * any keys and the client drops them in later.
 *
 *   1. Sentry crash tracking   →  REACT_APP_SENTRY_DSN
 *   2. Mixpanel analytics      →  REACT_APP_MIXPANEL_TOKEN
 *   3. Crisp live chat         →  REACT_APP_CRISP_WEBSITE_ID  (handled in index.html)
 *
 * Import this module ONCE from `src/index.js` before anything else; the
 * init calls are idempotent but only the first one wins.
 */

const APP_ENV = process.env.REACT_APP_ENV || process.env.NODE_ENV || "development";
const APP_VERSION = process.env.REACT_APP_VERSION || "0.0.0";

let _sentryReady = false;
let _mixpanelReady = false;

/* ─────────────────────────────────────────────────────────────────────
 * Sentry
 * ──────────────────────────────────────────────────────────────────── */
export function initSentry() {
  const dsn = (process.env.REACT_APP_SENTRY_DSN || "").trim();
  if (!dsn) {
    // Stay quiet — single line, not a console.warn, because this is the
    // default state until the client drops the key in.
    // eslint-disable-next-line no-console
    console.info("[obs] Sentry disabled (REACT_APP_SENTRY_DSN not set).");
    return;
  }
  // Lazy-import so the bundle doesn't pay the cost when Sentry is off.
  // eslint-disable-next-line global-require
  const Sentry = require("@sentry/react");
  Sentry.init({
    dsn,
    environment: APP_ENV,
    release: APP_VERSION,
    sendDefaultPii: false,
    tracesSampleRate: APP_ENV === "production" ? 0.3 : 1.0,
    // Replays + profiling cost extra Sentry plan tier — leave at 0 by default.
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: APP_ENV === "production" ? 0.5 : 0,
    beforeSend(event) {
      // Best-effort PII scrub. The backend's `_redact` handles the
      // authoritative copy; this just keeps obvious things from leaving
      // the browser.
      try {
        if (event.user) event.user = {};
        if (event.request?.cookies) event.request.cookies = "[redacted]";
        if (event.request?.headers) {
          const sanitized = {};
          for (const [k, v] of Object.entries(event.request.headers)) {
            const lower = k.toLowerCase();
            sanitized[k] = (lower === "authorization" || lower === "cookie" || lower === "x-api-key") ? "[redacted]" : v;
          }
          event.request.headers = sanitized;
        }
      } catch {
        /* never let redaction break Sentry */
      }
      return event;
    },
  });
  _sentryReady = true;
  // eslint-disable-next-line no-console
  console.info(`[obs] Sentry enabled (env=${APP_ENV}, release=${APP_VERSION}).`);
}

export function captureWarning(error, context = {}) {
  if (!_sentryReady) return;
  // eslint-disable-next-line global-require
  const Sentry = require("@sentry/react");
  Sentry.withScope((scope) => {
    scope.setLevel("warning");
    scope.setTag("handled", "true");
    Object.entries(context).forEach(([k, v]) => scope.setExtra(k, v));
    Sentry.captureException(error);
  });
}

export function captureFromBoundary(error, info, scope) {
  if (!_sentryReady) return;
  // eslint-disable-next-line global-require
  const Sentry = require("@sentry/react");
  Sentry.withScope((s) => {
    s.setTag("boundary_scope", scope || "root");
    s.setExtra("componentStack", info?.componentStack || null);
    Sentry.captureException(error);
  });
}

/* ─────────────────────────────────────────────────────────────────────
 * Mixpanel
 * ──────────────────────────────────────────────────────────────────── */
let _mixpanel = null;

export function initMixpanel() {
  const token = (process.env.REACT_APP_MIXPANEL_TOKEN || "").trim();
  if (!token) {
    // eslint-disable-next-line no-console
    console.info("[obs] Mixpanel disabled (REACT_APP_MIXPANEL_TOKEN not set).");
    return;
  }
  // eslint-disable-next-line global-require
  _mixpanel = require("mixpanel-browser").default || require("mixpanel-browser");
  _mixpanel.init(token, {
    track_pageview: false, // we drive page-view tracking from React Router below
    persistence: "localStorage",
    ignore_dnt: false,
    api_host: "https://api-eu.mixpanel.com",
  });
  _mixpanel.register({
    app_environment: APP_ENV,
    app_version: APP_VERSION,
    $source: "browser",
  });
  _mixpanelReady = true;
  // eslint-disable-next-line no-console
  console.info(`[obs] Mixpanel enabled (env=${APP_ENV}).`);
}

export function track(eventName, props = {}) {
  if (!_mixpanelReady || !_mixpanel) return;
  try {
    _mixpanel.track(eventName, props);
  } catch (e) {
    captureWarning(e, { integration: "mixpanel.track", event: eventName });
  }
}

export function identify(userId, traits = {}) {
  if (!_mixpanelReady || !_mixpanel || !userId) return;
  try {
    _mixpanel.identify(userId);
    if (Object.keys(traits).length > 0) {
      _mixpanel.people.set(traits);
    }
  } catch (e) {
    captureWarning(e, { integration: "mixpanel.identify" });
  }
}

export function resetAnalytics() {
  if (!_mixpanelReady || !_mixpanel) return;
  try {
    _mixpanel.reset();
  } catch {
    /* swallow */
  }
}

/* ─────────────────────────────────────────────────────────────────────
 * Crisp live chat (env-driven script injection)
 * ──────────────────────────────────────────────────────────────────── */
export function initCrisp() {
  const websiteId = (process.env.REACT_APP_CRISP_WEBSITE_ID || "").trim();
  if (!websiteId) {
    // eslint-disable-next-line no-console
    console.info("[obs] Crisp disabled (REACT_APP_CRISP_WEBSITE_ID not set).");
    return;
  }
  if (typeof window === "undefined" || window.$crisp) return;
  window.$crisp = [];
  window.CRISP_WEBSITE_ID = websiteId;
  const s = document.createElement("script");
  s.src = "https://client.crisp.chat/l.js";
  s.async = true;
  document.head.appendChild(s);
  // eslint-disable-next-line no-console
  console.info("[obs] Crisp enabled.");
}

/* ─────────────────────────────────────────────────────────────────────
 * Single entry point
 * ──────────────────────────────────────────────────────────────────── */
export function bootObservability() {
  initSentry();
  initMixpanel();
  // Crisp injects a heavy 3rd-party script — defer until the page is idle
  // so it doesn't compete with the React mount.
  if (typeof window !== "undefined") {
    const fire = () => initCrisp();
    if ("requestIdleCallback" in window) {
      window.requestIdleCallback(fire, { timeout: 3000 });
    } else {
      setTimeout(fire, 2000);
    }
  }
}

export const ready = {
  get sentry() { return _sentryReady; },
  get mixpanel() { return _mixpanelReady; },
};
