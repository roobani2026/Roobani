import React, { useEffect, useState } from "react";
import { api } from "../lib/api";
import { Bell, Check, CheckCheck, AlertCircle, ArrowDownRight, ShieldCheck } from "lucide-react";

const ICON_MAP = {
  deposit: ArrowDownRight,
  withdrawal: Bell,
  kyc: ShieldCheck,
  alert: AlertCircle,
};

export default function Notifications() {
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    setLoading(true);
    try {
      const r = await api.get("/notifications");
      setItems(r.data?.items || []);
      setUnread(Number(r.data?.unread_count || 0));
    } catch { /* silent */ }
    finally { setLoading(false); }
  };

  useEffect(() => { refresh(); }, []);

  const markOne = async (id) => {
    try { await api.post(`/notifications/${id}/read`); refresh(); window.dispatchEvent(new Event("notif:refresh")); } catch { /* silent */ }
  };
  const markAll = async () => {
    try { await api.post(`/notifications/read_all`); refresh(); window.dispatchEvent(new Event("notif:refresh")); } catch { /* silent */ }
  };

  return (
    <div className="max-w-[1100px] mx-auto px-6 md:px-12 py-10" data-testid="page-notifications">
      <div className="flex items-end justify-between mb-6">
        <div>
          <div className="rb-mono text-[11px] uppercase tracking-[0.22em] text-rb-text2">Alerts</div>
          <h1 className="rb-display text-4xl md:text-5xl text-rb-navy mt-2">Notifications</h1>
          <p className="text-rb-text2 mt-3 text-sm">{unread} unread :: {items.length} total</p>
        </div>
        {unread > 0 && (
          <button onClick={markAll} className="rb-btn rb-btn-secondary" data-testid="notif-mark-all">
            <CheckCheck size={14} />
            <span>Mark all read</span>
          </button>
        )}
      </div>

      <div className="bg-white border border-rb-border">
        {loading ? (
          <div className="p-8 text-center rb-mono text-[11px] text-rb-text2" data-testid="notif-loading">Loading ...</div>
        ) : items.length === 0 ? (
          <div className="p-12 text-center" data-testid="notif-empty">
            <Bell size={28} className="text-rb-text2 mx-auto mb-3" />
            <div className="rb-display text-2xl text-rb-navy">No notifications yet.</div>
            <p className="text-rb-text2 mt-2 text-sm">You will see deposit confirmations, withdrawal updates and KYC review status here.</p>
          </div>
        ) : (
          <ul>
            {items.map((n) => {
              const Icon = ICON_MAP[n.kind] || Bell;
              return (
                <li key={n.notification_id}
                  className={`p-5 border-b border-rb-border last:border-b-0 flex items-start gap-4 ${n.read ? "bg-white" : "bg-rb-bg2"}`}
                  data-testid={`notif-${n.notification_id}`}>
                  <div className={`mt-1 w-10 h-10 flex items-center justify-center ${n.read ? "bg-rb-bg2 text-rb-text2" : "bg-rb-gold/20 text-rb-navy"}`}>
                    <Icon size={18} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between gap-3">
                      <div className="rb-display text-lg text-rb-navy">{n.title}</div>
                      <div className="rb-mono text-[10px] uppercase tracking-[0.18em] text-rb-text2 whitespace-nowrap">{(n.created_at || "").slice(0, 16).replace("T", " ")}</div>
                    </div>
                    <div className="text-sm text-rb-text2 mt-1">{n.body}</div>
                  </div>
                  {!n.read && (
                    <button onClick={() => markOne(n.notification_id)} className="rb-btn rb-btn-ghost" data-testid={`notif-read-${n.notification_id}`}>
                      <Check size={14} />
                      <span>Mark read</span>
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
