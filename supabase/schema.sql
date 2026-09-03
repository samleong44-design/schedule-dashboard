-- Consolidated Shipping Schedule Dashboard - initial schema.
-- Source of truth: docs/data-model.md. Run in Supabase SQL editor (or via CLI migration).
-- Idempotent-ish: drops nothing; safe on a fresh project only.

-- ============================================================
-- Identity
-- ============================================================

create table customer_companies (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  contact_email text,
  contact_phone text,
  address text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  role text not null check (role in ('admin','staff','customer')),
  customer_company_id uuid references customer_companies(id),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (role <> 'customer' or customer_company_id is not null)
);

-- Role helpers (SECURITY DEFINER to avoid RLS recursion on profiles).
-- Defined after profiles: SQL function bodies are validated at creation.
create or replace function public.app_role() returns text
language sql stable security definer set search_path = public as $$
  select role from profiles where id = auth.uid() and is_active
$$;

create or replace function public.app_company() returns uuid
language sql stable security definer set search_path = public as $$
  select customer_company_id from profiles where id = auth.uid() and is_active
$$;

-- Populate profiles from invite metadata on auth user creation.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, email, full_name, role, customer_company_id)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data->>'full_name',
    -- Default 'staff', not 'customer': dashboard-created users carry no metadata,
    -- and a customer row without a company would fail the check constraint.
    coalesce(new.raw_user_meta_data->>'role', 'staff'),
    nullif(new.raw_user_meta_data->>'customer_company_id', '')::uuid
  );
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- Master data
-- ============================================================

create table carriers (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  scac text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table ports (
  id uuid primary key default gen_random_uuid(),
  unlocode text not null unique,
  name text not null,
  country text,
  is_active boolean not null default true
);

create table terminals (
  id uuid primary key default gen_random_uuid(),
  port_id uuid not null references ports(id) on delete restrict,
  name text not null,
  code text,
  is_active boolean not null default true
);

create table vessels (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  imo text unique,
  is_active boolean not null default true
);

create table container_types (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  description text,
  is_active boolean not null default true
);

-- ============================================================
-- Schedule
-- ============================================================

create table upload_batches (
  id uuid primary key default gen_random_uuid(),
  carrier_id uuid not null references carriers(id) on delete restrict,
  storage_path text,
  original_filename text,
  mode text check (mode in ('FCL','LCL')),
  uploaded_by uuid references profiles(id),
  uploaded_at timestamptz not null default now(),
  status text not null default 'parsing'
    check (status in ('parsing','awaiting_confirm','committed','failed')),
  rows_inserted integer,
  rows_updated integer,
  rows_removed integer,
  parsed_payload jsonb,
  error_message text
);

create table sailings (
  id uuid primary key default gen_random_uuid(),
  carrier_id uuid not null references carriers(id) on delete restrict,
  vessel_id uuid not null references vessels(id) on delete restrict,
  voyage_no text not null,
  pol_id uuid not null references ports(id) on delete restrict,
  pod_id uuid not null references ports(id) on delete restrict,
  pol_terminal_id uuid references terminals(id) on delete restrict,
  pod_terminal_id uuid references terminals(id) on delete restrict,
  mode text not null default 'FCL' check (mode in ('FCL','LCL')),
  etd timestamptz,
  eta timestamptz,
  berthing_date timestamptz,
  eta_pol_terminal timestamptz,
  eta_pod_terminal timestamptz,
  si_cutoff timestamptz,
  vgm_cutoff timestamptz,
  cy_cutoff timestamptz,   -- business rule: ETD minus 1 day, 10:00 local
  doc_cutoff timestamptz,
  service_loop text,
  is_direct boolean,
  transhipment_ports text[],
  transit_days integer,
  upload_batch_id uuid references upload_batches(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (carrier_id, vessel_id, voyage_no, pol_id)
);

create index sailings_lane_idx on sailings (pol_id, pod_id, etd);
create index sailings_carrier_idx on sailings (carrier_id);
create index sailings_batch_idx on sailings (upload_batch_id);

create table sailing_history (
  id uuid primary key default gen_random_uuid(),
  sailing_id uuid,
  upload_batch_id uuid references upload_batches(id),
  changed_field text not null,
  old_value text,
  new_value text,
  change_type text not null check (change_type in ('insert','update','remove')),
  changed_at timestamptz not null default now()
);

-- ============================================================
-- Customer-facing records
-- ============================================================

create table booking_requests (
  id uuid primary key default gen_random_uuid(),
  sailing_id uuid references sailings(id) on delete set null,
  sailing_snapshot jsonb not null,
  customer_company_id uuid not null references customer_companies(id),
  submitted_by uuid not null references profiles(id),
  container_type_id uuid references container_types(id) on delete restrict,
  container_qty integer,
  commodity text,
  gross_weight_kg numeric,
  cargo_ready_date date,
  shipper text,
  consignee text,
  notify_party text,
  contact_name text,
  contact_phone text,
  contact_email text,
  is_dangerous_goods boolean not null default false,
  un_number text,
  dg_class text,
  reefer_temp_c numeric,
  oog_dimensions text,
  remarks text,
  status text not null default 'new' check (status in ('new','in_progress','closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (not is_dangerous_goods or (un_number is not null and dg_class is not null))
);

create table saved_searches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  label text not null,
  pol_id uuid references ports(id) on delete restrict,
  pod_id uuid references ports(id) on delete restrict,
  alerts_enabled boolean not null default true,
  created_at timestamptz not null default now()
);

create table settings (
  key text primary key,
  value jsonb not null,
  updated_by uuid references profiles(id),
  updated_at timestamptz not null default now()
);

create table audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references profiles(id),
  action text not null,
  entity_type text,
  entity_id text,
  before jsonb,
  after jsonb,
  created_at timestamptz not null default now()
);

-- ============================================================
-- Customer-facing masked view (THE carrier-masking control)
-- Owned by postgres => runs with owner rights, bypassing sailings RLS.
-- Customers get schedule data ONLY through this view.
-- ============================================================

create view sailings_public as
select
  s.id, s.voyage_no, s.mode,
  v.name as vessel_name,
  pol.unlocode as pol_code, pol.name as pol_name,
  pod.unlocode as pod_code, pod.name as pod_name,
  polt.name as pol_terminal, podt.name as pod_terminal,
  s.etd, s.eta, s.eta_pol_terminal, s.eta_pod_terminal
from sailings s
join vessels v on v.id = s.vessel_id
join ports pol on pol.id = s.pol_id
join ports pod on pod.id = s.pod_id
left join terminals polt on polt.id = s.pol_terminal_id
left join terminals podt on podt.id = s.pod_terminal_id;

grant select on sailings_public to authenticated;

-- ============================================================
-- RLS
-- ============================================================

alter table customer_companies enable row level security;
alter table profiles enable row level security;
alter table carriers enable row level security;
alter table ports enable row level security;
alter table terminals enable row level security;
alter table vessels enable row level security;
alter table container_types enable row level security;
alter table upload_batches enable row level security;
alter table sailings enable row level security;
alter table sailing_history enable row level security;
alter table booking_requests enable row level security;
alter table saved_searches enable row level security;
alter table settings enable row level security;
alter table audit_log enable row level security;

-- profiles
create policy "own profile" on profiles
  for select using (id = auth.uid());
create policy "admin manages profiles" on profiles
  for all using (app_role() = 'admin') with check (app_role() = 'admin');

-- customer_companies
create policy "admin manages companies" on customer_companies
  for all using (app_role() = 'admin') with check (app_role() = 'admin');
create policy "staff reads companies" on customer_companies
  for select using (app_role() = 'staff');
create policy "customer reads own company" on customer_companies
  for select using (id = app_company());

-- master data: all authenticated read, staff/admin write; carriers staff/admin only
create policy "read ports" on ports for select using (auth.role() = 'authenticated');
create policy "staff writes ports" on ports for all
  using (app_role() in ('admin','staff')) with check (app_role() in ('admin','staff'));

create policy "read terminals" on terminals for select using (auth.role() = 'authenticated');
create policy "staff writes terminals" on terminals for all
  using (app_role() in ('admin','staff')) with check (app_role() in ('admin','staff'));

create policy "read vessels" on vessels for select using (auth.role() = 'authenticated');
create policy "staff writes vessels" on vessels for all
  using (app_role() in ('admin','staff')) with check (app_role() in ('admin','staff'));

create policy "read container types" on container_types for select using (auth.role() = 'authenticated');
create policy "staff writes container types" on container_types for all
  using (app_role() in ('admin','staff')) with check (app_role() in ('admin','staff'));

create policy "staff reads carriers" on carriers for select using (app_role() in ('admin','staff'));
create policy "staff writes carriers" on carriers for all
  using (app_role() in ('admin','staff')) with check (app_role() in ('admin','staff'));

-- sailings: staff/admin only. Customers have NO policy - masked view is their only path.
create policy "staff full sailings" on sailings for all
  using (app_role() in ('admin','staff')) with check (app_role() in ('admin','staff'));

-- upload_batches: staff read/insert; no client update (committed batches immutable, no rollback in v1)
create policy "staff reads batches" on upload_batches
  for select using (app_role() in ('admin','staff'));
create policy "staff creates batches" on upload_batches
  for insert with check (app_role() in ('admin','staff') and uploaded_by = auth.uid());

-- sailing_history: staff read; writes come from Edge Function (service role)
create policy "staff reads history" on sailing_history
  for select using (app_role() in ('admin','staff'));

-- booking_requests
create policy "customer submits own" on booking_requests
  for insert with check (
    app_role() = 'customer'
    and customer_company_id = app_company()
    and submitted_by = auth.uid()
  );
create policy "read booking requests" on booking_requests
  for select using (
    (app_role() = 'customer' and customer_company_id = app_company())
    or app_role() in ('admin','staff')
  );
create policy "staff updates booking requests" on booking_requests
  for update using (app_role() in ('admin','staff'));

-- saved_searches: owner-only
create policy "own saved searches" on saved_searches
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- settings: all read, admin write
create policy "read settings" on settings for select using (auth.role() = 'authenticated');
create policy "admin writes settings" on settings for all
  using (app_role() = 'admin') with check (app_role() = 'admin');

-- audit_log: admin read only; no client insert (server-side writes only)
create policy "admin reads audit" on audit_log
  for select using (app_role() = 'admin');

-- ============================================================
-- Seed - master data, settings, sample sailings (mirrors web/lib/mock.ts)
-- ============================================================

insert into settings (key, value) values
  ('search_window_days', '14'),
  ('default_pol_id', 'null'),
  ('date_format', '"DD MMM YYYY"'),
  ('timezone', '"Asia/Kuala_Lumpur"'),
  ('page_size', '50'),
  ('booking_recipient', '""');

insert into carriers (name, scac) values
  ('Maersk', 'MAEU'), ('ONE', 'ONEY'), ('Evergreen', 'EGLV');

insert into ports (unlocode, name, country) values
  ('MYPKG', 'Port Klang', 'Malaysia'),
  ('MYTPP', 'Tanjung Pelepas', 'Malaysia'),
  ('AEJEA', 'Jebel Ali', 'United Arab Emirates'),
  ('NLRTM', 'Rotterdam', 'Netherlands'),
  ('CNSHA', 'Shanghai', 'China'),
  ('SGSIN', 'Singapore', 'Singapore');

insert into vessels (name) values
  ('MSC ISABELLA'), ('EVER GIVEN'), ('EVER GLORY'), ('MAERSK SEMARANG'), ('ONE HARBOUR');

insert into container_types (code, description) values
  ('20GP', '20ft general purpose'),
  ('40GP', '40ft general purpose'),
  ('40HC', '40ft high cube'),
  ('40RF', '40ft reefer');

-- Sample sailings; cy_cutoff = etd - 1 day at 10:00 MYT (+08)
insert into sailings (carrier_id, vessel_id, voyage_no, pol_id, pod_id, mode, etd, eta, cy_cutoff)
select c.id, v.id, x.voyage, pol.id, pod.id, x.mode, x.etd, x.eta, x.etd - interval '1 day' + interval '10 hours'
from (values
  ('Maersk',    'MSC ISABELLA',    '034E', 'MYPKG', 'AEJEA', 'FCL', timestamptz '2026-08-14 00:00+08', timestamptz '2026-08-28 00:00+08'),
  ('ONE',       'EVER GIVEN',      '118W', 'MYPKG', 'NLRTM', 'FCL', timestamptz '2026-08-15 00:00+08', timestamptz '2026-09-02 00:00+08'),
  ('Evergreen', 'EVER GLORY',      '072E', 'MYPKG', 'CNSHA', 'LCL', timestamptz '2026-08-16 00:00+08', timestamptz '2026-08-23 00:00+08'),
  ('Maersk',    'MAERSK SEMARANG', '220N', 'MYPKG', 'AEJEA', 'LCL', timestamptz '2026-08-18 00:00+08', timestamptz '2026-09-01 00:00+08'),
  ('ONE',       'ONE HARBOUR',     '045E', 'MYTPP', 'SGSIN', 'FCL', timestamptz '2026-08-19 00:00+08', timestamptz '2026-08-21 00:00+08')
) as x(carrier, vessel, voyage, pol, pod, mode, etd, eta)
join carriers c on c.name = x.carrier
join vessels v on v.name = x.vessel
join ports pol on pol.unlocode = x.pol
join ports pod on pod.unlocode = x.pod;

-- Storage bucket for original carrier files (private)
insert into storage.buckets (id, name, public) values ('carrier-schedules', 'carrier-schedules', false)
on conflict do nothing;
