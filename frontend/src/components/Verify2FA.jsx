import { useState } from "react";
import { supabase } from "../lib/supabase";
import AuthShell from "./AuthShell.jsx";
import OtpInput from "./OtpInput.jsx";

/**
 * Verify2FA — a returning user who already has a verified TOTP factor but whose
 * current session is still aal1. They enter a code to upgrade to aal2. The code
 * auto-submits on the 6th digit; no button press needed.
 */
export default function Verify2FA({ user, onComplete }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [done, setDone] = useState(false);

  async function submitCode(value) {
    if (verifying || done) return;
    setError("");
    setVerifying(true);
    try {
      const factors = await supabase.auth.mfa.listFactors();
      if (factors.error) throw factors.error;

      const totpFactor = (factors.data.totp || []).find((f) => f.status === "verified");
      if (!totpFactor) {
        throw new Error("No authenticator app is set up for this account.");
      }

      const challenge = await supabase.auth.mfa.challenge({ factorId: totpFactor.id });
      if (challenge.error) throw challenge.error;

      const verify = await supabase.auth.mfa.verify({
        factorId: totpFactor.id,
        challengeId: challenge.data.id,
        code: value
      });
      if (verify.error) throw verify.error;

      setDone(true);
      setTimeout(() => onComplete?.(), 650);
    } catch (err) {
      setError(err.message || "That code didn't match. Try the next one from your app.");
      setCode("");
    } finally {
      setVerifying(false);
    }
  }

  return (
    <AuthShell
      eyebrow="Identity check"
      title="Enter your code"
      subtitle={`Open your authenticator app${
        user?.email ? ` for ${user.email}` : ""
      } and enter the 6-digit code.`}
      pulse={done}
      footer={<span>Codes refresh every 30 seconds — use the current one.</span>}
    >
      {error && <div className="auth-error">{error}</div>}

      <div className="otp-block">
        <OtpInput
          value={code}
          onChange={setCode}
          onComplete={submitCode}
          disabled={verifying || done}
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

      <div className="auth2-links">
        <button type="button" onClick={() => supabase.auth.signOut()}>
          Sign out
        </button>
      </div>
    </AuthShell>
  );
}
