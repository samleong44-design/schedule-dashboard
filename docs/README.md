# Consolidated Shipping Schedule Dashboard — Documentation

Module specs for v1. Source of truth for scope and constraints is
[brainstorm-the-requirements-lovely-whistle.md](../brainstorm-the-requirements-lovely-whistle.md);
these docs expand it into implementable modules.

## What this product is

A freight forwarder receives sailing schedules from many shipping lines as loose Excel and PDF
files. Staff read them by hand and answer customer questions one at a time. This application
consolidates those files into one searchable schedule: staff see everything, customers see a
**carrier-masked** view plus a booking request form.

The commercial constraint that shapes the whole design: **customers must never learn which carrier
a sailing belongs to.** That is field-level visibility, enforced in the database — not a column
hidden in the UI.

## Reading order

1. [data-model.md](data-model.md) — all tables, keys and the customer view in one place
2. [01-auth-and-roles.md](01-auth-and-roles.md) — who can log in, what each role can do
3. [02-schedule-ingestion.md](02-schedule-ingestion.md) — how carrier files become sailings
4. [03-schedule-search.md](03-schedule-search.md) — staff dashboard, customer search, export
5. [04-booking-requests.md](04-booking-requests.md) — the customer's only write path
6. [05-saved-searches-and-alerts.md](05-saved-searches-and-alerts.md) — saved lanes, change alerts
7. [06-settings-and-master-data.md](06-settings-and-master-data.md) — ports, terminals, carriers, defaults
8. [07-admin.md](07-admin.md) — users, upload history, audit log, booking inbox
9. [ui-guide.md](ui-guide.md) — page-by-page front-end spec: shells, wireframes, components, states

Every module doc has the same five sections: **Purpose · Scope · Data & Supabase surface ·
User experience flow · Edge cases & open questions.**

The module docs define *behaviour*; [ui-guide.md](ui-guide.md) defines *screens*. Where the two
disagree, the module doc wins.

## Stack

| Layer | Choice | Notes |
|---|---|---|
| Frontend | Next.js App Router | Deployed on Netlify |
| Database | Supabase Postgres | RLS on every table |
| Auth | Supabase Auth | Admin-issued invites only, no public sign-up |
| File storage | Supabase Storage | Original carrier files, private bucket |
| Parsing | Supabase Edge Function (Deno) | PDF work exceeds Netlify function limits |
| AI field mapping | Claude API | Receives extracted **text** only, never raw files |
| Email | Transactional email provider, called from an Edge Function | Booking notifications and change alerts |

### Environment variables

| Variable | Used by | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Frontend, Edge Functions | Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Frontend | Browser client, always subject to RLS |
| `SUPABASE_SERVICE_ROLE_KEY` | Edge Functions / server routes only | Bypasses RLS — never expose to the browser |
| `ANTHROPIC_API_KEY` | Parsing Edge Function | Field-mapping step |
| `EMAIL_API_KEY` | Email Edge Function | Booking + alert delivery |

## Roles at a glance

| Role | Sees carrier | Uploads | Admin screens | Booking |
|---|---|---|---|---|
| Admin | yes | yes | yes | works the inbox |
| Staff / Ops | yes | yes | no (upload history only) | works the inbox |
| Customer | **no** | no | no | submits requests |

## v1 boundary

**In:** upload + auto-parse, consolidated search (staff + customer), booking requests,
authentication, three fixed roles, settings, admin (users / upload history / audit log /
booking inbox), export to Excel and PDF, saved searches, change alerts.

**Out (v2):** per-batch rollback, mobile-responsive layout, rates and allotment, detention &
demurrage, full booking module, customer self-registration, MFA / SSO, analytics charts.

## Accepted risks

1. **No review gate.** A mis-parsed cutoff reaches users as fact. Mitigation: every sailing links to
   its source file. Accepted by the user.
2. **Carrier-wide replace.** Any upload is treated as that carrier's complete schedule; a partial
   file deletes the remainder. Mitigation: pre-commit confirm dialog shows the removal count.
   Accepted by the user.
3. **No undo for a bad upload.** Rollback is out of v1 at the user's request. The correction is to
   upload the correct file for that carrier, which replaces its schedule again. This makes the
   pre-commit confirm dialog the sole control over risks 1 and 2 — not a secondary one.
   `sailing_history` is still written on every change, so rollback can be added in v2 with no schema
   change.
4. **No mobile layout in v1.** Customers on phones get a desktop table. Raised and excluded by the user.
5. **Masking must hold at the data layer.** If the customer search ever runs the staff query with
   columns hidden client-side, the carrier leaks in the network payload.

## Open items

- Expected volume — carriers, sailings per month, concurrent users. Assumed small: tens of users,
  low thousands of sailings.
- Anthropic API key ownership and billing for the parsing step.
- Whether change alerts go to customers as well as staff, or staff only.
  See [05-saved-searches-and-alerts.md](05-saved-searches-and-alerts.md).
