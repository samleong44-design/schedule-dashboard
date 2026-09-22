-- Client activity tracking + per-staff report access.
-- user_activity: one row per user per MYT day (login/usage frequency proxy).
-- company_id denormalized so staff can report per client without a profiles
-- join (profiles RLS is own-row for staff).

create table if not exists public.user_activity (
  user_id uuid not null references public.profiles(id) on delete cascade,
  day date not null default (now() at time zone 'Asia/Kuala_Lumpur')::date,
  company_id uuid references public.customer_companies(id),
  primary key (user_id, day)
);

alter table public.user_activity enable row level security;

create policy "own activity insert" on public.user_activity
  for insert with check (
    user_id = auth.uid()
    and (company_id is null or company_id = public.app_company())
  );

create policy "staff reads activity" on public.user_activity
  for select using (public.app_role() in ('admin','staff'));

-- Admin grants report access per coworker (admins always have access).
alter table public.profiles
  add column if not exists can_view_reports boolean not null default false;
