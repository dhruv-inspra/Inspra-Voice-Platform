create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  company text not null default 'Untitled client',
  industry text not null default '',
  platform text not null default 'LiveKit',
  status text not null default 'Discovery',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'Untitled task',
  priority text not null default 'Normal',
  owner text not null default 'AI owns next step',
  status text not null default 'Queued',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.prompt_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null default 'new',
  client text not null default 'Selected client',
  platform text not null default 'LiveKit',
  llm_provider text not null default 'AI selects provider',
  llm_model text not null default 'AI selects best model',
  temperature text not null default '0.4',
  max_tokens text not null default '4000',
  reasoning_mode text not null default 'Balanced',
  skill_selection text not null default 'AI picks skills',
  autonomy text not null default 'AI-led',
  source_brief text not null default '',
  previous_prompt text not null default '',
  client_feedback text not null default '',
  optimization_target text not null default 'AI selects issues',
  output text not null default '',
  qa_checklist text not null default '',
  test_report text not null default '',
  latency_notes text not null default '',
  deployment_package text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists clients_user_updated_idx on public.clients(user_id, updated_at desc);
create index if not exists tasks_user_updated_idx on public.tasks(user_id, updated_at desc);
create index if not exists prompt_jobs_user_updated_idx on public.prompt_jobs(user_id, updated_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function public.set_updated_at() from public;

drop trigger if exists clients_set_updated_at on public.clients;
create trigger clients_set_updated_at
  before update on public.clients
  for each row execute function public.set_updated_at();

drop trigger if exists tasks_set_updated_at on public.tasks;
create trigger tasks_set_updated_at
  before update on public.tasks
  for each row execute function public.set_updated_at();

drop trigger if exists prompt_jobs_set_updated_at on public.prompt_jobs;
create trigger prompt_jobs_set_updated_at
  before update on public.prompt_jobs
  for each row execute function public.set_updated_at();

grant select, insert, update, delete on public.clients to authenticated;
grant select, insert, update, delete on public.tasks to authenticated;
grant select, insert, update, delete on public.prompt_jobs to authenticated;

alter table public.clients enable row level security;
alter table public.tasks enable row level security;
alter table public.prompt_jobs enable row level security;

drop policy if exists "clients_select_own" on public.clients;
create policy "clients_select_own"
  on public.clients for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "clients_insert_own" on public.clients;
create policy "clients_insert_own"
  on public.clients for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "clients_update_own" on public.clients;
create policy "clients_update_own"
  on public.clients for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "clients_delete_own" on public.clients;
create policy "clients_delete_own"
  on public.clients for delete
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "tasks_select_own" on public.tasks;
create policy "tasks_select_own"
  on public.tasks for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "tasks_insert_own" on public.tasks;
create policy "tasks_insert_own"
  on public.tasks for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "tasks_update_own" on public.tasks;
create policy "tasks_update_own"
  on public.tasks for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "tasks_delete_own" on public.tasks;
create policy "tasks_delete_own"
  on public.tasks for delete
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "prompt_jobs_select_own" on public.prompt_jobs;
create policy "prompt_jobs_select_own"
  on public.prompt_jobs for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "prompt_jobs_insert_own" on public.prompt_jobs;
create policy "prompt_jobs_insert_own"
  on public.prompt_jobs for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "prompt_jobs_update_own" on public.prompt_jobs;
create policy "prompt_jobs_update_own"
  on public.prompt_jobs for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "prompt_jobs_delete_own" on public.prompt_jobs;
create policy "prompt_jobs_delete_own"
  on public.prompt_jobs for delete
  to authenticated
  using ((select auth.uid()) = user_id);
