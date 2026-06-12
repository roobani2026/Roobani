/* Live crypto last-price stream.
 * Primary:  backend WS proxy at  ${REACT_APP_BACKEND_URL}/api/ws/crypto
 * Fallback: direct Binance public WS for clients on networks that block our backend WS
 * Emits  { symbol, price, change_pct_24h }  updates to subscribers.
 */

const BACKEND = process.env.REACT_APP_BACKEND_URL || "";
const BROWSER_ORIGIN = typeof window !== "undefined" ? window.location?.origin || "" : "";
// Prefer same-origin to avoid cross-subdomain issues (see note in lib/api.js)
const BASE = BROWSER_ORIGIN || BACKEND;
const PROXY_URL = BASE.replace(/^http/i, "ws") + "/api/ws/crypto";
const DIRECT_URL = "wss://stream.binance.com:9443/stream?streams=btcusdt@ticker/ethusdt@ticker/solusdt@ticker/bnbusdt@ticker/adausdt@ticker/xrpusdt@ticker";

const SYMBOL_MAP = {
  BTCUSDT: { symbol: "BTC", name: "Bitcoin" },
  ETHUSDT: { symbol: "ETH", name: "Ethereum" },
  SOLUSDT: { symbol: "SOL", name: "Solana" },
  BNBUSDT: { symbol: "BNB", name: "BNB" },
  ADAUSDT: { symbol: "ADA", name: "Cardano" },
  XRPUSDT: { symbol: "XRP", name: "XRP" },
};

let socket = null;
let listeners = new Set();
let lastSnapshot = {};
let reconnectTimer = null;
let usingFallback = false;
let connectAttempts = 0;

function handleMessage(raw) {
  try {
    const msg = JSON.parse(raw);
    const d = msg?.data;
    if (!d || !d.s) return;
    const meta = SYMBOL_MAP[d.s];
    if (!meta) return;
    const update = {
      key: meta.symbol,
      symbol: meta.symbol,
      name: meta.name,
      price: parseFloat(d.c),
      change_pct_24h: parseFloat(d.P),
      updated_at: Date.now(),
    };
    lastSnapshot[meta.symbol] = update;
    listeners.forEach((fn) => {
      try { fn(update, { ...lastSnapshot }); } catch (e) { /* ignore */ }
    });
  } catch (e) { /* ignore parse errors */ }
}

function connect() {
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) return;
  const url = usingFallback ? DIRECT_URL : PROXY_URL;
  try {
    socket = new WebSocket(url);
  } catch (e) {
    scheduleReconnect();
    return;
  }
  const openedAt = Date.now();
  socket.onmessage = (evt) => handleMessage(evt.data);
  socket.onclose = () => {
    // If our proxy disconnected very quickly without any messages, try direct Binance
    if (!usingFallback && Date.now() - openedAt < 4000 && Object.keys(lastSnapshot).length === 0) {
      usingFallback = true;
    }
    scheduleReconnect();
  };
  socket.onerror = () => {
    try { socket?.close(); } catch (e) { /* ignore */ }
  };
  connectAttempts += 1;
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, Math.min(4000 + connectAttempts * 1500, 20000));
}

export function subscribeCryptoTicker(fn) {
  listeners.add(fn);
  Object.values(lastSnapshot).forEach((u) => {
    try { fn(u, { ...lastSnapshot }); } catch (e) { /* ignore */ }
  });
  connect();
  return () => {
    listeners.delete(fn);
    if (listeners.size === 0 && socket) {
      try { socket.close(); } catch (e) { /* ignore */ }
      socket = null;
    }
  };
}

export function getCryptoSnapshot() { return { ...lastSnapshot }; }
