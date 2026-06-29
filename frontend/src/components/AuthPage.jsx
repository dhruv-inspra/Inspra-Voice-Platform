import { useState } from "react";
import { supabase, supabaseConfigured } from "../lib/supabase";
import AuthShell from "./AuthShell.jsx";

/**
 * AuthPage handles the first authentication factor: email + password.
 * Access is invite-only (like WSC) — there is no public signup. New operators
 * arrive through an invitation link. Modes here: login | reset.
 * After login the App shell routes the user into mandatory two-factor auth.
 */
export default function AuthPage() {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function switchMode(next) {
    setMode(next);
    setNotice("");
    setError("");
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setNotice("");
    setError("");
    setLoading(true);

    try {
      if (!supabaseConfigured) {
        setError("Add your Supabase URL and publishable key to frontend/.env to continue.");
        return;
      }

      if (mode === "reset") {
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: window.location.origin
        });
        if (resetError) throw resetError;
        setNotice("If that email has an account, a reset link is on its way.");
        return;
      }

      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) throw signInError;
    } catch (err) {
      setError(formatAuthError(err));
    } finally {
      setLoading(false);
    }
  }

  const isReset = mode === "reset";

  return (
    <AuthShell
      eyebrow={isReset ? "Account recovery" : "Operator access"}
      title={isReset ? "Reset password" : "Welcome back"}
      subtitle={
        isReset
          ? "We'll email you a secure link to set a new password."
          : "Sign in to build, optimize, and ship voice agents."
      }
      footer={
        <span>
          Access is invite-only. Need an account? Ask an admin to send you an invitation.
        </span>
      }
    >
      {!supabaseConfigured && (
        <div className="field-note">
          Add your Supabase URL and publishable key to <code>frontend/.env</code> to continue.
        </div>
      )}

      <form className="auth2-form" onSubmit={handleSubmit}>
        <label className="field">
          <span>Email</span>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@studio.com"
            autoComplete="email"
            required
          />
        </label>
        {!isReset && (
          <label className="field">
            <span>Password</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              required
            />
          </label>
        )}

        {error && <div className="auth-error">{error}</div>}
        {notice && <div className="auth-info">{notice}</div>}

        <button className="btn-primary" disabled={loading}>
          {loading ? "Working…" : isReset ? "Send reset link" : "Log in"}
        </button>
      </form>

      <div className="auth2-links">
        {isReset ? (
          <button type="button" onClick={() => switchMode("login")}>
            ← Back to log in
          </button>
        ) : (
          <button type="button" onClick={() => switchMode("reset")}>
            Forgot your password?
          </button>
        )}
      </div>
    </AuthShell>
  );
}

function formatAuthError(error) {
  const message = error.message || "";
  const lower = message.toLowerCase();

  if (lower.includes("invalid login credentials")) return "Invalid email or password.";
  if (lower.includes("email not confirmed")) return "Your email isn't confirmed yet.";
  if (lower.includes("password")) return message;

  return message || "Something went wrong. Please try again.";
}
