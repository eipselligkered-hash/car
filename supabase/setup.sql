-- Car app (Tesla Model 3, 231-D-43971): Supabase schema. Same project as the Chores app (same sign-in).
-- All tables are prefixed car_ so nothing else is touched.
-- Run once: Supabase > SQL Editor > New query > paste all of this > Run. Safe to run again (idempotent).
-- Every row belongs to one user (owner_id = auth.uid()); row-level security lets only the owner read/write.
-- The app fills in the starting kit list, dates and wash steps the first time you sign in.
create extension if not exists pgcrypto;

-- Kit list: two ticks per item - have (owned) and packed (in the car)
create table if not exists public.car_items (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  section     text not null check (section in ('glovebox','cabin','boot','frunk','seasonal')),
  name        text not null check (length(btrim(name)) between 1 and 200),
  note        text,                                   -- e.g. the reason it's critical: 'Ireland rain'
  critical    boolean not null default false,
  have        boolean not null default false,         -- 'Have it'
  packed      boolean not null default false,         -- 'In the car'
  sort_order  int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists car_items_owner_idx on public.car_items (owner_id, section, sort_order);

-- Upcoming dates (service, warranty, NCT, motor tax, insurance) and 'Recommended by Tesla app' jobs
create table if not exists public.car_dates (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind        text not null default 'date' check (kind in ('date','recommended')),
  title       text not null check (length(btrim(title)) between 1 and 200),
  due_date    date,                                   -- sort key / days-until
  due_label   text,                                   -- optional wording instead of the exact date, e.g. 'January 2027'
  remind_on   date,
  note        text,
  cost        text,                                   -- e.g. 'about €85'
  done_on     date,                                   -- null = not done
  sort_order  int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists car_dates_owner_idx on public.car_dates (owner_id, due_date);

-- Kit checks (e.g. collecting the car from the bodyshop) and finished washes.
-- completed_on null = a kit check in progress; results = {"<item id>": "ok" | "missing"}
create table if not exists public.car_checks (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind         text not null default 'kit' check (kind in ('kit','wash')),
  started_at   timestamptz not null default now(),
  completed_on date,
  results      jsonb not null default '{}'::jsonb,
  missing      text[] not null default '{}',          -- names of missing items, kept for the summary
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists car_checks_owner_idx on public.car_checks (owner_id, kind, completed_on);

-- Wash steps in jet-wash order
create table if not exists public.car_wash (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name        text not null check (length(btrim(name)) between 1 and 100),
  done        boolean not null default false,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists car_wash_owner_idx on public.car_wash (owner_id, sort_order);

-- updated_at
create or replace function public.car_touch() returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end $$;

-- Row-level security: owner only (same policies as the Chores / Art tables)
do $$
declare t text;
begin
  foreach t in array array['car_items','car_dates','car_checks','car_wash'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop trigger if exists %I on public.%I', t || '_touch', t);
    execute format('create trigger %I before update on public.%I for each row execute function public.car_touch()', t || '_touch', t);
    execute format('drop policy if exists "owner select" on public.%I', t);
    execute format('drop policy if exists "owner insert" on public.%I', t);
    execute format('drop policy if exists "owner update" on public.%I', t);
    execute format('drop policy if exists "owner delete" on public.%I', t);
    execute format('create policy "owner select" on public.%I for select to authenticated using (owner_id = (select auth.uid()))', t);
    execute format('create policy "owner insert" on public.%I for insert to authenticated with check (owner_id = (select auth.uid()))', t);
    execute format('create policy "owner update" on public.%I for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()))', t);
    execute format('create policy "owner delete" on public.%I for delete to authenticated using (owner_id = (select auth.uid()))', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;

-- live updates between devices (ignore if already added)
do $$
declare t text;
begin
  foreach t in array array['car_items','car_dates','car_checks','car_wash'] loop
    begin execute format('alter publication supabase_realtime add table public.%I', t);
    exception when others then null; end;
  end loop;
end $$;

notify pgrst, 'reload schema';
