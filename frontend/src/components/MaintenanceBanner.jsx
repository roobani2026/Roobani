import React, { useEffect, useState } from "react";
import { api } from "../lib/api";

export default function MaintenanceBanner() {
  const [m, setM] = useState({ maintenance_mode: false, maintenance_message: "" });
  useEffect(() => {
    let alive = true;
    const fetchIt = async () => {
      try { const r = await api.get("/public/settings"); if (alive) setM(r.data); } catch (e) {}
    };
    fetchIt();
    const id = setInterval(fetchIt, 30000);
    return () => { alive = false; clearInterval(id); };
  }, []);
  if (!m.maintenance_mode) return null;
  return (
    <div data-testid="maintenance-banner" className="w-full text-center py-2.5 px-4 text-xs tracking-[0.15em] uppercase font-mono" style={{ background: "#C9A84C", color: "#1C1C1E", borderBottom: "1px solid #1A1F3D" }}>
      {m.maintenance_message || "Roobani is in maintenance mode. Service may be intermittent."}
    </div>
  );
}
