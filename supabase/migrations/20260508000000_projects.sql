-- =============================================================================
-- Projects (folders) layer
-- =============================================================================
-- Adds a `projects` table and a required `project_id` column on `schemas`.
-- Each user backfills one default "My schemas" project that captures every
-- existing schema; from then on every schema must belong to a project.
--
-- Sharing model is unchanged: projects are owner-only, sharing remains
-- per-schema via `schema_collaborators`. Project deletion is RESTRICT — a
-- non-empty project surfaces as a 23503 FK violation that the client
-- translates to a friendlier "move or delete schemas first" message.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. projects table
-- ---------------------------------------------------------------------------
create table public.projects (
  id          uuid        primary key default gen_random_uuid(),
  owner_id    uuid        not null references auth.users(id) on delete cascade,
  name        text        not null default 'My schemas',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index projects_owner_updated_idx
  on public.projects (owner_id, updated_at desc);

create trigger projects_set_updated_at
  before update on public.projects
  for each row
  execute function public.set_updated_at();

alter table public.projects enable row level security;

create policy "projects_select_own"
  on public.projects for select
  using (auth.uid() = owner_id);

create policy "projects_insert_own"
  on public.projects for insert
  with check (auth.uid() = owner_id);

create policy "projects_update_own"
  on public.projects for update
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

create policy "projects_delete_own"
  on public.projects for delete
  using (auth.uid() = owner_id);

-- ---------------------------------------------------------------------------
-- 2. schemas.project_id (nullable first so the backfill can populate it)
-- ---------------------------------------------------------------------------
alter table public.schemas
  add column project_id uuid references public.projects(id) on delete restrict;

-- ---------------------------------------------------------------------------
-- 3. Backfill: one default project per owner that has any schemas, then
--    point every existing schema at it.
-- ---------------------------------------------------------------------------
do $$
declare
  uid uuid;
  pid uuid;
begin
  for uid in select distinct owner_id from public.schemas where project_id is null loop
    insert into public.projects (owner_id, name)
      values (uid, 'My schemas')
      returning id into pid;
    update public.schemas set project_id = pid
      where owner_id = uid and project_id is null;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Tighten the constraint now that every row has a project_id.
-- ---------------------------------------------------------------------------
alter table public.schemas
  alter column project_id set not null;

create index schemas_project_updated_idx
  on public.schemas (project_id, updated_at desc);
