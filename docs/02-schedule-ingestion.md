# 02 — Schedule Ingestion

## Purpose

Turns a shipping line's original, unmodified schedule file into rows in `sailings`. Staff upload
exactly what the carrier sent — no template, no re-keying, no "please save as CSV first". Every
carrier formats differently and changes format without notice, which is why the field mapping is
done by an AI step rather than a per-carrier parser that breaks on the next revision.

This is the module where the product's accepted risks live: there is **no review gate** (parsed rows
go live immediately), **an upload replaces that carrier's entire schedule**, and **there is no
rollback** ([07-admin.md](07-admin.md)). All three were raised with the user and accepted.

The pre-commit confirm dialog is therefore not one control among several — it is the only thing
standing between a partial file and a wiped carrier. After Publish, the only correction is uploading
a good file for that carrier, which replaces the schedule again.

## Scope

**In v1**
- Upload `.xlsx`, `.xls`, `.pdf` to Supabase Storage
- Deterministic text extraction, then AI field mapping via the Claude API
- Match / insert / update / remove against the existing schedule for that carrier
- Pre-commit confirm dialog with the three counts
- Before-images written to `sailing_history`
- Diff output handed to the alerts module
- Provenance: every sailing links back to its source file

**Deferred to v2**
- Review/approval gate before publish
- Scheduled or emailed auto-ingest (staff upload manually)
- Per-carrier saved mapping profiles
- Multi-carrier files (one file, one carrier)

## Data & Supabase surface

**Owns:** `upload_batches`, `sailing_history`. **Writes:** `sailings`.
**Reads:** `carriers`, `ports`, `terminals`, `vessels` for resolving names to IDs.
Schema: [data-model.md](data-model.md#schedule).

### Storage

Private bucket `carrier-schedules`, path `{carrier_id}/{batch_id}/{original_filename}`. No public
URLs — staff download through a short-lived signed URL. Customers have no access; the bucket has no
customer-facing policy at all.

### Edge Function

Parsing runs in a Supabase Edge Function (Deno), not a Netlify function. PDF text extraction plus an
LLM round trip exceeds Netlify's execution limit, and the function sits next to Storage and the
database so the file never crosses the public internet twice.

Two functions, split at the confirm dialog:

| Function | Trigger | Does |
|---|---|---|
| `parse-schedule` | Called after upload | Extract text → Claude → normalise → compute diff → store in `upload_batches.parsed_payload`, status `awaiting_confirm` |
| `commit-schedule` | Called on staff confirm | Apply insert/update/remove in one transaction, write history, set status `committed`, return the diff for alerts |

Splitting them is what makes the confirm dialog possible: nothing touches `sailings` until a human
has seen the counts.

Both run with the service role and must therefore do their own authorisation — verify the caller's
JWT and that `app_role() in ('admin','staff')` as the first thing they do. Service role bypasses
RLS; that protection is gone inside these functions.

### RLS sketch

```sql
create policy "staff read batches" on upload_batches
  for select using (app_role() in ('admin','staff'));

create policy "staff create batches" on upload_batches
  for insert with check (app_role() in ('admin','staff') and uploaded_by = auth.uid());

create policy "admin rolls back" on upload_batches
  for update using (app_role() = 'admin');
```

`sailings` is staff/admin-only for all operations; customers reach schedule data only through
`sailings_public`. See [03-schedule-search.md](03-schedule-search.md).

## Pipeline

### 1. Upload
File → Storage. `upload_batches` row created with `carrier_id`, `storage_path`, `uploaded_by`,
status `parsing`.

### 2. Extract to text
`.xlsx`/`.xls` read with a spreadsheet library into rows of text; PDF extracted to text. Deterministic
and free — no AI involved. If extraction yields no text (a scanned-image PDF), fail here with a clear
message rather than sending an empty prompt to Claude.

### 3. AI field mapping
The extracted **text** goes to Claude — never the raw file. Two reasons: cost (text is a fraction of
the tokens of an encoded document) and uniformity (Excel and PDF converge on one code path after
extraction).

Claude is asked to return structured rows: vessel, voyage, POL, POD, terminals, ETD, ETA, berthing
date, each cutoff, service loop, direct/transhipment, transit days. Request strict JSON and validate
it against a schema on return — a malformed response is a parse failure, not a partial import.

Long files must be chunked to stay inside the context window; chunk on row boundaries and merge
results.

### 4. Normalise
Resolve names to IDs against master data: vessel name → `vessels`, port name or UN/LOCODE → `ports`,
terminal → `terminals`. Unknown vessels are **created automatically** (carriers add ships
constantly); unknown *ports* are **not** — a port that does not exist in master data is more likely
a parse error than a genuinely new port, and silently creating it corrupts search. Unresolved ports
are reported in the confirm dialog as skipped rows with their raw text.

Dates parse against the carrier's format with the project timezone from `settings`. Ambiguous
`03/04/2026` values are the classic failure here — log the assumed format in the batch record so a
dispute can be traced.

### 5. Match & diff
For each parsed row, match on `carrier_id + vessel_id + voyage_no + pol_id`:

- **match found** → compare field by field; changed fields become an update
- **no match** → insert
- **existing sailing for this carrier not in the new file** → remove

The last rule is the carrier-wide replace. The new upload is authoritative for that carrier across
**all dates**, not just the dates present in the file.

### 6. Confirm dialog
Before anything is written: *N to insert · N to update · N to remove*, plus skipped rows. Removals
are expandable — the staff member can see exactly which sailings would disappear. This is the safety
net for a partial file, and the reason removals are counted separately rather than folded into a
single "changes" number.

### 7. Commit
One transaction: insert, update, delete, and write `sailing_history` before-images for every changed
and removed row. If any step fails, the whole batch rolls back and status becomes `failed` — a
half-applied schedule is worse than no upload.

### 8. Diff → alerts
The update and removal sets are handed to
[05-saved-searches-and-alerts.md](05-saved-searches-and-alerts.md), which matches affected lanes
against saved searches and sends mail. Alert sending happens **after** the transaction commits — an
email cannot be un-sent if the transaction later aborts.

## User experience flow

### Staff — normal upload

1. Entry: staff dashboard → **Upload schedule**, or `/upload`.
2. Screen: carrier picker (required, first field — everything downstream keys off it) and a
   drag-drop file area accepting `.xlsx`, `.xls`, `.pdf`.
3. Drop file → immediate client-side checks: extension, size cap. Upload begins with a progress bar.
4. On upload complete: status changes to **Parsing…** with a spinner and an honest note that PDFs
   take longer. Parsing is 10–60 seconds; the page must survive a refresh (state lives in
   `upload_batches`, not React), because staff will refresh.
5. Parse completes → **confirm dialog**:
   - "Maersk schedule — 14 to insert · 6 to update · 2 to remove"
   - Updates expandable: field, old value → new value
   - Removals expandable and listed in full
   - Skipped rows listed with the reason and the raw text
6. Staff clicks **Publish**. Commit runs, status → `committed`.
7. End state: redirect to upload history with a success row. Changes are live immediately — there is
   no review queue and no undo.
8. Staff clicks **Cancel** instead: batch status → `failed` (cancelled), file stays in Storage,
   `sailings` untouched.

### Staff — the dangerous case: partial file

1. A carrier sends a file covering only next week.
2. Steps 1–4 as above.
3. Confirm dialog reads **"0 to insert · 3 to update · 218 to remove"**.
4. The removal count is the signal. The dialog should make a large removal count visually loud —
   this is the one moment the accepted carrier-wide-replace risk is catchable.
5. Staff cancels, asks the carrier for the full schedule.

### Staff — failure states

| Failure | Message |
|---|---|
| Unsupported file type | Rejected client-side before upload |
| Scanned PDF, no text layer | "No readable text found in this PDF. It may be a scanned image — ask the carrier for the original." |
| Claude returns unusable output | "Could not identify the schedule columns in this file." Batch → `failed`, file retained for inspection |
| Zero rows parsed | Treated as a parse failure, **never** as "remove everything". Guard this explicitly — an empty parse must not be allowed to reach the confirm dialog as 0/0/all-removed |
| Network drop mid-parse | Batch stays `parsing`; a stale-batch sweep marks batches older than 15 minutes as `failed` |

### Staff — empty state

First-ever upload for a carrier: everything is an insert, removals are zero. The dialog reads
"120 to insert" and publishing is uneventful. Worth stating because it is the one time a large count
is *not* a warning sign.

### Customer

No entry point. Customers cannot see that ingestion exists.

## Edge cases & open questions

- **Zero-row parse must never mean "delete all".** Called out above; the single most destructive
  possible bug in this system.
- **Two staff uploading the same carrier at once.** The second commit would compute its diff against
  pre-first-commit state. Take an advisory lock per carrier for the duration of parse+commit, or
  refuse a new batch while one is `awaiting_confirm` for that carrier. Refusing is simpler and
  matches how staff actually work.
  <!-- ponytail: refuse concurrent batch per carrier; advisory lock if uploads ever get automated -->
- **Stale `awaiting_confirm` batches.** A staff member who parses and walks away leaves the carrier
  blocked. Expire `awaiting_confirm` after some hours and mark it failed.
- **Voyage number formatting.** `001E` vs `1E` vs `001 E` from the same carrier across weeks breaks
  the matching key and turns updates into insert+remove pairs. Normalise voyage numbers (trim,
  uppercase, strip inner spaces) before matching, and note the rule in the batch record.
- **Vessel auto-create pollution.** Every misspelling becomes a new vessel row. Acceptable in v1;
  admin can merge from settings. Watch whether it grows.
- **Cost.** One Claude call per upload, text-only. At the assumed volume (a handful of carriers,
  weekly) this is negligible, but it is an ongoing spend — see the open item on API key ownership in
  the [README](README.md#open-items).
- **No review gate** is an accepted risk. Mitigation is provenance: every sailing row links to
  `upload_batches.storage_path`, so on dispute a staff member opens the original file and checks.
