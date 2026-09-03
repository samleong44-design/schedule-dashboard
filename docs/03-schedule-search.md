# 03 — Schedule Search & Dashboard

## Purpose

The consolidated view that the whole project exists to produce: one searchable schedule across every
carrier, replacing "open six spreadsheets and read them". Staff get the full operational field set.
Customers get a self-service search that answers "what sails from A to B around my cargo date" —
**without revealing which carrier it is.**

That last clause is the module's defining constraint. Carrier masking is a field-level rule, and the
control is the database view `sailings_public`, not a hidden column in a React table. If the customer
page ever runs the staff query and hides columns client-side, the carrier is sitting in the network
response for anyone who opens devtools.

## Scope

**In v1**
- Staff dashboard: KPI tiles + full schedule table with filters
- Customer search: POL, POD, cargo readiness date, defaulting to a 2-week window
- Export to Excel and PDF, respecting the caller's field visibility
- Sorting, paging, saved-search entry point

**Deferred to v2**
- Mobile-responsive layout — customers on phones get the desktop table (accepted by the user)
- Analytics charts
- Rates, allotment, free time, agent/contract references
- Map or route visualisation

## Data & Supabase surface

**Reads:** `sailings` (staff path), `sailings_public` (customer path), master data for filter
dropdowns, `settings` for defaults, `booking_requests` and `upload_batches` for the KPI tiles.
**Owns:** nothing.
Schema: [data-model.md](data-model.md#schedule).

### Two paths, two queries

```
Staff/Admin  →  select … from sailings          (all columns, RLS: role in admin/staff)
Customer     →  select … from sailings_public   (masked columns only)
```

`sailings_public` omits `carrier_id`, all four cutoffs, `service_loop`, `is_direct`,
`transhipment_ports`, `transit_days`, and `upload_batch_id`. The customer has **no select policy on
`sailings` at all**, so even a hand-crafted PostgREST request against the base table returns nothing.

This is deliberately not "one query with a role check in the select list". A single query is easier
to write and one refactor away from leaking. Two code paths, two components, one shared filter
control — the duplication is the point.

### RLS sketch

```sql
alter table sailings enable row level security;

create policy "staff read sailings" on sailings
  for select using (app_role() in ('admin','staff'));
-- no customer policy on sailings, by design
```

The view is then granted separately to `authenticated`. Verify the exact view/policy combination
against the acceptance test below rather than assuming — the failure is silent and total.

### Customer result columns (exactly these)

**vessel · voyage · ETA POL (terminal) · ETA POD (terminal) · [Booking Request]**

No carrier. No cutoffs. No service loop. No transhipment detail. If a field is not in that list, it
does not appear in the customer payload.

### Staff result columns

Everything: carrier, vessel, voyage, POL/POD + terminals, ETD, ETA, berthing, SI/VGM/CY/DOC cutoffs,
service loop, direct/transhipment, transit days, and a link to the source upload batch.

### Query shape

Filter on `pol_id`, `pod_id`, and an ETD range derived from the cargo readiness date plus the window
length from `settings`. The index `(pol_id, pod_id, etd)` covers it. Page server-side — never fetch
the whole schedule and filter in the browser, which would defeat masking on the customer path.

## User experience flow

### Staff — dashboard landing

1. Entry: login → `/dashboard`.
2. **KPI tiles**, top of page:
   - Sailings this week
   - Pending booking requests → links to the admin inbox
   - Last upload per carrier → a carrier not updated in a while is the tile's real job; show the age,
     and make a stale one visually obvious
   - Cutoffs closing within 48h → links to the filtered table
3. Below: the consolidated schedule table, full field set, default filter = next 2 weeks from today.
4. Filters: carrier (multi-select), POL, POD, date range, direct-only toggle. Applying a filter
   updates the URL so a filtered view can be shared with a colleague.
5. Click a row → detail panel with every field plus **Source: `maersk-wk32.xlsx`, uploaded 12 Aug by
   Ali** and a signed download link. This is the mitigation for having no review gate — always
   reachable in one click.
6. **Export** → Excel or PDF of the current filtered set.
7. **Empty state** — no sailings at all: "No schedules uploaded yet" + an Upload button, rather than
   an empty grid.
8. **Empty state** — filters match nothing: "No sailings from Port Klang to Jebel Ali in this window"
   + a **Clear filters** action.

### Customer — search

1. Entry: login → `/search` (a customer's landing page; the staff dashboard does not exist for them).
2. Screen: three inputs — **POL**, **POD**, **cargo readiness date**. POL may be pre-filled from the
   default in `settings`.
3. Submit → results table: vessel · voyage · ETA POL (terminal) · ETA POD (terminal) · a **Booking
   Request** button per row.
4. Window defaults to 2 weeks from the readiness date; a control extends it.
5. **Save this search** stores the lane — see
   [05-saved-searches-and-alerts.md](05-saved-searches-and-alerts.md).
6. **Export** produces the same masked columns. Exporting must reuse the customer query, not the
   staff one — an export path that queries `sailings` "because it is server-side anyway" reintroduces
   the leak in a file the customer keeps.
7. Click **Booking Request** → [04-booking-requests.md](04-booking-requests.md), sailing pre-filled.
8. **Empty state:** "No sailings found for this lane and date. Try widening the date window, or
   contact us." Never explain *why* there are none — "no carrier covers this lane" is carrier
   information.
9. **Error state:** query failure shows a retry, not a stack trace.

### Customer — attempting the staff view

1. Customer types `/dashboard`.
2. Middleware redirects to `/search`.
3. Bypassing middleware still returns nothing: the queries behind the dashboard read `sailings`, on
   which the customer has no policy.

## Acceptance test for masking

Non-negotiable, and the reason this section exists separately:

1. Log in as a Customer.
2. Run a search that returns rows.
3. Open browser devtools → Network → the schedule request → **Response**.
4. The payload must contain no carrier field, no carrier name, no cutoff, no service loop — **absent
   from the JSON**, not merely unrendered.
5. Repeat for the export download.
6. Repeat by calling the API endpoint directly with the customer's token, outside the app.

Failing any of these means the masking is cosmetic. Treat it as a release blocker.

## Edge cases & open questions

- **Carrier inferable from the data.** Even with the carrier column gone, a distinctive vessel name
  or a unique service pattern can identify the line to anyone in the industry. Full unlinkability is
  not achievable while showing real vessel names — and the spec requires showing them. The rule is
  "no carrier field", not "unattributable sailings"; worth stating to the user so expectations match.
- **Same lane, multiple carriers.** The customer sees several sailings with no way to tell them
  apart beyond vessel and timing. Intended.
- **Timezones.** ETD/ETA are stored `timestamptz` and rendered in the timezone from `settings`.
  Cutoffs are the field where an off-by-one-timezone display becomes an expensive mistake — render
  them with an explicit zone label on the staff view.
- **Deep-linking a filtered search.** Staff URLs carry filters; customer URLs may carry POL/POD/date
  but nothing carrier-derived.
- **Page size** comes from `settings`; default 50. Server-side paging throughout.
- **Open:** whether customers should see transit days (currently staff-only). It is arguably not
  carrier-identifying and is commercially useful. Ask the user.
