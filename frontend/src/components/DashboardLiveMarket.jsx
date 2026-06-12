import React, { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { subscribeCryptoTicker } from "../lib/cryptoStream";
import { ArrowUpRight, ArrowDownRight } from "lucide-react";

function fmtPrice(num) {
  if (num == null || isNaN(num)) return "-";
  const abs = Math.abs(num);
  if (abs >= 1000) return num.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (abs >= 10) return num.toLocaleString("en-US", { maximumFractionDigits: 2 });
  return num.toLocaleString("en-US", { maximumFractionDigits: 4 });
}

function Sparkline({ points, up }) {
  if (!points || points.length < 2) return <div className="h-[26px]" />;
  const w = 110, h = 26;
  const min = Math.min(...points), max = Math.max(...points);
  const range = max - min || 1;
  const d = points
    .map((p, i) => {
      const x = (i / (points.length - 1)) * w;
      const y = h - ((p - min) / range) * h;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const stroke = up == null ? "#6B6B6B" : up ? "#3A7D5C" : "#C0392B";
  return (
    <svg width={w} height={h} className="opacity-90" preserveAspectRatio="none">
      <path d={d} fill="none" stroke={stroke} strokeWidth="1.3" />
    </svg>
  );
}

function Tile({ tile }) {
  const pct = tile.change_pct_24h;
  const up = pct == null ? null : pct >= 0;
  return (
    <div
      className="flex-1 min-w-[180px] bg-white border border-rb-border p-5 flex flex-col gap-2"
      data-testid={`dash-market-tile-${tile.key}`}
    >
      <div className="flex items-center justify-between">
        <div>
          <div className="rb-mono uppercase text-[10px] tracking-[0.22em] text-rb-text2 flex items-center gap-2">
            {tile.symbol}
            {tile.live && (
              <span className="rb-mono text-[8px] uppercase tracking-[0.2em] text-rb-gold">live</span>
            )}
          </div>
          <div className="text-sm text-rb-navy mt-0.5">{tile.name}</div>
        </div>
        <Sparkline points={tile.sparkline} up={up} />
      </div>
      <div className="flex items-baseline justify-between mt-1">
        <div className="rb-mono text-2xl text-rb-navy">{fmtPrice(tile.price)}</div>
        <div
          className={`rb-mono text-xs inline-flex items-center gap-1 ${
            up == null ? "text-rb-text2" : up ? "text-rb-success" : "text-rb-alert"
          }`}
        >
          {up != null && (up ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />)}
          {pct == null ? "-" : `${up ? "+" : ""}${pct.toFixed(2)}%`}
        </div>
      </div>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="flex-1 min-w-[180px] bg-white border border-rb-border p-5 animate-pulse">
      <div className="h-3 w-12 bg-rb-border" />
      <div className="h-3 w-20 bg-rb-border mt-2" />
      <div className="h-7 w-24 bg-rb-border mt-3" />
    </div>
  );
}

export default function DashboardLiveMarket() {
  const [stocks, setStocks] = useState({ indices: [], commodities: [] });
  const [crypto, setCrypto] = useState({});
  const [restCryptoSparks, setRestCryptoSparks] = useState({});
  const [restCryptoPrices, setRestCryptoPrices] = useState({}); // REST fallback when WS fails
  const [updated, setUpdated] = useState("");

  // Stocks / commodities polling (60s — lighter than full panel since this is a sidebar widget)
  useEffect(() => {
    let cancel = false;
    const load = async () => {
      try {
        const r = await api.get("/market/stocks");
        if (cancel) return;
        const g = r.data?.groups || {};
        setStocks({ indices: g.indices || [], commodities: g.commodities || [] });
        setUpdated(new Date().toLocaleTimeString());
      } catch (e) { /* ignore */ }
    };
    load();
    const t = setInterval(load, 60000);
    return () => { cancel = true; clearInterval(t); };
  }, []);

  // Crypto REST: seeds sparkline AND serves as price fallback if WebSocket is blocked.
  // Poll faster (30s) so BTC/ETH still feel "live" even without WS.
  useEffect(() => {
    let cancel = false;
    const load = async () => {
      try {
        const r = await api.get("/market/crypto");
        if (cancel) return;
        const sparkMap = {};
        const priceMap = {};
        (r.data?.items || []).forEach((it) => {
          const sym = (it.symbol || "").toUpperCase();
          sparkMap[sym] = it.sparkline || [];
          priceMap[sym] = { price: it.price, change_pct_24h: it.change_pct_24h, name: it.name };
        });
        setRestCryptoSparks(sparkMap);
        setRestCryptoPrices(priceMap);
      } catch (e) { /* ignore */ }
    };
    load();
    const t = setInterval(load, 30000);
    return () => { cancel = true; clearInterval(t); };
  }, []);

  // Live crypto WS (preferred when available)
  useEffect(() => subscribeCryptoTicker((_u, snapshot) => setCrypto(snapshot)), []);

  const tiles = useMemo(() => {
    // Prefer WS data when present, fall back to REST polling
    const btc = crypto.BTC || restCryptoPrices.BTC;
    const eth = crypto.ETH || restCryptoPrices.ETH;
    const sp = (stocks.indices || []).find((i) => i.symbol === "^GSPC");
    const gold = (stocks.commodities || []).find((i) => i.symbol === "GC=F");
    return [
      {
        key: "btc",
        symbol: "BTC",
        name: "Bitcoin",
        price: btc?.price,
        change_pct_24h: btc?.change_pct_24h,
        sparkline: restCryptoSparks.BTC || [],
        live: !!crypto.BTC,
      },
      {
        key: "eth",
        symbol: "ETH",
        name: "Ethereum",
        price: eth?.price,
        change_pct_24h: eth?.change_pct_24h,
        sparkline: restCryptoSparks.ETH || [],
        live: !!crypto.ETH,
      },
      {
        key: "spx",
        symbol: "S&P 500",
        name: "US Equities",
        price: sp?.price,
        change_pct_24h: sp?.change_pct_24h,
        sparkline: sp?.sparkline || [],
        live: false,
      },
      {
        key: "gold",
        symbol: "GOLD",
        name: "Spot (Oz)",
        price: gold?.price,
        change_pct_24h: gold?.change_pct_24h,
        sparkline: gold?.sparkline || [],
        live: false,
      },
    ];
  }, [crypto, stocks, restCryptoSparks, restCryptoPrices]);

  const anyLoaded = tiles.some((t) => t.price != null);

  return (
    <div data-testid="dashboard-live-market" className="mt-6">
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="rb-display text-2xl text-rb-navy">Live Markets</h2>
        <div className="rb-mono text-[10px] uppercase tracking-[0.18em] text-rb-text2">
          BTC :: ETH :: S&P 500 :: Gold {updated && `:: ${updated}`}
        </div>
      </div>
      <div className="flex flex-col md:flex-row gap-3">
        {anyLoaded
          ? tiles.map((t) => <Tile key={t.key} tile={t} />)
          : Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} />)}
      </div>
    </div>
  );
}
