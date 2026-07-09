# Inspra AI Voice Platform

Internal Voice Agent OS for building, operating, optimizing, and releasing client voice-agent systems.

The platform is now designed around the blueprint in `Inspra Voice System/Inspra_VoiceAgentOS_Blueprint_20260627.pdf`: client workspaces, work-item triage, build packages, Elk prompt/function exports, release control, monitoring, and Obsidian wiki learning.

## Stack

- `frontend/` - React + Vite app
- `backend/` - Node.js + Express API
- Supabase Auth - invite-only email/password login with mandatory TOTP 2FA
- Supabase Postgres - clients, work items, prompt/build jobs, invitations
- Obsidian - planned agentic wiki/learning layer via markdown notes with YAML properties

## Supabase Project

Project URL:

```text
https://ymsooxqtwlttpqjnmumb.supabase.co
```

Dashboard:

```text
https://supabase.com/dashboard/project/ymsooxqtwlttpqjnmumb
```

## Product Areas

- **Command Center** - operating overview for active clients, open work items, approvals, safe fixes, and build package readiness.
- **Clients** - durable client workspace records with lifecycle state, industry, platform, and production status.
- **Work Items** - triage ledger for live-client signals with source, stakeholder, severity, bucket, approval flag, safe-fix flag, evidence, proposed fix, verification, and rollback.
- **Build Studio** - new-client package generation from discovery material.
- **Elk Builder** - revision package generation for prompt/function production.
- **Releases** - approval and production readiness checks.
- **Monitoring** - monitor plug-in interface for platform, workflow, CRM, calendar, and post-call signals.
- **Wiki Brain** - Obsidian-ready learning notes for reusable agentic knowledge.
- **Team/Profile** - account security, password changes, invites, and admin/member management.

## Required Build Outputs

Every completed build should produce the five required artifacts from the blueprint:

- Blueprint
- Sales script
- Call flow chart
- Agent prompt
- Integration flowchart

The Elk layer also produces copy-paste-ready function package files:

- `description.txt`
- `openai-schema.json`
- `post-body.json`
- `function-config.md`

## Setup

### 1. Install Dependencies

Run once per machine or after pulling dependency changes:

```bash
cd backend
npm install

cd ../frontend
npm install
```

### 2. Configure Supabase

In the Supabase dashboard:

1. Open `SQL Editor`.
2. Run `supabase/schema.sql`.
3. Run `supabase/invitations.sql`.
4. Open `Authentication > Sign In / Providers > Email`.
5. Keep the app invite-only. New users should be created through invitations, not public signup.
6. Copy the project publishable key and service-role/secret key from Supabase.

`supabase/schema.sql` is additive for the newer Voice Agent OS fields, so it can be rerun to add missing columns.

### 3. Frontend Environment

Create `frontend/.env`:

```env
VITE_API_URL=http://localhost:5000
VITE_SUPABASE_URL=https://ymsooxqtwlttpqjnmumb.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_your_key_here
```

### 4. Backend Environment

Create `backend/.env`:

```env
PORT=5000
CLIENT_URL=http://localhost:5173
PUBLIC_APP_URL=http://localhost:5173
SUPABASE_URL=https://ymsooxqtwlttpqjnmumb.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_your_key_here
SUPABASE_SECRET_KEY=sb_secret_your_key_here
ADMIN_EMAILS=you@yourcompany.com

# Optional email sending for invites.
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=you@gmail.com
SMTP_PASS=your_app_password
RESEND_API_KEY=re_your_key_here
EMAIL_FROM=Voice Agent OS <you@gmail.com>
```

Never put the Supabase secret/service-role key in `frontend/.env`.

## Run Locally

Start the backend:

```bash
cd backend
npm run dev
```

Start the frontend:

```bash
cd frontend
npm run dev -- --host 127.0.0.1 --port 5173
```

Open:

```text
http://127.0.0.1:5173
```

Backend health check:

```text
http://localhost:5000/api/health
```

If `npm run start` or `npm run dev` fails with `EADDRINUSE: address already in use :::5000`, another backend process is already running on port `5000`. Stop that process or change `PORT` and update `VITE_API_URL`.

## Authentication

Access is invite-only and protected by mandatory TOTP 2FA.

Flow:

1. Admin invites an email from the Team/Profile area.
2. Invitee opens `/?invite=<token>`.
3. Invitee sets name and password.
4. User logs in with email/password.
5. User enrolls or verifies TOTP 2FA.
6. Backend accepts protected API calls only when the Supabase JWT has `aal2`.

More details are in `AUTH-2FA.md`.

## Admin Access

Admin status is resolved by `backend/src/authMiddleware.js`:

- email is listed in `ADMIN_EMAILS`, or
- Supabase user metadata has `role: admin`

List users and admin state:

```bash
cd backend
node scripts/list-users.mjs
```

Promote or demote an existing user:

```bash
cd backend
node scripts/set-admin.mjs someone@example.com
node scripts/set-admin.mjs someone@example.com --demote
```

There is no admin password stored in the repository. Passwords are managed by Supabase Auth.

## Verification

Run backend package tests:

```bash
node --test backend/src/promptPackage.test.mjs
```

Check backend syntax:

```bash
node --check backend/src/server.js
```

Build frontend:

```bash
cd frontend
npm run build
```

## Current Notes

- Apply `supabase/schema.sql` before using the new Work Items and build artifact fields.
- Apply `supabase/invitations.sql` before using invite-only account creation.
- Obsidian integration is currently represented as generated markdown notes with YAML properties. A future integration can sync these notes into a real Obsidian vault.
- `npm audit` currently reports dependency advisories after install. Review before running `npm audit fix`, because it may change package versions.
