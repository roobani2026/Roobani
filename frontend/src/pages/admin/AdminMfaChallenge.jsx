import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { z } from "zod";
import { api } from "../../lib/api";
import { useAdminAuth } from "../../lib/adminAuth";
import { toast } from "sonner";

/**
 * Admin MFA challenge screen. Renders one of two flows based on `challenge`:
 *
 *  - SETUP: server returned `mfa_setup_required` on the prior login call. The
 *    challenge already carries the otpauth URI + a pre-rendered QR SVG data
 *    URI + the plaintext secret (so the user can type it in if camera-less).
 *    After the user enters their first 6-digit code, we receive 8 recovery
 *    codes that must be shown once.
 *
 *  - VERIFY: server returned `mfa_required` on the prior login call. The
 *    user enters a TOTP code OR a recovery code (XXXX-XXXX-XXXX). We never
 *    see the secret on this path.
 *
 * Props:
 *   challenge: { mode: "setup" | "verify", token, qr_svg_data_uri?, otpauth_uri?, secret? }
 *   onCancel:  () => void
 */
const codeSchema = z
  .string()
  .trim()
  .min(6, "Enter your 6-digit code or a recovery code")
  .max(20, "Code is too long");

export default function AdminMfaChallenge({ challenge, onCancel }) {
  const navigate = useNavigate();
  const { refresh } = useAdminAuth();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState(null);

  if (!challenge?.token) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#FAFAF8" }}>
        <div className="font-mono text-xs tracking-[0.2em] uppercase text-[#6B6B6B]">No active MFA challenge.</div>
      </div>
    );
  }

  const isSetup = challenge.mode === "setup";

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    const parsed = codeSchema.safeParse(code);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message || "Invalid code");
      return;
    }
    setLoading(true);
    try {
      const endpoint = isSetup ? "/admin/auth/mfa/setup" : "/admin/auth/mfa/verify";
      const r = await api.post(endpoint, {
        challenge_token: challenge.token,
        code: parsed.data,
      });
      if (isSetup && r.data?.recovery_codes) {
        // Stage 1 of setup complete: show recovery codes before navigating.
        setRecoveryCodes(r.data.recovery_codes);
        toast.success("Two-factor enabled. Save your recovery codes.");
        return;
      }
      await refresh();
      if (r.data?.via === "recovery") {
        toast.message(`Signed in via recovery code. ${r.data.remaining_recovery_codes} remaining.`);
      } else {
        toast.success("Welcome back, admin.");
      }
      navigate("/admin");
    } catch (err) {
      const msg = err?.response?.data?.detail || "Verification failed";
      setError(typeof msg === "string" ? msg : "Verification failed");
    } finally {
      setLoading(false);
    }
  };

  const proceedAfterRecovery = async () => {
    await refresh();
    navigate("/admin");
  };

  // ----- Recovery code reveal (one-time) -----
  if (recoveryCodes) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6" style={{ background: "#FAFAF8" }}>
        <div className="w-full max-w-xl border border-[#E0DDD5] bg-white p-10">
          <div className="text-[10px] tracking-[0.25em] uppercase font-mono text-[#C0392B] mb-3">Save these now</div>
          <h2 className="font-serif text-3xl tracking-tight text-[#1C1C1E] leading-tight">Recovery codes.</h2>
          <p className="text-sm text-[#6B6B6B] mt-3 leading-relaxed">
            Each code can be used once if you lose access to your authenticator. Store them in a password manager or print and lock them up. <strong className="text-[#1C1C1E]">They will not be shown again.</strong>
          </p>
          <div
            data-testid="recovery-codes-list"
            className="grid grid-cols-2 gap-2 mt-6 p-4 bg-[#F0EDE6] border border-[#E0DDD5] font-mono text-sm tracking-wider"
          >
            {recoveryCodes.map((c) => (
              <div key={c} className="text-[#1C1C1E]">{c}</div>
            ))}
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              data-testid="recovery-copy"
              onClick={() => { navigator.clipboard.writeText(recoveryCodes.join("\n")); toast.success("Copied to clipboard"); }}
              className="px-5 py-2.5 text-[11px] tracking-[0.2em] uppercase font-mono border border-[#1A1F3D] text-[#1A1F3D] hover:bg-[#1A1F3D] hover:text-white transition-colors"
            >
              Copy
            </button>
            <button
              type="button"
              data-testid="recovery-download"
              onClick={() => {
                const blob = new Blob([recoveryCodes.join("\n")], { type: "text/plain" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = "roobani-recovery-codes.txt";
                a.click();
                URL.revokeObjectURL(url);
              }}
              className="px-5 py-2.5 text-[11px] tracking-[0.2em] uppercase font-mono border border-[#1A1F3D] text-[#1A1F3D] hover:bg-[#1A1F3D] hover:text-white transition-colors"
            >
              Download .txt
            </button>
            <button
              type="button"
              data-testid="recovery-continue"
              onClick={proceedAfterRecovery}
              className="ml-auto px-6 py-2.5 text-[11px] tracking-[0.2em] uppercase font-mono text-white"
              style={{ background: "#1A1F3D" }}
            >
              I have saved them
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ----- Standard challenge form -----
  return (
    <div className="min-h-screen flex" style={{ background: "#FAFAF8" }}>
      <div className="hidden md:block w-1/2 relative" style={{ background: "#1A1F3D" }}>
        <div className="absolute inset-0 flex flex-col justify-between p-12 text-white">
          <div className="font-serif text-3xl tracking-tight">Roobani</div>
          <div>
            <div className="text-xs tracking-[0.2em] uppercase opacity-70 mb-3 font-mono">Two-factor authentication</div>
            <div className="font-serif text-5xl leading-tight tracking-tight">
              {isSetup ? "Enrol your authenticator." : "Confirm it's you."}
            </div>
            <div className="mt-6 text-sm opacity-80 max-w-md leading-relaxed">
              {isSetup
                ? "Use Google Authenticator, 1Password, Authy, or any RFC-6238 compatible app. Scan the code, then enter the six digits it shows."
                : "Open your authenticator app and enter the current six-digit code, or use one of your single-use recovery codes."}
            </div>
          </div>
          <div className="text-[11px] tracking-[0.2em] uppercase opacity-50 font-mono">Restricted</div>
        </div>
      </div>
      <main className="flex-1 flex items-center justify-center p-8">
        <form onSubmit={submit} className="w-full max-w-md" data-testid="admin-mfa-form" noValidate>
          <header className="mb-8">
            <div className="text-xs tracking-[0.2em] uppercase font-mono text-[#6B6B6B] mb-3">
              {isSetup ? "Step 2 of 2" : "Verification required"}
            </div>
            <h1 className="font-serif text-4xl tracking-tight text-[#1C1C1E]">
              {isSetup ? "Scan, then verify." : "Enter your code."}
            </h1>
          </header>

          {isSetup && (
            <div className="mb-6">
              <div className="border border-[#E0DDD5] p-4 bg-white flex items-start gap-4">
                <img
                  src={challenge.qr_svg_data_uri}
                  alt="Authenticator QR code"
                  className="w-40 h-40 flex-shrink-0"
                  data-testid="mfa-qr-code"
                />
                <div className="flex-1 min-w-0">
                  <div className="text-[10px] tracking-[0.2em] uppercase font-mono text-[#6B6B6B] mb-1">Cannot scan?</div>
                  <div className="text-xs text-[#1C1C1E] leading-relaxed">Type this secret manually:</div>
                  <code
                    data-testid="mfa-secret"
                    className="mt-2 inline-block px-2 py-1 bg-[#F0EDE6] border border-[#E0DDD5] font-mono text-xs tracking-wider break-all"
                  >{challenge.secret}</code>
                </div>
              </div>
            </div>
          )}

          <label htmlFor="mfa-code" className="block text-[11px] tracking-[0.2em] uppercase font-mono text-[#6B6B6B] mb-2">
            {isSetup ? "Verification code" : "Authenticator or recovery code"}
          </label>
          <input
            id="mfa-code"
            data-testid="admin-mfa-code-input"
            type="text"
            inputMode="text"
            autoComplete="one-time-code"
            required
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder={isSetup ? "123456" : "123456 or XXXX-XXXX-XXXX"}
            className="w-full px-4 py-3 mb-2 bg-transparent border border-[#E0DDD5] focus:border-[#1A1F3D] outline-none text-[#1C1C1E] font-mono tracking-widest text-lg"
            aria-invalid={!!error}
            aria-describedby={error ? "mfa-error" : undefined}
          />
          {error && (
            <div id="mfa-error" role="alert" data-testid="admin-mfa-error" className="text-xs text-[#C0392B] mb-2">
              {error}
            </div>
          )}

          <div className="flex items-center gap-3 mt-6">
            <button
              type="button"
              data-testid="admin-mfa-cancel"
              onClick={onCancel}
              className="px-5 py-3 text-[11px] tracking-[0.2em] uppercase font-mono text-[#6B6B6B] hover:text-[#1A1F3D] transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              data-testid="admin-mfa-submit"
              disabled={loading || !code.trim()}
              aria-busy={loading}
              className="flex-1 py-3 text-white text-xs tracking-[0.2em] uppercase font-mono disabled:opacity-60 transition-colors"
              style={{ background: "#1A1F3D" }}
            >
              {loading ? (isSetup ? "Enrolling..." : "Verifying...") : (isSetup ? "Enable two-factor" : "Verify")}
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}
