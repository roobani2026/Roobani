import React, { useEffect, useState } from "react";
import { api } from "../lib/api";
import { ShieldCheck, Upload, FileText, AlertCircle, Check, Clock } from "lucide-react";

const DOC_TYPES = [
  { v: "id_front", l: "ID Card (Front)" },
  { v: "id_back", l: "ID Card (Back)" },
  { v: "passport", l: "Passport" },
  { v: "address_proof", l: "Proof of Address" },
  { v: "selfie", l: "Selfie with ID" },
];

function StatusBadge({ status }) {
  const map = {
    verified: { bg: "bg-rb-success/10", text: "text-rb-success", Icon: Check, label: "Verified" },
    submitted: { bg: "bg-rb-gold/10", text: "text-rb-navy", Icon: Clock, label: "Under Review" },
    pending: { bg: "bg-rb-bg2", text: "text-rb-text2", Icon: AlertCircle, label: "Pending Submission" },
    rejected: { bg: "bg-rb-alert/10", text: "text-rb-alert", Icon: AlertCircle, label: "Rejected" },
  };
  const m = map[status] || map.pending;
  const Icon = m.Icon;
  return (
    <div className={`inline-flex items-center gap-2 px-3 py-1.5 ${m.bg} ${m.text} rb-mono text-[11px] uppercase tracking-[0.18em]`} data-testid="kyc-status-badge">
      <Icon size={14} />
      <span>{m.label}</span>
    </div>
  );
}

export default function Kyc() {
  const [data, setData] = useState({ kyc_status: "pending", documents: [] });
  const [loading, setLoading] = useState(true);
  const [docType, setDocType] = useState("id_front");
  const [file, setFile] = useState(null);
  const [state, setState] = useState({ loading: false, error: "", success: "" });

  const refresh = async () => {
    setLoading(true);
    try {
      const r = await api.get("/kyc/status");
      setData(r.data || { kyc_status: "pending", documents: [] });
    } catch { /* silent */ }
    finally { setLoading(false); }
  };

  useEffect(() => { refresh(); }, []);

  const submit = async (e) => {
    e.preventDefault();
    if (!file) {
      setState({ loading: false, error: "Please choose a file to upload.", success: "" });
      return;
    }
    setState({ loading: true, error: "", success: "" });
    const fd = new FormData();
    fd.append("document_type", docType);
    fd.append("file", file);
    try {
      await api.post("/kyc/upload", fd, { headers: { "Content-Type": "multipart/form-data" } });
      setState({ loading: false, error: "", success: "Document uploaded. Awaiting review." });
      setFile(null);
      // Reset input
      const input = document.getElementById("kyc-file-input");
      if (input) input.value = "";
      window.dispatchEvent(new Event("notif:refresh"));
      refresh();
    } catch (err) {
      setState({ loading: false, error: err.response?.data?.detail || "Upload failed.", success: "" });
    }
  };

  return (
    <div className="max-w-[1400px] mx-auto px-6 md:px-12 py-10" data-testid="page-kyc">
      <div className="flex items-end justify-between mb-6">
        <div>
          <div className="rb-mono text-[11px] uppercase tracking-[0.22em] text-rb-text2">Compliance</div>
          <h1 className="rb-display text-4xl md:text-5xl text-rb-navy mt-2">Identity Verification</h1>
          <p className="text-rb-text2 mt-3 max-w-xl text-sm">KYC is required for withdrawals above $1,000. Upload clear, full-page photos or PDFs (max 8MB each).</p>
        </div>
        {!loading && <StatusBadge status={(data.kyc_status || "pending").toLowerCase()} />}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
        <form onSubmit={submit} className="lg:col-span-3 bg-white border border-rb-border p-8 space-y-6" data-testid="kyc-form">
          <div className="flex items-center gap-3">
            <ShieldCheck size={20} className="text-rb-gold" />
            <h2 className="rb-display text-2xl text-rb-navy">Upload a Document</h2>
          </div>

          <div>
            <label className="rb-label">Document Type</label>
            <select className="rb-input rb-mono" value={docType} onChange={(e) => setDocType(e.target.value)} data-testid="kyc-doctype">
              {DOC_TYPES.map(({ v, l }) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>

          <div>
            <label className="rb-label">File</label>
            <label
              htmlFor="kyc-file-input"
              className="block border border-dashed border-rb-border bg-rb-bg2 p-8 text-center cursor-pointer hover:border-rb-navy transition-colors"
              data-testid="kyc-dropzone"
            >
              <Upload size={24} className="text-rb-text2 mx-auto mb-2" />
              <div className="rb-mono text-[11px] uppercase tracking-[0.18em] text-rb-navy">
                {file ? file.name : "Click to choose a file"}
              </div>
              <div className="rb-mono text-[10px] uppercase tracking-[0.18em] text-rb-text2 mt-2">
                JPG, PNG, WebP, HEIC or PDF :: Max 8MB
              </div>
            </label>
            <input id="kyc-file-input" type="file" accept="image/jpeg,image/png,image/webp,image/heic,application/pdf"
              className="hidden" onChange={(e) => setFile(e.target.files?.[0] || null)} data-testid="kyc-file-input" />
          </div>

          {state.error && (
            <div className="border border-rb-alert bg-rb-alert/5 p-4 flex items-start gap-2 text-rb-alert text-sm" data-testid="kyc-error">
              <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
              <span>{state.error}</span>
            </div>
          )}
          {state.success && (
            <div className="border border-rb-success bg-rb-success/10 p-4 flex items-start gap-2 text-rb-success text-sm" data-testid="kyc-success">
              <Check size={16} className="mt-0.5 flex-shrink-0" />
              <span>{state.success}</span>
            </div>
          )}

          <button type="submit" disabled={state.loading || !file} className="rb-btn rb-btn-primary" data-testid="kyc-submit">
            <span>{state.loading ? "Uploading ..." : "Upload Document"}</span>
            <Upload size={16} />
          </button>
        </form>

        <div className="lg:col-span-2">
          <div className="bg-rb-bg2 border border-rb-border p-6" data-testid="kyc-history">
            <div className="rb-label">Uploaded Documents</div>
            {loading ? (
              <div className="rb-mono text-[11px] text-rb-text2 mt-4">Loading ...</div>
            ) : data.documents.length === 0 ? (
              <div className="rb-mono text-xs text-rb-text2 mt-4">No documents uploaded yet.</div>
            ) : (
              <ul className="mt-4 space-y-3">
                {data.documents.map((d) => (
                  <li key={d.kyc_doc_id} className="bg-white border border-rb-border p-3" data-testid={`kyc-doc-${d.kyc_doc_id}`}>
                    <div className="flex items-start gap-3">
                      <FileText size={16} className="text-rb-text2 mt-0.5 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="rb-mono text-[11px] uppercase tracking-[0.18em] text-rb-navy">{(d.document_type || "").replace(/_/g, " ")}</div>
                        <div className="rb-mono text-[10px] text-rb-text2 truncate mt-1">{d.file_name}</div>
                        <div className="rb-mono text-[10px] text-rb-text2 mt-1">{(d.uploaded_at || "").slice(0, 10)} :: {(d.size_bytes / 1024).toFixed(1)} KB</div>
                      </div>
                      <div className={`rb-mono text-[10px] uppercase ${d.status === "verified" ? "text-rb-success" : d.status === "rejected" ? "text-rb-alert" : "text-rb-gold"}`}>{d.status}</div>
                    </div>
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
