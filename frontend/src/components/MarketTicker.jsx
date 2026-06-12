import React, { useEffect, useState, useRef } from "react";
import { api } from "../lib/api";
import { subscribeCryptoTicker } from "../lib/cryptoStream";

function fmt(num, digits = 2) {
  if (num == null || isNaN(num)) return "  ";
  const abs = Math.abs(num);
  if (abs >= 1000) return num.toLocaleString("en-US", { maximumFractionDigits: 0 });
  return num.toLocaleString("en-US", { maximumFractionDigits: digits });
}

export default function MarketTicker() {
  const [stocks, setStocks] = useState([]);
  const [cryptoMap, setCryptoMap] = useState({});
  const flashRef = useRef({});

  // Stocks/forex/commodities via backend (20s polling)
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const r = await api.get("/market/stocks");
        if (cancelled) return;
        const g = r.data?.groups || {};
        setStocks([...(g.indices || []), ...(g.commodities || []), ...(g.forex || [])]);
      } catch (e) { /* silent */ }
    };
    load();
    const t = setInterval(load, 20000);
    return () => { cancelled = true; clearInterval(t); };
  }, []);

  // Crypto via Binance WS (live)
  useEffect(() => {
    return subscribeCryptoTicker((update, snapshot) => {
      flashRef.current[update.symbol] = Date.now();
      setCryptoMap(snapshot);
    });
  }, []);

  const items = [...stocks.filter((i) => i && i.price != null), ...Object.values(cryptoMap)];

  if (!items.length) {
    return (
      <div className="rb-ticker py-3 overflow-hidden" data-testid="market-ticker-loading">
        <div className="rb-mono text-[12px] tracking-[0.18em] uppercase px-6 text-rb-bg">
          Loading market data ...
        </div>
      </div>
    );
  }

  const row = (
    <div className="flex items-center whitespace-nowrap rb-mono text-[12px] py-3">
      {items.map((it, i) => {
        const pct = it.change_pct_24h;
        const cls = pct == null ? "" : pct >= 0 ? "up" : "down";
        const arrow = pct == null ? "" : pct >= 0 ? "+" : "";
        const isLive = it.updated_at && Date.now() - it.updated_at < 5000;
        return (
          <span className="item" key={`${it.symbol}-${i}`}>
            <span className="sym uppercase">{it.symbol || it.name}</span>
            <span>{fmt(it.price)}</span>
            <span className={cls}>{pct == null ? "" : `${arrow}${fmt(pct, 2)}%`}</span>
            {isLive && <span className="text-rb-gold">LIVE</span>}
            <span className="text-rb-border">|</span>
          </span>
        );
      })}
    </div>
  );

  return (
    <div className="rb-ticker overflow-hidden border-y border-rb-navy" data-testid="market-ticker">
      <div className="flex rb-marquee w-max">
        {row}
        {row}
      </div>
    </div>
  );
}
