import axios from "axios";

// Resolve API base URL.
// In the browser we prefer SAME-ORIGIN ("/api") so the request is never cross-origin.
// The Kubernetes ingress always proxies /api/* to the backend on whichever (sub)domain
// the user accessed, so this is universally correct AND avoids the edge layer overriding
// CORS headers to `*` (which breaks credentialed requests when the user is on a different
// preview subdomain than REACT_APP_BACKEND_URL).
//
// REACT_APP_BACKEND_URL is still respected as the absolute fallback (e.g. SSR, tests,
// or non-browser callers). It is NOT modified.
const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || "";
const sameOrigin = typeof window !== "undefined" && !!window.location?.origin;
export const API = sameOrigin ? "/api" : `${BACKEND_URL}/api`;

export const api = axios.create({
  baseURL: API,
  withCredentials: true,
  headers: { "Content-Type": "application/json" },
});
