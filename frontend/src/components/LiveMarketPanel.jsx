import React, { useEffect, useState } from "react";
import { api } from "../lib/api";
import { subscribeCryptoTicker } from "../lib/cryptoStream";
import { ArrowUpRight, ArrowDownRight } from "lucide-react";

function fmt(num, digits = 2) {
  if (num == null || isNaN(num)) return "-";
  const abs = Math.abs(num);
  if (abs >= 1000) return num.toLocaleString("en-US", { maximumFractionDigits: 0 });
  return num.toLocaleString("en-US", { maximumFractionDigits: digits });
}

function Sparkline({ points }) {
  if (!points || points.length < 2) return null;
  const w = 80, h = 22;
  const min = Math.min(...points), max = Math.max(...points);
  const range = max - min || 1;
  const d = points
    .map((p, i) => {
      const x = (i / (points.length - 1)) * w;
      const y = h - ((p - min) / range) * h;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const trend = points[points.length - 1] >= points[0];
  return (
    <svg width={w} height={h} className="opacity-90">
      <path d={d} fill="none" stroke={trend ? "#3A7D5C" : "#C0392B"} strokeWidth="1.2" />
    </svg>
  );
}

function Row({ it, live = false }) {
  const pct = it.change_pct_24h;
  const up = pct == null ? null : pct >= 0;
  return (
    <div className="grid grid-cols-[1.2fr_1fr_1fr_90px] items-center gap-3 py-4 border-t border-rb-border" data-testid={`market-row-${(it.symbol || it.name || "").replace(/\W/g, "")}`}>
      <div>
        <div className="rb-mono uppercase text-xs tracking-[0.16em] text-rb-text2 flex items-center gap-2">
          {it.symbol}
          {live && <span className="rb-mono text-[9px] uppercase tracking-[0.2em] text-rb-gold">live</span>}
        </div>
        <div className="text-sm">{it.name}</div>
      </div>
      <div className="rb-mono text-rb-navy">{fmt(it.price)}</div>
      <div className={`rb-mono inline-flex items-center gap-1 ${up == null ? "" : up ? "text-rb-success" : "text-rb-alert"}`}>
        {up != null && (up ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />)}
        {pct == null ? "-" : `${up ? "+" : ""}${fmt(pct, 2)}%`}
      </div>
      <div className="justify-self-end"><Sparkline points={it.sparkline} /></div>
    </div>
  );
}

export default function LiveMarketPanel() {
  const [groups, setGroups] = useState({ indices: [], commodities: [], forex: [] });
  const [crypto, setCrypto] = useState({}); // symbol -> snapshot
  const [restCryptoSparks, setRestCryptoSparks] = useState({}); // symbol -> sparkline (from CoinGecko backend)
  const [updated, setUpdated] = useState("");

  // Stocks/forex/commodities polling (20s)
  useEffect(() => {
    let cancel = false;
    const load = async () => {
      try {
        const r = await api.get("/market/stocks");
        if (cancel) return;
        setGroups(r.data?.groups || { indices: [], commodities: [], forex: [] });
        setUpdated(new Date().toLocaleTimeString());
      } catch (e) { /* ignore */ }
    };
    load();
    const t = setInterval(load, 20000);
    return () => { cancel = true; clearInterval(t); };
  }, []);

  // Crypto sparklines from REST (initial) since WS only gives last price
  useEffect(() => {
    let cancel = false;
    const load = async () => {
      try {
        const r = await api.get("/market/crypto");
        if (cancel) return;
        const map = {};
        (r.data?.items || []).forEach((it) => { map[(it.symbol || "").toUpperCase()] = it.sparkline || []; });
        setRestCryptoSparks(map);
      } catch (e) { /* ignore */ }
    };
    load();
    const t = setInterval(load, 120000);
    return () => { cancel = true; clearInterval(t); };
  }, []);

  // Live crypto via Binance WS
  useEffect(() => {
    return subscribeCryptoTicker((u, snapshot) => setCrypto(snapshot));
  }, []);

  const cryptoItems = Object.values(crypto).map((c) => ({
    symbol: c.symbol,
    name: c.name,
    price: c.price,
    change_pct_24h: c.change_pct_24h,
    sparkline: restCryptoSparks[c.symbol] || [],
  }));

  const Section = ({ title, items, tid, live = false }) => (
    <div className="bg-white border border-rb-border p-6 md:p-8" data-testid={`market-section-${tid}`}>
      <div className="flex items-baseline justify-between mb-2">
        <h3 className="rb-display text-2xl text-rb-navy">{title}</h3>
        <div className="rb-mono text-[10px] uppercase tracking-[0.18em] text-rb-text2">{items.length} {live ? "live" : "tracked"}</div>
      </div>
      <div>
        {items.length === 0 && <div className="text-sm text-rb-text2 py-6">Data temporarily unavailable.</div>}
        {items.map((it, i) => <Row key={(it.symbol || it.name) + i} it={it} live={live} />)}
      </div>
    </div>
  );

  return (
    <div data-testid="live-market-panel">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Section title="Indices" items={groups.indices || []} tid="indices" />
        <Section title="Commodities" items={groups.commodities || []} tid="commodities" />
        <Section title="Forex" items={groups.forex || []} tid="forex" />
        <Section title="Digital Assets" items={cryptoItems} tid="crypto" live={true} />
      </div>
      <div className="mt-6 rb-mono text-[10px] uppercase tracking-[0.18em] text-rb-text2">
        Crypto via Binance WebSocket (live)  ::  stocks via Yahoo Finance (20s poll)  ::  last poll {updated || "..."}
      </div>
    </div>
  );
}
