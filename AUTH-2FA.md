# Authentication & Mandatory 2FA

This project uses **Supabase Auth** (email + password) with **mandatory TOTP
two-factor authentication** using Supabase's native MFA (no custom crypto, no
secrets stored by us).

## Screens (frontend)

The SPA gates itself into four stages, resolved in `frontend/src/App.jsx`
from the session + `supabase.auth.mfa.getAuthenticatorAssuranceLevel()`:

| Stage       | When                                                        | Component                          |
| ----------- | ----------------------------------------------------------- | ---------------------------------- |
| `signedOut` | no session                                                  | `components/AuthPage.jsx`          |
| `setup2fa`  | signed in, **no verified** authenticator factor (`aal1→aal1`) | `components/Setup2FA.jsx`        |
| `verify2fa` | signed in, has a verified factor, session still `aal1` (`aal1→aal2`) | `components/Verify2FA.jsx` |
| `ready`     | session is `aal2`                                           | the app (`PlatformApp`)            |

`App` re-resolves the stage on every `onAuthStateChange` event, so enrolling or
verifying instantly moves the user forward.

## Enrollment (Setup2FA)

1. `mfa.enroll({ factorType: 'totp' })` → returns a QR code (SVG) + secret.
2. User scans it in Google Authenticator / 1Password / Authy.
3. `mfa.challenge({ factorId })` + `mfa.verify({ factorId, challengeId, code })`.
4. On success the **current session is promoted to `aal2`** and the app opens.

Stale unverified factors are cleaned up on mount so re-entry stays tidy.

## Login challenge (Verify2FA)

Returning users (already enrolled) log in with email+password → session starts
at `aal1` → they enter a 6-digit code → `challenge` + `verify` → `aal2`.

## Backend enforcement (defense in depth)

`backend/src/authMiddleware.js` (`requireAuth`) decodes the access-token JWT and
**rejects any request whose `aal` claim is not `aal2`** with
`401 { code: "mfa_required" }`. So even a valid first-factor token cannot reach
`/api/clients`, `/api/tasks`, or `/api/prompts/*` until 2FA is completed.

> After pulling this change, **restart the backend** so the new middleware loads.

## Optional hardening (not applied)

For DB-layer enforcement you can add `auth.jwt()->>'aal' = 'aal2'` to the RLS
policies on `clients`, `tasks`, and `prompt_jobs`. The backend already forwards
the user's JWT, so RLS would see the `aal` claim.

## UI / UX

All four screens share `components/AuthShell.jsx` — a two-panel console with an
animated **voice waveform** signature (left rail) and the active form (right).
Type: Space Grotesk (display) + Space Mono (data/labels/OTP) + Inter (body).

- **Single-scan setup:** the stage router (`App.jsx`) decides setup-vs-verify by
  whether a *verified* factor exists (`listFactors`), not by `nextLevel`. An
  unverified mid-enrollment factor flips `nextLevel` to `aal2`; relying on it
  used to bounce the user from setup to verify and invalidate the scanned
  secret, forcing repeated re-scans. Enrollment now runs once and the QR is
  stable until the code is confirmed.
- **Auto-submit:** `components/OtpInput.jsx` is a 6-cell segmented field that
  auto-advances, supports paste, and submits the moment the 6th digit lands — no
  button press. Wrong codes clear the cells for an immediate retry.

## Invite-only access (mirrors WSC)

There is **no public signup**. New operators arrive through an invitation, the
same model WSC uses.

**Flow**
1. An **admin** opens the **Team** tab (visible only to admins) and invites an
   email → `POST /api/invite`. The backend stores a one-time token in the
   `invitations` table (7-day expiry), **emails the invite via Resend**, and
   returns the accept URL `/?invite=<token>`. If Resend isn't configured (or
   sending fails), the invite still succeeds and the admin shares the link
   manually — the Team UI shows the link either way.
2. The invitee opens the link → `AcceptInvite` screen → sets name + password →
   `POST /api/invite/accept`. The backend validates the token and creates the
   user with the **admin API** (`auth.admin.createUser`, email auto-confirmed),
   then marks the invite accepted.
3. The client signs in and is routed into **mandatory 2FA setup** (above).

**Who is an admin?** `resolveIsAdmin()` in `authMiddleware.js`:
`ADMIN_EMAILS` (bootstrap allowlist) **or** `user_metadata.role === 'admin'`
(invited admins). `/api/me` returns `isAdmin`; the Profile screen shows the
invite/Team panels only to admins.

### Managing admins

There are three ways an account becomes admin, in order of preference:

1. **Invite as Administrator (preferred, no server access).** In Profile →
   Invite team member, set **Role = Administrator**. When they accept, their
   account is created with `user_metadata.role = 'admin'` and they're an admin
   immediately — this is how you "send a link to add a new admin."
1b. **Change an existing member's role in the UI.** Profile → **Team members**
   (admin only) → switch anyone between **Member** and **Administrator**. Backed
   by `GET /api/team/members` and `PATCH /api/team/members/:id`. You can't change
   your own role (prevents lock-out). This is the easiest way to promote an
   account that already exists (e.g. one created before invites were enabled).
2. **Promote an existing account (durable).** Run from `backend/`:
   ```
   node scripts/set-admin.mjs someone@example.com          # promote
   node scripts/set-admin.mjs someone@example.com --demote # demote
   ```
   Stamps `role: admin` on the user record. They refresh the app to pick it up.
3. **`ADMIN_EMAILS` allowlist (bootstrap only).** Good for the very first admin,
   but it's read **only at backend startup** — editing it requires a restart,
   and it doesn't survive as a property of the account. Prefer #1/#2.

> Note: `ADMIN_EMAILS` matches by the **exact logged-in email**. If you're signed
> in with a different account it won't apply. Check the **Role** field in Profile.

**Required setup**
- Run `supabase/invitations.sql` in the Supabase SQL editor (creates the
  `invitations` table, RLS-locked to the service role).
- Add to `backend/.env`:
  - `SUPABASE_SECRET_KEY=sb_secret_…` (service-role key — server-side only)
  - `ADMIN_EMAILS=you@yourcompany.com` (first admin who can invite)
  - `RESEND_API_KEY=re_…` and `EMAIL_FROM="Voice Agent OS <you@yourdomain>"`
    (optional — for automatic invite emails; `onboarding@resend.dev` works for testing)
- Restart the backend so the new routes + env load.

**Email (Resend):** `backend/src/email.js` posts to Resend's REST API (no extra
dependency). `GET /api/health` reports `emailReady`.

> **Important — `onboarding@resend.dev` is test-mode only.** With that `from`
> address Resend will *only* deliver to the Resend account owner's email; sending
> to anyone else fails with "You can only send testing emails to your own
> address." To email real recipients you must **verify a domain** at
> resend.com/domains and set `EMAIL_FROM` to an address on that domain, e.g.
> `EMAIL_FROM="Voice Agent OS <invites@inspra.ai>"`. Then restart the backend.
> If sending fails, the invite still succeeds and the admin shares the link; the
> exact Resend error is now shown in the Team UI.

**Endpoints**
- `POST /api/invite` — admin only — create invite, returns `{ invitation, inviteUrl }`
- `GET  /api/invite` — admin only — list invitations
- `POST /api/invite/accept` — public — `{ token, fullName, password }` → creates the account

## Notes

- TOTP MFA is enabled by default on all Supabase projects — no dashboard change
  needed. The "mandatory" behavior is enforced by this app (frontend gate +
  backend `aal2` check).
- Issuer/friendly name shown in the authenticator app: **Inspra AI**.
