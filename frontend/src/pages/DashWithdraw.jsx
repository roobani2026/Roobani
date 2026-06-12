import React, { useEffect, useState } from "react";
import { api } from "../lib/api";
import { Link } from "react-router-dom";
import { ArrowRight, Landmark, Bitcoin, AlertCircle, Check } from "lucide-react";

const CURRENCIES = ["USD", "EUR", "GBP", "KES", "NGN", "ZAR", "INR", "AED"];
const CRYPTO_ASSETS = ["USDC", "USDT", "BTC", "ETH"];
const NETWORKS = {
  USDC: ["ERC20", "TRC20", "POLYGON", "SOLANA"],
  USDT: ["ERC20", "TRC20", "BSC"],
  BTC: ["BTC"],
  ETH: ["ERC20"],
};

export default function Withdraw() {
  const [summary, setSummary] = useState({ holdings_count: 0, total_usd_equivalent: 0, pending_withdrawals: 0 });
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [destType, setDestType] = useState("bank");
  const [form, setForm] = useState({
    amount: 100,
    currency: "USD",
    bank_account_name: "",
    bank_name: "",
    bank_account_number: "",
    bank_swift_iban: "",
    bank_country: "",
    crypto_asset: "USDC",
    crypto_network: "ERC20",
    crypto_wallet_address: "",
    note: "",
  });
  const [state, setState] = useState({ loading: false, error: "", success: "" });

  const refresh = async () => {
    setLoading(true);
    try {
      const [s, w] = await Promise.all([api.get("/portfolio/summary"), api.get("/withdrawals")]);
      setSummary(s.data || {});
      setHistory(w.data?.items || []);
    } catch { /* silent */ }
    finally { setLoading(false); }
  };

  useEffect(() => { refresh(); }, []);

  const submit = async (e) => {
    e.preventDefault();
    setState({ loading: true, error: "", success: "" });
    const payload = {
      amount: Number(form.amount),
      currency: form.currency.toLowerCase(),
      destination_type: destType,
      note: form.note || undefined,
    };
    if (destType === "bank") {
      Object.assign(payload, {
        bank_account_name: form.bank_account_name,
        bank_name: form.bank_name,
        bank_account_number: form.bank_account_number,
        bank_swift_iban: form.bank_swift_iban || undefined,
        bank_country: form.bank_country || undefined,
      });
    } else {
      Object.assign(payload, {
        crypto_asset: form.crypto_asset,
        crypto_network: form.crypto_network,
        crypto_wallet_address: form.crypto_wallet_address,
      });
    }
    try {
      const r = await api.post("/withdrawals", payload);
      setState({ loading: false, error: "", success: `Withdrawal request submitted (#${r.data?.withdrawal_id || ""}). Awaiting admin review.` });
      setForm({ ...form, amount: 100, bank_account_number: "", crypto_wallet_address: "", note: "" });
      window.dispatchEvent(new Event("notif:refresh"));
      refresh();
    } catch (err) {
      setState({ loading: false, error: err.response?.data?.detail || "Failed to submit withdrawal request.", success: "" });
    }
  };

  return (
    <div className="max-w-[1400px] mx-auto px-6 md:px-12 py-10" data-testid="page-withdraw">
      <div className="flex items-end justify-between mb-6">
        <div>
          <div className="rb-mono text-[11px] uppercase tracking-[0.22em] text-rb-text2">Cash Out</div>
          <h1 className="rb-display text-4xl md:text-5xl text-rb-navy mt-2">Request Withdrawal</h1>
          <p className="text-rb-text2 mt-3 max-w-xl text-sm">Withdrawals are reviewed and approved by our team. Funds settle to your bank or crypto wallet within 1-3 business days post approval.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        <div className="bg-white border border-rb-border p-6" data-testid="wd-summary-invested">
          <div className="rb-label">Total Invested (USD eq.)</div>
          <div className="rb-mono text-3xl text-rb-navy mt-1">${Number(summary.total_usd_equivalent || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}</div>
          <div className="rb-mono text-xs text-rb-text2 mt-2">{summary.holdings_count} holding{summary.holdings_count === 1 ? "" : "s"}</div>
        </div>
        <div className="bg-white border border-rb-border p-6" data-testid="wd-summary-pending">
          <div className="rb-label">Pending Withdrawals</div>
          <div className="rb-mono text-3xl text-rb-navy mt-1">{summary.pending_withdrawals || 0}</div>
          <div className="rb-mono text-xs text-rb-text2 mt-2">Awaiting admin review</div>
        </div>
        <div className="bg-white border border-rb-border p-6" data-testid="wd-summary-approved">
          <div className="rb-label">Approved (Lifetime)</div>
          <div className="rb-mono text-3xl text-rb-navy mt-1">{summary.approved_withdrawals || 0}</div>
          <div className="rb-mono text-xs text-rb-text2 mt-2"><Link to="/dashboard/transactions" className="rb-underline">View history</Link></div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
        <form onSubmit={submit} className="lg:col-span-3 bg-white border border-rb-border p-8 space-y-6" data-testid="withdraw-form">
          <div>
            <div className="rb-label">Destination</div>
            <div className="grid grid-cols-2 gap-3 mt-1">
              <button type="button" onClick={() => setDestType("bank")} data-testid="wd-dest-bank"
                className={`border p-4 text-left transition-colors ${destType === "bank" ? "border-rb-navy bg-rb-bg2" : "border-rb-border hover:border-rb-navy"}`}>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="rb-mono text-[11px] uppercase tracking-[0.18em] text-rb-navy">Bank Account</div>
                    <div className="text-xs text-rb-text2 mt-1">Wire / SWIFT / IBAN</div>
                  </div>
                  <Landmark size={16} className="text-rb-gold" />
                </div>
              </button>
              <button type="button" onClick={() => setDestType("crypto")} data-testid="wd-dest-crypto"
                className={`border p-4 text-left transition-colors ${destType === "crypto" ? "border-rb-navy bg-rb-bg2" : "border-rb-border hover:border-rb-navy"}`}>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="rb-mono text-[11px] uppercase tracking-[0.18em] text-rb-navy">Crypto Wallet</div>
                    <div className="text-xs text-rb-text2 mt-1">USDC / USDT / BTC / ETH</div>
                  </div>
                  <Bitcoin size={16} className="text-rb-gold" />
                </div>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="rb-label">Amount</label>
              <input type="number" required min="1" step="0.01" className="rb-input rb-mono text-xl"
                value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })}
                data-testid="wd-amount" />
            </div>
            <div>
              <label className="rb-label">Currency</label>
              <select className="rb-input rb-mono" value={form.currency}
                onChange={(e) => setForm({ ...form, currency: e.target.value })} data-testid="wd-currency">
                {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>

          {destType === "bank" ? (
            <div className="space-y-4">
              <div>
                <label className="rb-label">Beneficiary Name</label>
                <input required className="rb-input" value={form.bank_account_name}
                  onChange={(e) => setForm({ ...form, bank_account_name: e.target.value })}
                  data-testid="wd-bank-name" placeholder="Full legal name on bank account" />
              </div>
              <div>
                <label className="rb-label">Bank Name</label>
                <input required className="rb-input" value={form.bank_name}
                  onChange={(e) => setForm({ ...form, bank_name: e.target.value })}
                  data-testid="wd-bank-bankname" placeholder="e.g. Equity Bank Kenya" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="rb-label">Account Number</label>
                  <input required className="rb-input rb-mono" value={form.bank_account_number}
                    onChange={(e) => setForm({ ...form, bank_account_number: e.target.value })}
                    data-testid="wd-bank-account" />
                </div>
                <div>
                  <label className="rb-label">SWIFT / IBAN</label>
                  <input className="rb-input rb-mono" value={form.bank_swift_iban}
                    onChange={(e) => setForm({ ...form, bank_swift_iban: e.target.value })}
                    data-testid="wd-bank-swift" placeholder="optional" />
                </div>
              </div>
              <div>
                <label className="rb-label">Bank Country</label>
                <input className="rb-input" value={form.bank_country}
                  onChange={(e) => setForm({ ...form, bank_country: e.target.value })}
                  data-testid="wd-bank-country" placeholder="Kenya" />
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="rb-label">Asset</label>
                  <select className="rb-input rb-mono" value={form.crypto_asset}
                    onChange={(e) => {
                      const a = e.target.value;
                      setForm({ ...form, crypto_asset: a, crypto_network: (NETWORKS[a] || ["NATIVE"])[0] });
                    }}
                    data-testid="wd-crypto-asset">
                    {CRYPTO_ASSETS.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="rb-label">Network</label>
                  <select className="rb-input rb-mono" value={form.crypto_network}
                    onChange={(e) => setForm({ ...form, crypto_network: e.target.value })}
                    data-testid="wd-crypto-network">
                    {(NETWORKS[form.crypto_asset] || ["NATIVE"]).map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="rb-label">Wallet Address</label>
                <input required className="rb-input rb-mono text-sm" value={form.crypto_wallet_address}
                  onChange={(e) => setForm({ ...form, crypto_wallet_address: e.target.value })}
                  data-testid="wd-crypto-address" placeholder="0x... or bc1..." />
                <div className="rb-mono text-[10px] uppercase tracking-[0.18em] text-rb-alert mt-2">
                  Double-check this address. Crypto transfers are irreversible.
                </div>
              </div>
            </div>
          )}

          <div>
            <label className="rb-label">Note (optional)</label>
            <textarea className="rb-input min-h-[80px]" value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
              data-testid="wd-note" placeholder="Reason for withdrawal, special instructions, etc." />
          </div>

          {state.error && (
            <div className="border border-rb-alert bg-rb-alert/5 p-4 flex items-start gap-2 text-rb-alert text-sm" data-testid="wd-error">
              <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
              <span>{state.error}</span>
            </div>
          )}
          {state.success && (
            <div className="border border-rb-success bg-rb-success/10 p-4 flex items-start gap-2 text-rb-success text-sm" data-testid="wd-success">
              <Check size={16} className="mt-0.5 flex-shrink-0" />
              <span>{state.success}</span>
            </div>
          )}

          <button type="submit" disabled={state.loading} className="rb-btn rb-btn-primary" data-testid="wd-submit">
            <span>{state.loading ? "Submitting ..." : "Submit Withdrawal Request"}</span>
            <ArrowRight size={16} />
          </button>
        </form>

        <div className="lg:col-span-2">
          <div className="bg-rb-bg2 border border-rb-border p-6" data-testid="wd-history">
            <div className="rb-label">Recent Requests</div>
            {loading ? (
              <div className="rb-mono text-[11px] text-rb-text2 mt-4">Loading ...</div>
            ) : history.length === 0 ? (
              <div className="rb-mono text-xs text-rb-text2 mt-4">No requests yet.</div>
            ) : (
              <ul className="mt-4 space-y-3">
                {history.slice(0, 8).map((w) => (
                  <li key={w.withdrawal_id} className="bg-white border border-rb-border p-3" data-testid={`wd-history-${w.withdrawal_id}`}>
                    <div className="flex items-baseline justify-between">
                      <div className="rb-mono text-rb-navy">{Number(w.amount || 0).toLocaleString()} {w.currency}</div>
                      <div className={`rb-mono text-[10px] uppercase tracking-[0.18em] ${w.status === "approved" ? "text-rb-success" : w.status === "rejected" ? "text-rb-alert" : "text-rb-gold"}`}>{w.status}</div>
                    </div>
                    <div className="rb-mono text-[10px] text-rb-text2 mt-1 truncate">{w.destination_summary || w.bank_beneficiary || "-"}</div>
                    <div className="rb-mono text-[10px] text-rb-text2 mt-1">{(w.created_at || "").slice(0, 10)}</div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
