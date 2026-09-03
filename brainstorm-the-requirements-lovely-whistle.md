# Consolidated Shipping Schedule Dashboard — Requirements Spec

## Context

A freight forwarder / haulage operation currently receives sailing schedules from multiple shipping lines as loose Excel and PDF files. Staff read them individually and answer customer questions by hand. There is no single view of "what sails from POL to POD in the next two weeks", and no self-service for customers.

This project builds a web application that consolidates those carrier files into one searchable schedule, gives internal staff the full operational detail, and gives customers a carrier-masked search plus a booking request form. Greenfield — the working directory is empty.

Commercial constraint driving the design: **customers must not see which carrier a sailing belongs to.** That is a field-level visibility rule, not just a row filter, and it shapes the data access layer.

---

## Scope

### In v1
- Schedule upload + auto-parse (Excel and PDF)
- Consolidated schedule search — staff view and customer view
- Booking request form → email to staff + stored record
- Authentication (admin-created accounts only)
- Three fixed roles: Admin, Staff/Ops, Customer
- Settings: master data, search defaults
- Admin: user management, upload history (read-only), audit log, booking request inbox
- Export to Excel/PDF
- Saved searches / favourite lanes
- Schedule-change alerts

### Deferred to v2
- Per-batch upload rollback (**see Risks** — removed from v1 by the user). `sailing_history` is
  still written on every change, so this can be added later with no schema change
- Mobile-responsive layout (**see Risks** — deliberately excluded by the user)
- Rates/cost, allotment, detention & demurrage free time, agent/contract references
- Full booking module (SI submission, documents, container-level detail)
- Self-registration for customers
- MFA / SSO
- Analytics charts

---

## Roles

Fixed in code. No permission matrix UI.

| Role | Can |
|---|---|
| **Admin** | Everything: user management, settings, upload, audit log, booking inbox, sees carrier |
| **Staff / Ops** | Upload schedules, view all fields including carrier, work booking requests |
| **Customer** | Carrier-masked schedule search, submit booking request, saved searches, export |

Customers belong to a **customer company**. One company has many user logins. Booking requests carry the company automatically.

Account creation is admin-only. No public sign-up. Supabase Auth issues an invite; user sets their own password on first login. Forgot-password flow via Supabase Auth email.

---

## Data model (core entities)

**`carriers`** — shipping lines. Master data.
**`ports`** — UN/LOCODE, name, country. Master data.
**`terminals`** — belongs to a port. Master data.
**`vessels`** — name, optional IMO. Master data.
**`container_types`** — 20GP, 40GP, 40HC, RF, etc. Master data.

**`sailings`** — the core table.
- Identity/matching key: `carrier_id` + `vessel_id` + `voyage_no` + `pol_id`
- Customer-visible: `vessel`, `voyage_no`, `eta_pol_terminal`, `eta_pod_terminal`
- Staff-only: `carrier_id`, `service_loop`, `is_direct`, `transhipment_ports`, `transit_days`
- Cutoffs: `si_cutoff`, `vgm_cutoff`, `cy_cutoff`, `doc_cutoff`
- Terminal/berth: `pol_terminal_id`, `pod_terminal_id`, `etd`, `eta`, `berthing_date`
- Provenance: `upload_batch_id`, `created_at`, `updated_at`

**`upload_batches`** — uploaded file record: carrier, storage path, uploaded_by, uploaded_at, row counts (inserted / updated / removed), status.

**`sailing_history`** — before-image of every changed field, written on update. Feeds change alerts and the audit trail. Kept in full even though v1 has no rollback — it is what a v2 rollback would replay.

**`customer_companies`** — name, contact details. Users link to one.

**`booking_requests`** — snapshot of the selected sailing plus the submitted form. Status is a simple flag; there is no workflow engine in v1.

**`saved_searches`** — user_id, POL, POD, label.

**`audit_log`** — actor, action, entity, before/after, timestamp.

---

## Ingestion pipeline

Staff upload the carrier's **original, unmodified** file. The system does the rest — no template, no re-keying.

1. **Upload** → file lands in Supabase Storage, `upload_batches` row created with the target carrier.
2. **Extract to text** — `.xlsx`/`.xls` read with a spreadsheet library into rows of text. PDF extracted to text. This step is deterministic and free.
3. **AI field mapping** — the extracted *text* (never the raw file) is sent to Claude, which identifies which column/position is vessel, voyage, POL, POD, ETD, each cutoff, etc., and returns structured rows. Sending text rather than files keeps cost low and makes Excel and PDF share one code path.
4. **Match & update** — for each parsed row, match existing sailings on `carrier + vessel + voyage + POL`:
   - match found → update changed fields, write before-image to `sailing_history`
   - no match → insert
   - **existing sailing for that carrier not present in the new file → remove.** The new upload is authoritative for that carrier across all dates.
5. **Confirm dialog** — before commit, show the staff member: *N to insert, N to update, N to remove*. Removal count is the safety net for partial files. With no rollback in v1, this is the **only** control on a bad import.
6. **Publish** — no review gate, no undo. Committed rows are live immediately. A bad upload is corrected by uploading the carrier's correct file again, which replaces that carrier's schedule the same way.
7. **Diff → alerts** — the update set from step 4 drives change-alert emails to users whose saved searches match the affected lanes.

Parsing runs in a **Supabase Edge Function**, next to Storage and the database. Not in a Netlify function — PDF work exceeds Netlify's execution limits.

---

## Screens

### Staff dashboard (landing)
KPI tiles: sailings this week · pending booking requests · last upload per carrier · cutoffs closing within 48h.
Below: consolidated schedule table with full field set, filters, export.

### Customer search
Inputs: **POL**, **POD**, **cargo readiness date**. Window defaults to 2 weeks.
Results columns: **vessel · voyage · ETA POL (terminal) · ETA POD (terminal) · [Booking Request]**.
No carrier column. No cutoffs. No service loop.

### Booking request form
Auto-filled from the selected sailing: vessel, voyage, POL, POD.
Filled by customer:
- **Cargo basics** — container type + quantity, commodity description, gross weight, cargo readiness date
- **Parties** — shipper, consignee, notify party, contact person / phone / email
- **Special handling** — dangerous goods (UN no., class), reefer temperature, out-of-gauge dimensions, remarks

On submit: store a `booking_requests` row **and** email staff. Recipient address is configured in Admin.

### Settings
Master data CRUD (ports, terminals, carriers, vessels, container types) and search defaults (window length, default POL, date format, timezone, page size).

### Admin
User management (create, edit, deactivate, assign role, link to customer company, reset password) · upload history — read-only record with per-batch diff and source-file download · audit log · booking request inbox · booking-email recipient configuration.

---

## Stack

- **Frontend** — Next.js App Router, deployed on Netlify
- **Database + Auth + Storage** — Supabase
- **Parsing** — Supabase Edge Function (Deno), Claude API for the field-mapping step
- **Access control** — Supabase RLS. Customer carrier-masking enforced by a dedicated view that omits carrier and staff-only columns, not by client-side hiding.

---

## Risks and accepted trade-offs

1. **No review gate.** A mis-parsed cutoff reaches users as fact. Mitigation: every sailing row links to its source file so staff can verify on dispute. Accepted by the user.
2. **Carrier-wide replace.** Any upload for a carrier is treated as that carrier's complete schedule. A partial file deletes the remainder. Mitigation: the pre-commit confirm dialog surfaces the removal count. Accepted by the user.
3. **No rollback.** Removed from v1 by the user. A bad upload can only be corrected by uploading the carrier's correct file again — if that file is unavailable, the schedule stays wrong until the carrier resends. Two knock-on effects: the confirm dialog becomes the sole control over risks 1 and 2, and a correcting upload re-fires change alerts with nothing marking them as corrections.
4. **No mobile layout in v1.** Customers on phones get a desktop table. Retrofitting responsive later costs more than building it in. Raised and excluded by the user.
5. **Carrier masking must hold at the data layer.** If the customer view is ever served by the same query as the staff view with columns hidden in the UI, the carrier leaks through the network response. The RLS view is the control, not the component.

---

## Open items

- Expected volume: number of carriers, sailings per month, concurrent users — unknown, assumed small (tens of users, low thousands of sailings)
- Anthropic API key and billing owner for the parsing step
- Whether change alerts go to customers as well as staff, or staff only

---

## Verification

1. **Ingestion** — upload a real carrier .xlsx and a real carrier .pdf. Confirm parsed rows match the source file field-for-field, including every cutoff.
2. **Re-upload** — upload a modified version of the same carrier file with one ETD changed, one sailing added, one removed. Confirm the confirm-dialog counts read 1 update / 1 insert / 1 remove, and that `sailing_history` holds the old ETD.
3. **Carrier masking** — log in as a Customer, run a search, and inspect the raw network response in browser devtools. The carrier field must be absent from the payload, not merely hidden in the DOM.
4. **Roles** — confirm a Customer cannot reach admin or settings routes by typing the URL directly, and that a Staff user cannot reach user management.
5. **Booking request** — submit the form, confirm the email arrives at the configured address and the record appears in the Admin inbox with the correct customer company attached.
6. **Alerts** — save a search, upload a file that changes a matching sailing's date, confirm the alert email fires with the correct before/after values.
7. **Correction** — after a bad upload, upload the carrier's correct file and confirm the schedule table returns to the expected state, with the second batch's confirm dialog showing the counts. Confirm `/admin/uploads` exposes no rollback action for either staff or admin.
