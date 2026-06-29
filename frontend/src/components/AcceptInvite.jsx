import { useState } from "react";
import { supabase, supabaseConfigured } from "../lib/supabase";
import { apiPublic } from "../lib/api";
import AuthShell from "./AuthShell.jsx";

/**
 * AcceptInvite — an invited operator sets their name + password. The account is
 * created server-side (admin API) against the invitation token, then we sign in
 * and hand off to mandatory two-factor setup.
 */
export default function AcceptInvite({ token, onDone }) {
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");

    if (!name.trim()) {
      setError("Enter your name.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    if (!supabaseConfigured) {
      setError("Supabase isn't configured in this app yet.");
      return;
    }

    setLoading(true);
    try {
      const { email } = await apiPublic("/api/invite/accept", {
        token,
        fullName: name.trim(),
        password
      });

      // Account created — sign in so the App shell can move to 2FA setup.
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) throw signInError;

      onDone?.();
    } catch (err) {
      setError(err.message || "Could not complete your invitation.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      eyebrow="Invitation"
      title="Set up your account"
      subtitle="Choose a name and password to join the Voice Agent OS workspace."
      footer={<span>Next, you'll secure the account with two-factor authentication.</span>}
    >
      <form className="auth2-form" onSubmit={handleSubmit}>
        <label className="field">
          <span>Name</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Your name"
            autoComplete="name"
            required
          />
        </label>
        <label className="field">
          <span>Password</span>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="At least 8 characters"
            autoComplete="new-password"
            minLength={8}
            required
          />
        </label>
        <label className="field">
          <span>Confirm password</span>
          <input
            type="password"
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
            placeholder="Re-enter password"
            autoComplete="new-password"
            minLength={8}
            required
          />
        </label>

        {error && <div className="auth-error">{error}</div>}

        <button className="btn-primary" disabled={loading}>
          {loading ? "Creating your account…" : "Create account"}
        </button>
      </form>

      <div className="auth2-links">
        <button type="button" onClick={() => (window.location.href = window.location.origin)}>
          Already have an account? Log in
        </button>
      </div>
    </AuthShell>
  );
}
