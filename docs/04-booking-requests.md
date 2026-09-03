# 04 — Booking Requests

## Purpose

The only place a customer writes data. From a search result, a customer clicks **Booking Request**,
the sailing details pre-fill, they add cargo and party details, and staff receive an email plus a
record in the admin inbox.

This is deliberately *not* a booking module. There is no SI submission, no container-level detail, no
carrier integration, no status workflow — those are v2. v1 replaces an email-and-phone-call process
with a structured form that arrives with the sailing already attached, so staff stop asking "which
vessel did you mean?".

The one non-obvious design decision: the request stores a **snapshot** of the sailing, not just a
foreign key. Ingestion's carrier-wide replace can delete a sailing at any time
([02-schedule-ingestion.md](02-schedule-ingestion.md)); a request that survives as "vessel: null"
would be worthless.

## Scope

**In v1**
- Form pre-filled from the selected sailing
- Cargo basics, parties, special handling
- Store `booking_requests` row + email staff at a configurable address
- Customer sees their own company's requests and their status
- Admin/staff inbox with a simple status flag

**Deferred to v2**
- Shipping instruction submission and document upload
- Container-level detail (per-container numbers, seals)
- A real workflow engine, approvals, or carrier confirmation
- Editing a submitted request (v1: submit again, staff reconcile)

## Data & Supabase surface

**Owns:** `booking_requests`.
**Reads:** `sailings_public` (customer path — the pre-fill must come from the masked view, or the
carrier arrives in the form's payload), `container_types`, `profiles` for the company,
`settings` for the notification recipient.
Schema: [data-model.md](data-model.md#customer-facing-records).

### Company attaches server-side

`customer_company_id` is set from the submitting user's profile in the server action — **never** from
a form field, hidden input, or client-supplied value. RLS enforces the same thing as a second layer:

```sql
create policy "customer submits own" on booking_requests
  for insert with check (
    app_role() = 'customer'
    and customer_company_id = app_company()
    and submitted_by = auth.uid()
  );

create policy "customer reads own company" on booking_requests
  for select using (
    (app_role() = 'customer' and customer_company_id = app_company())
    or app_role() in ('admin','staff')
  );

create policy "staff updates status" on booking_requests
  for update using (app_role() in ('admin','staff'));
```

Note customers have no `update` or `delete` policy: a submitted request is immutable from the
customer side.

### The snapshot

`sailing_snapshot jsonb` holds vessel name, voyage, POL, POD, ETD, ETA and terminals exactly as the
customer saw them. `sailing_id` is kept as a reference with `on delete set null`, useful while the
sailing still exists, but the snapshot is the record of what was actually requested.

The snapshot is built **server-side from `sailings_public`** using the `sailing_id` the client sent —
not from JSON the client posts. Trusting client-supplied snapshot content would let a customer write
arbitrary text into a record staff act on.

### Email

Sent from an Edge Function after the row commits, to the address in `settings.booking_recipient`. If
mail fails, the row still exists and the inbox still shows it — the record is the source of truth,
the email is the notification. Log the failure; do not fail the customer's submission because SMTP
was down.

## User experience flow

### Customer — submitting

1. Entry: search results ([03-schedule-search.md](03-schedule-search.md)) → **Booking Request** on a
   row.
2. Screen: form with a locked summary header — **vessel · voyage · POL · POD · ETD · ETA**. Read-only.
   No carrier anywhere on the page, including the page title and the eventual confirmation email.
3. **Cargo basics** — container type (dropdown from `container_types`), quantity, commodity
   description, gross weight, cargo readiness date (pre-filled from the search).
4. **Parties** — shipper, consignee, notify party, contact person, phone, email. Contact fields
   pre-fill from the profile; editable, since the booking contact is often not the person logged in.
5. **Special handling** — dangerous goods toggle (revealing required UN number and class), reefer
   temperature, out-of-gauge dimensions, remarks.
6. Submit → validation, then row insert, then email.
7. **Confirmation screen:** reference number, a summary of what was sent, and plain expectation
   setting — "Our team will contact you to confirm. This is a request, not a confirmed booking."
   That sentence matters commercially; a form that looks like a booking creates disputes.
8. End state: the request appears under **My requests** with status **New**.

### Customer — checking status

1. Entry: `/requests`.
2. List of the **company's** requests — not just the individual user's. Colleagues at the same
   company see each other's; that is the intent of company-scoped access.
3. Columns: reference, vessel/voyage, POL → POD, submitted date, status.
4. Detail view shows everything submitted plus the sailing snapshot.
5. No edit, no cancel in v1. To change something, submit again and mention it in remarks.
6. **Empty state:** "You haven't submitted any booking requests yet" + a link to search.

### Staff / Admin — working the inbox

1. Entry: dashboard KPI tile **Pending booking requests**, or `/admin/bookings`.
2. List across all companies: reference, company, vessel/voyage, lane, submitted, status. Default
   filter: status = New.
3. Detail view shows the full submission, the sailing snapshot, **and** — for staff only — the
   carrier of the referenced sailing, since staff need it to act.
4. Status change: New → In progress → Closed. A flag, not a workflow: no required transitions, no
   assignment, no SLA.
5. Contact happens outside the system (phone, email). v1 does not log correspondence.
6. **Empty state:** "No booking requests yet."

### Error states

| Case | Behaviour |
|---|---|
| Dangerous goods on, UN number blank | Inline required-field error; submission blocked |
| Sailing removed between search and submit | Submission still succeeds using the snapshot built at page load; banner on the staff detail view: "The referenced sailing is no longer in the schedule" |
| Email send fails | Row committed, customer sees success, failure logged, inbox unaffected |
| Double submit | Disable the button on submit and de-duplicate on `(submitted_by, sailing_id, created_at within 60s)` — customers double-click |

## Edge cases & open questions

- **Sailing removed mid-form.** Covered by the snapshot. The staff view flags it rather than showing
  a broken reference.
- **Weight and units.** `gross_weight_kg` is kilograms, stated in the field label. Do not accept a
  unit toggle in v1 — a mixed-unit column is a data-quality problem forever.
- **Dangerous goods is a real liability field.** UN number and class must be required when the toggle
  is on, and both must appear prominently in the staff email. Do not simplify this validation away.
- **The email contains customer PII** (contact names, phone numbers, party details) and goes to a
  configurable address. Whoever configures that address in Admin is making a data-handling decision;
  worth a note on the settings screen.
- **No editing** means duplicate requests when a customer changes their mind. Acceptable at the
  assumed volume; revisit if the inbox fills with near-duplicates.
- **Open:** should the customer receive a copy of the confirmation by email? Not in the spec.
  If yes, it must be generated from the masked view like everything else customer-facing.
