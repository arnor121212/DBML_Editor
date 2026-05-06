-- Cloud storage for DBML schemas. One row per schema, owned by exactly one user.
-- RLS makes "owned by the current user" the only access rule.

create table public.schemas (
  id          uuid        primary key default gen_random_uuid(),
  owner_id    uuid        not null references auth.users(id) on delete cascade,
  name        text        not null default 'Untitled schema',
  dbml        text        not null default '',
  positions   jsonb       not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Index for the dashboard query: every schema owned by the current user, newest first.
create index schemas_owner_updated_idx
  on public.schemas (owner_id, updated_at desc);

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger schemas_set_updated_at
  before update on public.schemas
  for each row
  execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security: a user can only see and modify their own schemas.
-- ---------------------------------------------------------------------------
alter table public.schemas enable row level security;

create policy "schemas_select_own"
  on public.schemas for select
  using (auth.uid() = owner_id);

create policy "schemas_insert_own"
  on public.schemas for insert
  with check (auth.uid() = owner_id);

create policy "schemas_update_own"
  on public.schemas for update
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

create policy "schemas_delete_own"
  on public.schemas for delete
  using (auth.uid() = owner_id);
