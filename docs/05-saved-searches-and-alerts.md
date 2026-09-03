# 05 — Saved Searches & Change Alerts

## Purpose

Schedules move. An ETD slips two days, a cutoff is brought forward, a sailing is withdrawn — and
today nobody finds out until they check. This module lets a user save the lanes they care about and
be emailed when a sailing on one of those lanes changes.

It is the payoff for the work done in ingestion: step 5 of the pipeline already produces an exact
before/after diff, so alerts are a consumer of that output rather than a separate change-detection
system. No polling, no scheduled comparison job, no second source of truth about what changed.

## Scope

**In v1**
- Save a lane (POL + POD) with a label
- Alerts toggle per saved search
- Email alert when a committed upload changes or removes a sailing matching a saved lane
- Before/after values in the alert

**Deferred to v2**
- In-app notification centre
- Alert digests / frequency preferences (v1 sends per upload)
- Alerts on new sailings (v1 alerts on changes and removals only — see open questions)
- Filtering alerts by field (e.g. "only tell me about cutoff changes")

## Data & Supabase surface

**Owns:** `saved_searches`.
**Reads:** the diff set from `commit-schedule`, `sailing_history` for before-values, `profiles` for
recipients.
Schema: [data-model.md](data-model.md#saved_searches).

### RLS sketch

Owner-only, the simplest policy in the system:

```sql
alter table saved_searches enable row level security;

create policy "own saved searches" on saved_searches
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
```

No company sharing in v1 — a saved search belongs to a person, not a company.

### How an alert is produced

1. `commit-schedule` finishes its transaction and returns the diff: updated sailing IDs with changed
   fields, and removed sailing IDs.
2. The alert step selects saved searches where `alerts_enabled` and `(pol_id, pod_id)` match an
   affected sailing's lane.
3. Group by recipient — one email per user per upload batch, listing every affected sailing. Not one
   email per changed row; a carrier upload can change dozens of sailings and thirty emails is not a
   notification, it is a reason to filter the sender.
4. Send via the email Edge Function. Log the send against the batch.

**Runs after commit, never inside the transaction.** Email cannot be rolled back.

### What a customer's alert may contain

Same masking rule as everywhere else: vessel, voyage, lane, and the changed **customer-visible**
fields only. A cutoff change must not be mentioned to a customer, because cutoffs are staff-only —
and neither may the carrier name appear in the subject line, the body, or the sender name.

Practically: build the customer alert from `sailings_public` fields, and pick the recipient template
by role. Two templates, deliberately — the same duplication reasoning as the two query paths in
[03-schedule-search.md](03-schedule-search.md).

## User experience flow

### Customer — saving a lane

1. Entry: `/search`, after running a search.
2. Click **Save this search** → small dialog: label (pre-filled "Port Klang → Jebel Ali"), alerts
   on/off, default on.
3. Save → confirmation toast; the lane appears under **Saved lanes** in the sidebar.
4. Clicking a saved lane re-runs the search with today's date as the readiness date.
5. **Empty state:** "No saved lanes yet — run a search and save it to get change alerts."

### Customer — managing saved lanes

1. Entry: `/saved`.
2. List: label, lane, alerts on/off toggle, delete.
3. Toggling alerts off keeps the lane for quick re-search.
4. Delete is immediate with an undo toast — nothing here is precious enough for a confirm dialog.

### Any user — receiving an alert

1. An upload commits and changes a matching sailing.
2. Email arrives: subject "Schedule change on Port Klang → Jebel Ali".
3. Body: one block per affected sailing —
   - vessel · voyage · lane
   - each changed field as **was → now** (ETD 14 Aug → 16 Aug)
   - removed sailings stated plainly: "No longer in the schedule"
4. Link back to the search for that lane. The link requires login; the email itself carries no
   privileged data beyond what the recipient's role permits.
5. End state: recipient acts, or ignores it.

### Staff — alerts

Staff can save lanes too, and their alerts include the staff-only fields — cutoff changes are the
ones staff most need. Same mechanism, different template.

### Error states

| Case | Behaviour |
|---|---|
| Email provider fails | Log against the batch; the schedule change stands. Do not retry indefinitely — one retry, then log |
| Recipient deactivated between save and send | Skip; `is_active` is checked at send time |
| Saved lane references a deleted port | The lane can no longer match anything. Flag it in the saved list as "Lane unavailable" rather than deleting the user's row |

## Edge cases & open questions

- **Open (from the spec): do change alerts go to customers as well as staff, or staff only?**
  Unresolved. This doc assumes **both**, with role-based content. If the answer is staff-only, the
  customer-facing save-search feature still ships — it stays a convenience shortcut and the
  `alerts_enabled` toggle is hidden for customers. Confirm with the user before building the customer
  template.
- **Alert volume.** Carrier-wide replace means a routine re-upload can touch many rows, and every
  removal-then-reinsert caused by a voyage-number formatting change looks like real churn. Grouping
  per batch per user is the first defence; if it is still noisy, suppress alerts for changes under a
  threshold (e.g. ETD moved by less than 24 hours) — but only with the user's agreement, since a
  small slip can still matter.
- **New sailings.** v1 alerts on changes and removals. "A new sailing appeared on your lane" is
  arguably more useful than any of it, and costs nothing extra since inserts are already in the diff.
  Worth raising with the user.
- **Alert fatigue is a real failure mode.** An alert nobody reads is worse than no alert, because it
  creates false confidence that changes are being surfaced.
- **Lane matching is exact on POL+POD.** A saved Port Klang → Jebel Ali lane does not match a
  Port Klang → Dubai sailing. Intended for v1; port-group matching is a v2 idea.
