# 07 — Admin

## Purpose

The administrator's control surface: who has an account, what has been uploaded, what changed and by
whom, and what customers have asked for. Four screens that exist because the system has no
self-service anywhere — no sign-up, no review gate, no workflow engine. Everything that would
otherwise be automated is a human decision made here.

**There is no rollback in v1.** Ingestion publishes immediately and an upload replaces a carrier's
entire schedule ([02-schedule-ingestion.md](02-schedule-ingestion.md)); the correction for a bad
upload is to upload the correct file again, which replaces the carrier's schedule the same way. The
pre-commit confirm dialog remains the only safety net, which raises its importance rather than
lowering it.

Upload history stays, as a record: what was uploaded, when, by whom, the three counts, the full
diff, and a download link to the original file.

## Scope

**In v1**
- User management: create (invite), edit, deactivate, assign role, link to customer company, reset password
- Upload history — read-only record with per-batch diff and source-file download
- Audit log
- Booking request inbox (shared with staff — see [04-booking-requests.md](04-booking-requests.md))
- Booking-email recipient configuration (also in settings)

**Deferred to v2**
- Per-batch rollback — removed from v1 at the user's request. `sailing_history` still records every
  before-image (it feeds alerts and the audit trail), so rollback can be added later without a
  schema change
- Permission matrix UI — roles are fixed in code
- Analytics and usage reporting
- Bulk user import
- Audit log export

## Data & Supabase surface

**Reads/writes:** `profiles`, `customer_companies`, `upload_batches`, `sailing_history`,
`audit_log`, `booking_requests`, `settings`.
**Owns:** `audit_log`.
Schema: [data-model.md](data-model.md).

Admin actions that create users run **server-side with the service role** —
`supabase.auth.admin.*` is not callable from the browser and the key must never reach it. Those
routes re-check `app_role() = 'admin'` themselves; the service role bypasses RLS, so the
database is not protecting them.

### Audit log

Written server-side on every privileged action: user created / role changed / deactivated, settings
changed, upload committed, master data deleted.

```sql
create policy "admin reads audit" on audit_log
  for select using (app_role() = 'admin');
-- no insert policy: writes come from server code with the service role
```

Omitting a client insert policy is the point — a log the browser can write to is not evidence.

### Upload history

Read-only. `upload_batches` rows are never mutated after commit — the screen selects the batch and
its `sailing_history` rows for the diff, and nothing on it writes.

Batch statuses are therefore: `parsing` · `awaiting_confirm` · `committed` · `failed`. No
`rolled_back`.

**Correcting a bad upload:** upload the correct file for that carrier again. Because an upload is
authoritative for the whole carrier ([02-schedule-ingestion.md](02-schedule-ingestion.md)), the
second upload overwrites the first's effect. The confirm dialog on that second upload shows the
counts, so the correction is itself reviewable.

The consequence to be clear-eyed about: a bad upload cannot be undone without the correct file in
hand. If a carrier's original file is lost, the schedule stays wrong until the carrier resends. That
is the accepted cost of dropping rollback — the confirm dialog moves from "safety net" to "the only
control", and its removal count is the thing staff must actually read.

## User experience flow

### Admin — user management

1. Entry: `/admin/users`.
2. Table: name, email, role, company (customers only), status (Invited / Active / Deactivated), last
   sign-in. Filter by role and status.
3. **New user** → invite flow, detailed in [01-auth-and-roles.md](01-auth-and-roles.md).
4. **Edit** → change name, role, company. Changing a Staff user to Customer requires a company and
   warns that they will lose carrier visibility immediately.
5. **Deactivate** → confirm dialog: "They will be signed out and cannot log in. Their booking
   requests and history are kept." Reversible.
6. **Reset password** → sends a recovery email. The admin never sees or sets a password.
7. **Error state — last admin:** demoting or deactivating the only active admin is refused with "At
   least one active administrator is required."
8. **Empty state:** never empty — the first admin exists by definition.

### Admin / Staff — upload history

1. Entry: `/admin/uploads`. Admin and staff see the same screen — with no rollback there is nothing
   admin-only on it.
2. Table: uploaded at, carrier, filename, uploaded by, status, and the three counts
   (inserted / updated / removed).
3. Row detail: full diff for the batch — every inserted, updated (with before → after) and removed
   sailing, plus a signed download link to the original file.
4. The screen has one action: **download the original file**. Everything else is a record.
5. A staff member who spots a bad upload here goes to `/upload` and re-uploads the correct file for
   that carrier.
6. **Empty state:** "No uploads yet" + an Upload button.

### Admin — audit log

1. Entry: `/admin/audit`.
2. Reverse-chronological: when, who, action, entity, and a before/after diff on expand.
3. Filters: actor, action type, date range.
4. Read-only. No delete, no edit — that is the entire value of the screen.
5. **Empty state:** effectively never; the first admin action populates it.

### Admin / Staff — booking inbox

Covered in [04-booking-requests.md](04-booking-requests.md). Reachable from the dashboard KPI tile
and `/admin/bookings`. Both roles work it; only the recipient-address configuration is admin-only.

### Staff — hitting admin routes

1. Staff types `/admin/users`.
2. Middleware redirects to the dashboard.
3. Bypassed, the queries return nothing — `profiles` has no staff-wide select policy.
4. `/admin/uploads` is the exception staff *do* reach, in full — it carries no admin-only control.

### Customer

No admin routes at all. Redirected to `/search`.

## Edge cases & open questions

- **No undo for a bad upload.** With rollback out of v1, a mis-parsed or partial file can only be
  corrected by uploading a good file for that carrier. Two consequences worth stating: the confirm
  dialog is now the *only* control, and a correction re-triggers change alerts — recipients get a
  second email walking the values back, with no indication it is a correction.
- **`sailing_history` is still written on every change.** It feeds alerts and the audit trail, and it
  is what a future rollback would replay. Do not drop it along with the rollback UI.
- **Deleted users in the audit log.** Users are deactivated, never deleted, so `actor_id` always
  resolves. Do not add hard user deletion without first denormalising the actor's name into
  `audit_log`.
- **Audit log growth.** At the assumed volume this is thousands of rows a year — no retention policy
  needed. If it ever matters, archive rather than delete.
- **Open:** should staff see the full upload history including other staff members' batches?
  Assumed yes here (they need to know when a carrier was last updated, which is also a dashboard KPI
  tile). Confirm with the user.
