-- =============================================================================
-- Phase A — Sharing & permissions
-- Phase B — Version history
-- =============================================================================
-- This migration extends the `schemas` table with a public-link role column
-- and adds three companion tables: collaborators, invites, snapshots.
-- It also rewires RLS so reads/writes go through helper functions that
-- collapse the (owner | collaborator | public-link) authorization rules into
-- one readable expression.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. schemas: add public_role column
-- ---------------------------------------------------------------------------
alter table public.schemas
  add column public_role text not null default 'none'
    check (public_role in ('none', 'viewer', 'editor'));

-- ---------------------------------------------------------------------------
-- 2. schema_collaborators
-- ---------------------------------------------------------------------------
create table public.schema_collaborators (
  schema_id  uuid not null references public.schemas(id) on delete cascade,
  user_id    uuid not null references auth.users(id)     on delete cascade,
  role       text not null check (role in ('viewer', 'editor', 'owner')),
  -- Cached from auth.jwt() at accept-time so the UI can label collaborator
  -- rows without granting client access to auth.users.
  email       text,
  display_name text,
  added_at   timestamptz not null default now(),
  primary key (schema_id, user_id)
);

create index schema_collaborators_user_idx
  on public.schema_collaborators (user_id);

-- ---------------------------------------------------------------------------
-- 3. schema_invites — tokenized link the owner shares to grant access
-- ---------------------------------------------------------------------------
create table public.schema_invites (
  id           uuid primary key default gen_random_uuid(),
  schema_id    uuid not null references public.schemas(id) on delete cascade,
  email        text not null,
  role         text not null check (role in ('viewer', 'editor')),
  token        uuid not null unique default gen_random_uuid(),
  created_by   uuid not null references auth.users(id),
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null default (now() + interval '14 days'),
  accepted_at  timestamptz,
  accepted_by  uuid references auth.users(id)
);

create index schema_invites_schema_idx on public.schema_invites (schema_id);
create index schema_invites_token_idx  on public.schema_invites (token);

-- ---------------------------------------------------------------------------
-- 4. schema_snapshots — version history rows
-- ---------------------------------------------------------------------------
create table public.schema_snapshots (
  id           uuid primary key default gen_random_uuid(),
  schema_id    uuid not null references public.schemas(id) on delete cascade,
  dbml         text not null,
  positions    jsonb not null default '{}'::jsonb,
  label        text,                          -- null for auto-snapshots
  created_by   uuid references auth.users(id),
  created_at   timestamptz not null default now()
);

create index schema_snapshots_schema_created_idx
  on public.schema_snapshots (schema_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 5. Helper functions (security definer) — used by RLS policies
-- ---------------------------------------------------------------------------
-- security definer is required so the helpers can read the schemas row
-- without recursing through RLS. They never return data — only booleans —
-- so there's no leak risk.

create or replace function public.can_read_schema(target_id uuid)
returns boolean
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  s public.schemas%rowtype;
begin
  select * into s from public.schemas where id = target_id;
  if not found then return false; end if;
  if s.public_role <> 'none' then return true; end if;
  if auth.uid() is null then return false; end if;
  if s.owner_id = auth.uid() then return true; end if;
  return exists (
    select 1 from public.schema_collaborators
    where schema_id = target_id and user_id = auth.uid()
  );
end;
$$;

create or replace function public.can_edit_schema(target_id uuid)
returns boolean
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  s public.schemas%rowtype;
begin
  select * into s from public.schemas where id = target_id;
  if not found then return false; end if;
  if s.public_role = 'editor' then return true; end if;
  if auth.uid() is null then return false; end if;
  if s.owner_id = auth.uid() then return true; end if;
  return exists (
    select 1 from public.schema_collaborators
    where schema_id = target_id
      and user_id = auth.uid()
      and role in ('editor', 'owner')
  );
end;
$$;

create or replace function public.is_schema_owner(target_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.schemas
    where id = target_id and owner_id = auth.uid()
  );
$$;

-- ---------------------------------------------------------------------------
-- 6. Replace schemas RLS with collaboration-aware policies
-- ---------------------------------------------------------------------------
drop policy if exists "schemas_select_own" on public.schemas;
drop policy if exists "schemas_insert_own" on public.schemas;
drop policy if exists "schemas_update_own" on public.schemas;
drop policy if exists "schemas_delete_own" on public.schemas;

create policy "schemas_select"
  on public.schemas for select
  using (public.can_read_schema(id));

create policy "schemas_insert"
  on public.schemas for insert
  with check (auth.uid() = owner_id);

create policy "schemas_update"
  on public.schemas for update
  using (public.can_edit_schema(id))
  with check (public.can_edit_schema(id));

create policy "schemas_delete"
  on public.schemas for delete
  using (auth.uid() = owner_id);

-- ---------------------------------------------------------------------------
-- 7. RLS: schema_collaborators
-- ---------------------------------------------------------------------------
alter table public.schema_collaborators enable row level security;

create policy "collaborators_select"
  on public.schema_collaborators for select
  using (public.can_read_schema(schema_id));

create policy "collaborators_modify"
  on public.schema_collaborators for all
  using (public.is_schema_owner(schema_id))
  with check (public.is_schema_owner(schema_id));

-- ---------------------------------------------------------------------------
-- 8. RLS: schema_invites
-- ---------------------------------------------------------------------------
alter table public.schema_invites enable row level security;

-- Only owners can list / create / delete invites. Invitees do NOT need to
-- read this table directly — they accept by calling the `accept_invite` RPC
-- with the token from their link, and the RPC validates server-side. Letting
-- invitees SELECT would expose tokens for every schema that ever invited
-- their email, which would be a privilege-escalation footgun.
create policy "invites_select"
  on public.schema_invites for select
  using (public.is_schema_owner(schema_id));

create policy "invites_insert"
  on public.schema_invites for insert
  with check (public.is_schema_owner(schema_id));

create policy "invites_delete"
  on public.schema_invites for delete
  using (public.is_schema_owner(schema_id));

-- ---------------------------------------------------------------------------
-- 9. RLS: schema_snapshots
-- ---------------------------------------------------------------------------
alter table public.schema_snapshots enable row level security;

create policy "snapshots_select"
  on public.schema_snapshots for select
  using (public.can_read_schema(schema_id));

create policy "snapshots_insert"
  on public.schema_snapshots for insert
  with check (public.can_edit_schema(schema_id));

create policy "snapshots_delete"
  on public.schema_snapshots for delete
  using (public.is_schema_owner(schema_id));

-- ---------------------------------------------------------------------------
-- 10. accept_invite RPC — atomically validate token + add collaborator + mark accepted
-- ---------------------------------------------------------------------------
-- Called by the signed-in invitee. Verifies the token belongs to a non-expired
-- invite, that their email matches, then adds them to schema_collaborators.

create or replace function public.accept_invite(invite_token uuid)
returns uuid                                  -- returns the schema_id on success
language plpgsql
security definer
set search_path = public
as $$
declare
  inv public.schema_invites%rowtype;
  caller_email text := auth.jwt() ->> 'email';
  caller_id    uuid := auth.uid();
begin
  if caller_id is null then
    raise exception 'Must be signed in to accept an invite';
  end if;

  select * into inv
  from public.schema_invites
  where token = invite_token
  for update;

  if not found then
    raise exception 'Invite not found';
  end if;
  if inv.accepted_at is not null then
    raise exception 'Invite already accepted';
  end if;
  if inv.expires_at < now() then
    raise exception 'Invite has expired';
  end if;
  if inv.email <> caller_email then
    raise exception 'This invite is for a different email';
  end if;

  -- Mark the invite consumed *first*. If a network retry replays this RPC
  -- after the collaborator insert already committed, the second call will
  -- fail the `accepted_at IS NOT NULL` check above instead of silently
  -- re-running the insert (which could revert an owner's later role change).
  update public.schema_invites
    set accepted_at = now(), accepted_by = caller_id
    where id = inv.id;

  -- Add the collaborator row, caching identifying info from JWT so the
  -- owner's UI can label collaborators without auth.users access. The
  -- ON CONFLICT branch only runs on retries before this invite was
  -- accepted; subsequent re-accept attempts are blocked by the check above.
  insert into public.schema_collaborators (schema_id, user_id, role, email, display_name)
  values (
    inv.schema_id, caller_id, inv.role, caller_email,
    coalesce(
      auth.jwt() #>> '{user_metadata,full_name}',
      auth.jwt() #>> '{user_metadata,name}',
      caller_email
    )
  )
  on conflict (schema_id, user_id) do update
    set role = excluded.role,
        email = excluded.email,
        display_name = excluded.display_name;

  return inv.schema_id;
end;
$$;

grant execute on function public.accept_invite(uuid) to authenticated;
