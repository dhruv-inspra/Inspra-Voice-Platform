/**
 * AuthShell — shared layout for every unauthenticated screen (login, signup,
 * 2FA setup, 2FA verify). A two-panel console: a brand rail with the signature
 * voice waveform on the left, the active form card on the right.
 *
 * The waveform is the page's signature element — voice work is signal work.
 * When `pulse` is true (a code just completed) the signal locks and glows.
 */
export default function AuthShell({
  eyebrow,
  title,
  subtitle,
  children,
  footer,
  pulse = false,
  wide = false
}) {
  return (
    <main className="auth2">
      <aside className="auth2-rail" aria-hidden="true">
        <div className="auth2-railtop">
          <div className="brandmark">
            <span className="brandmark-glyph">◈</span>
            <span className="brandmark-text">
              <strong>Voice Agent OS</strong>
              <em>Inspra AI</em>
            </span>
          </div>
        </div>

        <div className={`wave ${pulse ? "wave-locked" : ""}`}>
          {Array.from({ length: 36 }).map((_, i) => (
            <span key={i} style={{ "--i": i }} />
          ))}
        </div>

        <p className="auth2-railnote">
          Design the voice. Tune the signal.
          <br />
          Ship agents that sound human.
        </p>
      </aside>

      <section className="auth2-stage">
        <div className={`auth2-card${wide ? " auth2-card--wide" : ""}`}>
          {eyebrow && <span className="eyebrow">{eyebrow}</span>}
          <h1 className="auth2-title">{title}</h1>
          {subtitle && <p className="auth2-sub">{subtitle}</p>}
          {children}
        </div>
        {footer && (
          <div className={`auth2-footer${wide ? " auth2-card--wide" : ""}`}>{footer}</div>
        )}
      </section>
    </main>
  );
}
