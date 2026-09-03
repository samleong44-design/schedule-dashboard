# 06 — Settings & Master Data

## Purpose

Master data is the vocabulary the rest of the system matches against. Ingestion resolves the text
"PORT KELANG (WEST)" from a carrier file into a `ports` row; search filters are built from these
tables; the booking form's container-type dropdown comes from here. Get master data wrong and
ingestion silently skips rows.

Settings are the handful of values that would otherwise be hardcoded: search window length, default
POL, date format, timezone, page size, and the booking notification address.

Neither is exciting. Both are load-bearing, which is why deletion behaviour gets more attention here
than CRUD screens normally deserve.

## Scope

**In v1**
- CRUD for `ports`, `terminals`, `carriers`, `vessels`, `container_types`
- Deactivate rather than delete when referenced
- Search defaults: window length, default POL, date format, timezone, page size
- Booking notification recipient (also reachable from Admin)

**Deferred to v2**
- Bulk import of master data (UN/LOCODE list import)
- Vessel merge tooling
- Per-user preferences — v1 settings are global
- Carrier-specific parsing profiles

## Data & Supabase surface

**Owns:** `ports`, `terminals`, `carriers`, `vessels`, `container_types`, `settings`.
**Referenced by:** `sailings` (all of them), `booking_requests` (container types), `saved_searches`
(ports).
Schema: [data-model.md](data-model.md#master-data).

### Read access

Every authenticated user can select ports, terminals, vessels and container types — a customer needs
them to populate search dropdowns and the booking form.

`carriers` is the exception: **staff/admin select only**. Nothing customer-facing needs the carrier
list, and shipping the full list of lines the forwarder works with to the browser undercuts the
masking rule even though no individual sailing is attributed.

```sql
create policy "read ports" on ports
  for select using (auth.role() = 'authenticated');

create policy "staff writes ports" on ports
  for all using (app_role() in ('admin','staff'))
  with check (app_role() in ('admin','staff'));

create policy "staff reads carriers" on carriers
  for select using (app_role() in ('admin','staff'));
```

### Deletion: the part that matters

Master data referenced by a sailing must not vanish. Foreign keys are declared **`on delete
restrict`** — the database refuses, and the UI turns that refusal into a sensible message rather than
an error toast.

| Table | On delete attempt while referenced |
|---|---|
| `ports` | Restrict. Referenced by `sailings.pol_id/pod_id`, `terminals.port_id`, `saved_searches` |
| `terminals` | Restrict. Referenced by `sailings` terminal columns |
| `carriers` | Restrict. Referenced by `sailings`, `upload_batches` |
| `vessels` | Restrict. Referenced by `sailings` |
| `container_types` | Restrict. Referenced by `booking_requests` — including historical ones |

The user-facing answer is always **deactivate**, not delete. `is_active = false` removes the row from
pickers and new-record dropdowns while leaving every existing reference intact. Hard delete stays
available only for rows with zero references, which in practice means typos caught immediately.

This is the one place where "just cascade" would be a genuine data-loss bug: cascading a port
deletion would silently delete sailings and orphan booking history.

### Settings shape

Key-value with `jsonb` values, one row per key:

| Key | Type | Default | Used by |
|---|---|---|---|
| `search_window_days` | number | 14 | [03](03-schedule-search.md) |
| `default_pol_id` | uuid | null | Customer search pre-fill |
| `date_format` | string | `DD MMM YYYY` | All display |
| `timezone` | string | `Asia/Kuala_Lumpur` | All display, and ingestion date parsing |
| `page_size` | number | 50 | Tables |
| `booking_recipient` | string (email) | — | [04](04-booking-requests.md) |

Read by everyone, written by admin only. Cache them per request; they change monthly at most.

`timezone` is not cosmetic — it is used when ingestion parses a carrier's date strings. Changing it
after data exists does not retroactively re-interpret stored timestamps, only their display.

## User experience flow

### Admin / Staff — adding a port

1. Entry: `/settings/ports`.
2. Table: UN/LOCODE, name, country, active. Search box, since this list grows.
3. **New port** → UN/LOCODE (required, unique, uppercase-normalised), name, country.
4. Save → appears in the list and immediately in every POL/POD dropdown.
5. **Error state** — duplicate UN/LOCODE: inline "MYPKG already exists" with a link to the existing
   row. This is the common case, and it is usually the user's own earlier entry.

### Admin / Staff — adding a terminal

1. `/settings/terminals` → **New terminal** → parent port (required), name, optional code.
2. Terminals are listed grouped by port; a flat list of hundreds of terminal names is unusable.

### Admin / Staff — deactivating a vessel

1. `/settings/vessels`, find the row.
2. Click **Deactivate**. No confirmation dialog — it is reversible.
3. Result: hidden from pickers; existing sailings unaffected and still display the name.
4. Clicking **Delete** on a referenced vessel: dialog explains "This vessel is used by 34 sailings and
   cannot be deleted. Deactivate it instead?" with Deactivate as the primary action. Never surface
   the raw foreign-key violation.

### Admin — search defaults

1. `/settings/general`.
2. Form: search window (days), default POL, date format, timezone, page size, booking recipient.
3. Save → applies globally on next page load.
4. The booking recipient field carries a note: submitted requests contain customer contact details,
   so this address receives personal data.
5. **Permission-denied state:** staff reaching `/settings/general` see the values read-only with
   "Only administrators can change these" — read-only is more useful than a redirect, because staff
   need to know what the window length is.

### Staff — vessels created by ingestion

1. Ingestion auto-creates unknown vessels ([02](02-schedule-ingestion.md)).
2. These appear in the vessel list like any other row.
3. Near-duplicates from carrier misspellings ("MSC ISABELLA" / "MSC ISABELLA V") accumulate here.
   v1 answer: deactivate the wrong one. It stays attached to any sailing that already used it — a
   known cosmetic wart, and the reason vessel merge is on the v2 list.

### Customer

No access to settings. Master data reaches them only as dropdown options in search and the booking
form, and never includes carriers.

## Edge cases & open questions

- **Auto-created vessels are the main data-quality drift.** Everything else here is human-entered and
  low volume; vessels are machine-generated and unbounded. Watch the count.
- **Renaming a port** changes it everywhere retroactively, including historical booking snapshots
  that stored the name as text. Booking snapshots keep their original text by design — that is
  correct, and will look inconsistent. Expected.
- **UN/LOCODE normalisation.** Uppercase and trim on write, or ingestion matching fails on
  whitespace nobody can see.
- **Unresolved ports during ingestion** show up as skipped rows. The fix is adding the port here and
  re-uploading — worth linking the two screens so a staff member can act without hunting.
- **No bulk import in v1.** Seeding the ports actually used (tens, not thousands) is a one-off manual
  task. Full UN/LOCODE import is v2 and mostly noise.
- **Open:** should staff be able to edit master data, or admin only? Assumed staff-editable here,
  since staff hit missing ports during upload and blocking them on an admin stalls ingestion.
  Confirm with the user.
