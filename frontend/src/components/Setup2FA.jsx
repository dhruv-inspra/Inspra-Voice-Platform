import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import AuthShell from "./AuthShell.jsx";
import OtpInput from "./OtpInput.jsx";

/**
 * Setup2FA — mandatory enrollment of a TOTP authenticator factor.
 *
 * Flow (Supabase native MFA):
 *   1. mfa.enroll({ factorType: 'totp' })  -> QR code + secret  (run once, stable)
 *   2. user scans the QR in their authenticator app
 *   3. OtpInput auto-submits on the 6th digit ->
 *      mfa.challenge() + mfa.verify() -> session promoted to aal2 -> onComplete()
 */
export default function Setup2FA({ user, onComplete }) {
  const [factorId, setFactorId] = useState("");
  const [qr, setQr] = useState("");
  const [secret, setSecret] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [enrolling, setEnrolling] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [done, setDone] = useState(false);
  const [copied, setCopied] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    // Guard against React StrictMode double-invocation creating two factors.
    if (started.current) return;
    started.current = true;

    (async () => {
      try {
        // Remove any leftover unverified TOTP factors so we enroll exactly one.
        const { data: factorData } = await supabase.auth.mfa.listFactors();
        const stale = (factorData?.totp || []).filter((f) => f.status !== "verified");
        for (const factor of stale) {
          await supabase.auth.mfa.unenroll({ factorId: factor.id });
        }

        const { data, error: enrollError } = await supabase.auth.mfa.enroll({
          factorType: "totp",
          friendlyName: `Inspra AI (${user?.email || "account"})`
        });
        if (enrollError) throw enrollError;

        setFactorId(data.id);
        setQr(data.totp.qr_code);
        setSecret(data.totp.secret);
      } catch (err) {
        setError(err.message || "Couldn't start two-factor setup. Refresh to try again.");
      } finally {
        setEnrolling(false);
      }
    })();
  }, [user]);

  async function submitCode(value) {
    if (verifying || done) return;
    setError("");
    setVerifying(true);
    try {
      const challenge = await supabase.auth.mfa.challenge({ factorId });
      if (challenge.error) throw challenge.error;

      const verify = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challenge.data.id,
        code: value
      });
      if (verify.error) throw verify.error;

      setDone(true);
      // Brief success beat before the App shell swaps in the workspace.
      setTimeout(() => onComplete?.(), 650);
    } catch (err) {
      setError(err.message || "That code didn't match. Try the next one from your app.");
      setCode(""); // clear cells so the user can retype immediately
    } finally {
      setVerifying(false);
    }
  }

  async function copySecret() {
    try {
      await navigator.clipboard.writeText(secret);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard unavailable — the key is shown for manual entry */
    }
  }

  // Show the secret in tidy 4-character groups so it never wraps into a ragged block.
  const groupedSecret = secret ? secret.replace(/(.{4})/g, "$1 ").trim() : "";

  return (
    <AuthShell
      wide
      eyebrow="Step 01 / 02 · Secure your account"
      title="Set up two-factor auth"
      subtitle="Scan the QR code with an authenticator app — Google Authenticator, 1Password, or Authy."
      pulse={done}
      footer={
        <span>
          Lost your device later? An admin can reset your authenticator from the Supabase dashboard.
        </span>
      }
    >
      {error && <div className="auth-error">{error}</div>}

      {enrolling ? (
        <div className="qr-loading">Generating your secure key…</div>
      ) : (
        <div className="setup">
          <div className="setup-top">
            <div className="qr-frame">
              {qr ? <img src={qr} alt="Two-factor QR code" /> : <span>QR unavailable</span>}
            </div>

            <ol className="steps">
              <li>
                <span className="step-n">1</span>
                <p>Open your authenticator app and scan this QR code.</p>
              </li>
              <li>
                <span className="step-n">2</span>
                <p>Enter the 6-digit code it generates, below.</p>
              </li>
            </ol>
          </div>

          {secret && (
            <div className="keyrow">
              <div className="keyrow-head">
                <span className="keyrow-label">Can&apos;t scan? Enter this key</span>
                <button type="button" className="keyrow-copy" onClick={copySecret}>
                  {copied ? "Copied ✓" : "Copy key"}
                </button>
              </div>
              <code className="key-code">{groupedSecret}</code>
            </div>
          )}
        </div>
      )}

      {!enrolling && (
        <div className="otp-block">
          <span className="eyebrow">Step 02 / 02 · Confirm the code</span>
          <OtpInput
            value={code}
            onChange={setCode}
            onComplete={submitCode}
            disabled={verifying || done || !factorId}
            autoFocus
          />
          <div className={`otp-status ${done ? "ok" : verifying ? "busy" : ""}`}>
            {done
              ? "Verified — opening your workspace…"
              : verifying
              ? "Verifying…"
              : "Enter all six digits — we'll confirm automatically."}
          </div>
        </div>
      )}

      <div className="auth2-links">
        <button type="button" onClick={() => supabase.auth.signOut()}>
          Sign out
        </button>
      </div>
    </AuthShell>
  );
}
