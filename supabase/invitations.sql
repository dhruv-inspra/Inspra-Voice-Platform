-- Invite-only access (mirrors the WSC model).
-- An admin creates an invitation row with a one-time token; the invitee opens
-- /?invite=<token>, sets a password, and an account is created server-side.
--
-- Only the service-role backend touches this table, so RLS is enabled with NO
-- policies (anon/authenticated get no access; service_role bypasses RLS).

create table if not exists public.invitations (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  role text not null default 'member',
  token text not null unique,
  invited_by uuid references auth.users(id) on delete set null,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists invitations_token_idx on public.invitations(token);
create index if not exists invitations_email_idx on public.invitations(email);

alter table public.invitations enable row level security;
revoke all on public.invitations from anon, authenticated;
