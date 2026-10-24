-- Car app (Tesla Model 3, 231-D-43971): Supabase schema. Same project as the Chores app (same sign-in).
-- All tables are prefixed car_ so nothing else is touched.
-- Run once: Supabase > SQL Editor > New query > paste all of this > Run. Safe to run again (idempotent).
-- Every row belongs to one user (owner_id = auth.uid()); row-level security lets only the owner read/write.
-- The app fills in the starting kit list, dates, wash steps and car jobs the first time you sign in.
-- Already ran an older version? Just run this whole file again: it only adds what's missing (car_jobs) and keeps your data.
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

-- Car jobs: recurring maintenance (and one-offs, hidden once done). next due = last_done + frequency (worked out in the app)
create table if not exists public.car_jobs (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title       text not null check (length(btrim(title)) between 1 and 200),
  frequency   text not null default 'monthly' check (frequency in ('once','weekly','fortnightly','monthly','6monthly')),
  last_done   date,                                   -- null = never done (shows as Due now); one-offs are hidden once this is set
  note        text,
  link_tab    text check (link_tab in ('check','wash')),   -- optional shortcut to the Kit check or Wash tab
  sort_order  int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists car_jobs_owner_idx on public.car_jobs (owner_id, sort_order);

-- updated_at
create or replace function public.car_touch() returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end $$;

-- Row-level security: owner only (same policies as the Chores / Art tables)
do $$
declare t text;
begin
  foreach t in array array['car_items','car_dates','car_checks','car_wash','car_jobs'] loop
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
  foreach t in array array['car_items','car_dates','car_checks','car_wash','car_jobs'] loop
    begin execute format('alter publication supabase_realtime add table public.%I', t);
    exception when others then null; end;
  end loop;
end $$;

-- @@JOBS-SEED-START (generated by scripts/make_seed.py)
-- Starting car jobs for everyone who already uses the car app (has kit items) and has no jobs yet. The app does the same on first sign-in.
insert into public.car_jobs (id, owner_id, title, frequency, last_done, note, link_tab, sort_order)
select v.id::uuid, u.owner_id, v.title, v.frequency, v.last_done::date, v.note, v.link_tab, v.sort_order
from (select distinct owner_id from public.car_items) u
cross join (values
  ('422a4e7e-62ba-58bd-a6dd-978ffb7658b2', 'Check the repair has been signed off, including the wheel alignment, rear half-shaft and CV joints', 'once', null, 'When the Tesla is collected from Ace Autobody', null, 10),
  ('f50814f5-6252-51d4-935f-264429c56383', 'Run the kit check', 'once', null, 'When the Tesla is collected from Ace Autobody', 'check', 20),
  ('47ebadc9-96f1-5428-858a-064a5bd2a666', 'Return the Enterprise Kuga (241-D-24547)', 'once', null, 'When the Tesla is collected from Ace Autobody', null, 30),
  ('100a058b-91fe-5b00-9622-ddfa4ca6f6dc', 'File Ace''s paperwork and photos', 'once', null, 'When the Tesla is collected from Ace Autobody', null, 40),
  ('5aa475f9-85a1-564b-a721-421994a9324d', 'Charge to 100% (LFP battery)', 'weekly', null, null, null, 50),
  ('4695f6e1-f926-53f8-90c1-836c0122e942', 'Check tyre pressures in the Tesla app', 'weekly', null, null, null, 60),
  ('60edc1b2-c9a6-5677-baa1-7f26493c0a29', 'Jet wash (roof, windows, bonnet, sides, boot, wheels)', 'fortnightly', null, null, 'wash', 70),
  ('07625db7-d65c-5591-a187-9709d98eef67', 'Hoover dog hair and wipe the interior', 'fortnightly', null, null, null, 80),
  ('045142e8-e5f4-5f55-8650-22652e3c01da', 'Top up screenwash', 'monthly', null, 'Use winter-rated screenwash from October to March.', null, 90),
  ('2d9a17bd-97e9-5585-ad58-bc5a7cdd3df9', 'Clean the window rubbers and treat them for algae', 'monthly', null, null, null, 100),
  ('683c038c-9236-5dba-b446-d06d4adab912', 'Check tyre tread and look for damage', 'monthly', null, null, null, 110),
  ('a840dc4c-4183-5191-9639-7472e5d6b54f', 'Clear leaves from the scuttle under the windscreen and from the frunk edges', 'monthly', null, null, null, 120),
  ('175932fb-a701-55ef-8162-127410344c2c', 'Check the wiper blades', '6monthly', '2025-09-28', null, null, 130),
  ('d2312a1f-a034-5dfe-95cd-00574632d690', 'Seal or wax the paint', '6monthly', null, null, null, 140)
) as v(id, title, frequency, last_done, note, link_tab, sort_order)
where not exists (select 1 from public.car_jobs j where j.owner_id = u.owner_id)
on conflict (id) do nothing;
-- @@JOBS-SEED-END

notify pgrst, 'reload schema';
