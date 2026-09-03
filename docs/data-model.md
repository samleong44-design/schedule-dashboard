# Data model

All tables in one place. Module docs reference this file rather than restating columns.

Conventions: `uuid` primary keys defaulting to `gen_random_uuid()`, `timestamptz` for all instants,
`created_at` / `updated_at` on mutable tables. **RLS is enabled on every table.** A table with RLS
enabled and no policy is deny-all — that is the intended default; only listed policies open access.

## Role helper

Role lives on `profiles`, not in the JWT. Reading it inside a policy would recurse into `profiles`'
own RLS, so wrap it in a `SECURITY DEFINER` function:

```sql
create function public.app_role() returns text
language sql stable security definer set search_path = public as $$
  select role from profiles where id = auth.uid()
$$;

create function public.app_company() returns uuid
language sql stable security definer set search_path = public as $$
  select customer_company_id from profiles where id = auth.uid()
$$;
```

Every policy below uses these. See [01-auth-and-roles.md](01-auth-and-roles.md) for why this over
JWT custom claims.

---

## Identity

### `profiles`
Application-level user record, 1:1 with `auth.users`.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | FK → `auth.users.id`, `on delete cascade` |
| `email` | text | Mirrored from auth for display and search |
| `full_name` | text | |
| `role` | text | `'admin' \| 'staff' \| 'customer'`, CHECK constraint |
| `customer_company_id` | uuid | FK → `customer_companies`, required when `role = 'customer'` |
| `is_active` | boolean | Deactivation without deletion |
| `created_at` / `updated_at` | timestamptz | |

CHECK: `role <> 'customer' or customer_company_id is not null`.

**RLS:** a user selects their own row; admin selects and writes all.

### `customer_companies`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `name` | text | Unique |
| `contact_email` / `contact_phone` / `address` | text | |
| `is_active` | boolean | |
| `created_at` | timestamptz | |

**RLS:** admin full; staff select; customer selects only their own company row.

---

## Master data

Small, admin/staff-maintained reference tables. All are **select-visible to every authenticated
user** (a customer needs port names to run a search) except `carriers`, which is staff/admin only —
exposing the carrier list is not itself a leak, but nothing customer-facing needs it, so it stays
closed.

### `carriers`
`id` · `name` · `scac` (nullable) · `is_active` · `created_at`

### `ports`
`id` · `unlocode` (unique, e.g. `MYPKG`) · `name` · `country` · `is_active`

### `terminals`
`id` · `port_id` FK → `ports` · `name` · `code` (nullable) · `is_active`

### `vessels`
`id` · `name` · `imo` (nullable, unique when present) · `is_active`

### `container_types`
`id` · `code` (`20GP`, `40GP`, `40HC`, `40RF`, …) · `description` · `is_active`

Master data is **never hard-deleted** while referenced — see
[06-settings-and-master-data.md](06-settings-and-master-data.md).

---

## Schedule

### `sailings`
The core table.

| Column | Type | Visibility | Notes |
|---|---|---|---|
| `id` | uuid PK | | |
| `carrier_id` | uuid FK → `carriers` | **staff only** | Part of the matching key |
| `vessel_id` | uuid FK → `vessels` | customer | |
| `voyage_no` | text | customer | |
| `pol_id` | uuid FK → `ports` | customer | Port of loading |
| `pod_id` | uuid FK → `ports` | customer | Port of discharge |
| `pol_terminal_id` | uuid FK → `terminals` | customer | |
| `pod_terminal_id` | uuid FK → `terminals` | customer | |
| `etd` | timestamptz | customer | Departure ex POL |
| `eta` | timestamptz | customer | Arrival at POD |
| `berthing_date` | timestamptz | customer | |
| `eta_pol_terminal` | timestamptz | customer | Shown in the customer results grid |
| `eta_pod_terminal` | timestamptz | customer | Shown in the customer results grid |
| `si_cutoff` | timestamptz | **staff only** | Shipping instruction |
| `vgm_cutoff` | timestamptz | **staff only** | Verified gross mass |
| `cy_cutoff` | timestamptz | **staff only** | Container yard |
| `doc_cutoff` | timestamptz | **staff only** | Documentation |
| `service_loop` | text | **staff only** | |
| `is_direct` | boolean | **staff only** | |
| `transhipment_ports` | text[] | **staff only** | |
| `transit_days` | integer | **staff only** | |
| `upload_batch_id` | uuid FK → `upload_batches` | staff | Provenance — links a row to its source file |
| `created_at` / `updated_at` | timestamptz | | |

**Matching key** (natural identity for ingestion):
`unique (carrier_id, vessel_id, voyage_no, pol_id)`.

Indexes: `(pol_id, pod_id, etd)` for the search path, `(carrier_id)` for carrier-wide replace,
`(upload_batch_id)` for provenance lookups.

**RLS:** `select`/`insert`/`update`/`delete` for `app_role() in ('admin','staff')` only.
Customers have **no policy on this table at all** — they reach the schedule solely through the view
below.

### `sailings_public` — the customer-facing view

The single mechanism enforcing carrier masking. It omits `carrier_id` and every staff-only column,
so the masked fields never enter a query plan the customer can run, let alone the network payload.

```sql
create view sailings_public
with (security_invoker = on) as
select
  s.id, s.voyage_no,
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
```

`security_invoker = on` makes the view run under the caller's permissions, so it does not become a
back door around `sailings`' RLS. Because customers have no select policy on `sailings`, the view
needs its own grant plus a permissive policy path — the practical shape is either a
`security definer` view with an explicit `grant select on sailings_public to authenticated`, or an
invoker view plus a customer select policy on `sailings` that is *only* reachable through it.
**Pick one at implementation time and verify with test 3 in
[03-schedule-search.md](03-schedule-search.md) — the raw network payload must not contain a carrier.**

### `sailing_history`
Before-image of every changed field, written on update. Feeds change alerts and the audit trail —
and is what a v2 rollback would replay, which is why it is kept in full even though v1 has no
rollback.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `sailing_id` | uuid FK → `sailings` | |
| `upload_batch_id` | uuid FK → `upload_batches` | The batch that caused the change |
| `changed_field` | text | Column name |
| `old_value` / `new_value` | text | Rendered as text; `old_value` null on insert |
| `change_type` | text | `'insert' \| 'update' \| 'remove'` |
| `changed_at` | timestamptz | |

**RLS:** select for admin/staff. Writes come from the Edge Function (service role).

### `upload_batches`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `carrier_id` | uuid FK → `carriers` | Target carrier, chosen by the uploader |
| `storage_path` | text | Path in the private Supabase Storage bucket |
| `original_filename` | text | |
| `uploaded_by` | uuid FK → `profiles` | |
| `uploaded_at` | timestamptz | |
| `status` | text | `'parsing' \| 'awaiting_confirm' \| 'committed' \| 'failed'` |
| `rows_inserted` / `rows_updated` / `rows_removed` | integer | Filled at commit |
| `parsed_payload` | jsonb | Parser output, held between parse and confirm |
| `error_message` | text | On `failed` |

**RLS:** select/insert for admin/staff. No client update policy — a committed batch is an immutable
record, and with no rollback in v1 nothing updates it after commit.

---

## Customer-facing records

### `booking_requests`
Stores a **snapshot** of the sailing, not just a foreign key, so a later carrier-wide replace that
removes the sailing cannot orphan the request.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `sailing_id` | uuid | FK → `sailings` `on delete set null` — reference, not the source of truth |
| `sailing_snapshot` | jsonb | Vessel, voyage, POL, POD, ETD, ETA as shown at submit time |
| `customer_company_id` | uuid FK → `customer_companies` | Set from the submitter's profile, **not** from the form |
| `submitted_by` | uuid FK → `profiles` | |
| `container_type_id` | uuid FK → `container_types` | |
| `container_qty` | integer | |
| `commodity` | text | |
| `gross_weight_kg` | numeric | |
| `cargo_ready_date` | date | |
| `shipper` / `consignee` / `notify_party` | text | |
| `contact_name` / `contact_phone` / `contact_email` | text | |
| `is_dangerous_goods` | boolean | |
| `un_number` / `dg_class` | text | Required when `is_dangerous_goods` |
| `reefer_temp_c` | numeric | |
| `oog_dimensions` | text | Out-of-gauge |
| `remarks` | text | |
| `status` | text | `'new' \| 'in_progress' \| 'closed'` — a flag, not a workflow |
| `created_at` / `updated_at` | timestamptz | |

**RLS:** customer inserts rows where `customer_company_id = app_company()` and selects only
their own company's rows; admin/staff select and update all.

### `saved_searches`

`id` · `user_id` FK → `profiles` · `label` · `pol_id` · `pod_id` · `alerts_enabled` boolean ·
`created_at`

**RLS:** owner-only (`user_id = auth.uid()`) for all operations.

### `settings`
Single-row-per-key configuration: search window length, default POL, date format, timezone, page
size, booking notification recipient.

`key` PK · `value` jsonb · `updated_by` · `updated_at`

**RLS:** select for all authenticated; write admin only.

### `audit_log`

`id` · `actor_id` FK → `profiles` · `action` · `entity_type` · `entity_id` · `before` jsonb ·
`after` jsonb · `created_at`

**RLS:** select admin only. Inserts come from server-side code (service role); no client insert
policy, so the log cannot be forged from the browser.

---

## Relationship summary

```
auth.users ──1:1── profiles ──n:1── customer_companies
                      │
                      ├──< saved_searches
                      └──< booking_requests >── container_types

carriers ──< sailings >── vessels
ports ──< terminals
ports ──< sailings (pol_id, pod_id)
terminals ──< sailings (pol_terminal_id, pod_terminal_id)

upload_batches ──< sailings
upload_batches ──< sailing_history >── sailings

sailings ──(view)── sailings_public   ← the only customer path to schedule data
```
