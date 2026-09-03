# UI Page Guide

Page-level front-end spec for v1. Every screen, field and state here traces back to a module doc —
this file adds layout, components and copy, it does not define behaviour. **Where this guide and a
module doc disagree, the module doc wins.**

- Behaviour and data rules: [README.md](README.md) → module docs
- Schema: [data-model.md](data-model.md)

---

# Part 1 — Foundations

## Stack

| Layer | Choice |
|---|---|
| Framework | Next.js App Router (Server Components by default) |
| Styling | Tailwind CSS |
| Components | shadcn/ui, generated into `components/ui/*` |
| Icons | lucide-react (ships with shadcn/ui) |
| Forms | `react-hook-form` + `zod`, via shadcn `Form` |
| Tables | shadcn `Table` + TanStack Table for sorting/paging state |
| Dates | `date-fns` with the timezone from `settings` |

Everything is server-rendered unless it needs interactivity. Filters, dialogs, and forms are the
client components; tables render server-side and receive their data as props.

## Design direction

This is an operational tool used all day by staff who read dense tabular data. Optimise for
scan-ability, not impression.

- **Dense over airy.** Table rows `h-10`, `text-sm`, `py-2` cells. Do not use generous marketing
  spacing.
- **One accent colour.** Everything else neutral. Colour carries meaning here (status, urgency) and
  loses that job the moment it is also decoration.
- **No cards around tables.** A table on a page background reads faster than a table inside a card
  inside a container.
- **Numbers right-aligned, tabular figures** (`tabular-nums`) — counts, weights, transit days.

### Tokens

```css
/* globals.css — shadcn/ui theme vars, neutral base + one accent */
--background: 0 0% 100%;
--foreground: 222 47% 11%;
--muted: 210 40% 96%;
--border: 214 32% 91%;
--primary: 217 91% 45%;        /* accent — actions only */
--destructive: 0 72% 51%;
```

Semantic colours, applied via `StatusBadge` (never hand-rolled per page):

| Meaning | Token | Used for |
|---|---|---|
| Neutral / new | `bg-muted text-foreground` | booking `new`, batch `parsing` |
| In progress | `bg-blue-50 text-blue-700` | booking `in_progress`, batch `awaiting_confirm` |
| Success | `bg-emerald-50 text-emerald-700` | batch `committed`, user `active` |
| Warning | `bg-amber-50 text-amber-700` | cutoff <48h, carrier not updated in 7+ days |
| Destructive | `bg-red-50 text-red-700` | batch `failed`, removals, user `deactivated` |

Type scale: `text-2xl` page title · `text-lg` section · `text-sm` body and tables ·
`text-xs text-muted-foreground` labels and metadata.

Spacing: page padding `p-6`, section gap `space-y-6`, form field gap `space-y-4`.

## Three shells

Which shell a route uses is decided by role, in the layout — not by conditional rendering inside a
shared shell. A customer must never receive markup for staff navigation.

### Staff / Admin shell — `app/(staff)/layout.tsx`

```
┌────────────┬──────────────────────────────────────────────────────┐
│            │  Schedule dashboard                        [ Ali ▾ ] │
│  LOGO      ├──────────────────────────────────────────────────────┤
│            │                                                      │
│ Dashboard  │                                                      │
│ Upload     │                  page content                        │
│ Bookings 3 │                                                      │
│ Uploads    │                                                      │
│ ──────     │                                                      │
│ Settings   │                                                      │
│ Admin ▾    │   ← Admin group renders only for role = admin        │
│  Users     │                                                      │
│  Audit log │                                                      │
└────────────┴──────────────────────────────────────────────────────┘
```

Sidebar `w-56`, fixed, `border-r`. Active item `bg-muted font-medium`. Bookings carries a count
`Badge` when requests are `new`. The `Admin ▾` group is absent — not disabled — for staff.

### Customer shell — `app/(customer)/layout.tsx`

```
┌──────────────────────────────────────────────────────────────────┐
│  LOGO      Search   My requests   Saved lanes        [ Siti ▾ ]  │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│                        page content                              │
└──────────────────────────────────────────────────────────────────┘
```

Top nav only, three items. No sidebar. Nothing in this shell hints that upload, settings or admin
exist — a customer should not learn the shape of the internal tool.

### Auth shell — `app/(auth)/layout.tsx`

Centred `max-w-sm` card on a neutral background. No navigation, no user menu, no links except the
one the page needs.

## Shared patterns

Defined once here. Page entries below reference them instead of repeating.

### `DataTable`

Used by pages 4, 8, 11, 12, 15, 16, 17, 18 and every master-data tab.

- Server-side paging. Page size from `settings.page_size` (default 50). **Never** fetch the full set
  and page in the browser — on customer pages that would put unmasked rows in the payload.
- Sortable column headers, sort state in the URL (`?sort=etd&dir=asc`).
- Sticky header (`sticky top-0 bg-background`), `border-b` per row, hover `bg-muted/50`.
- Row click opens the detail (route or `Sheet`), cursor `pointer`. Any button inside a row must
  `stopPropagation`.
- Footer: `Showing 1–50 of 312` + `Pagination`.

### `FilterBar`

Horizontal row of controls above a table. Every filter writes to the URL so a filtered view is
shareable and survives refresh. A **Clear filters** `Button variant="ghost"` appears only when a
filter is active.

### The four states

Every data view specs all four. They are the part most often skipped and most often needed.

| State | Treatment |
|---|---|
| **Loading** | `Skeleton` rows matching the real row height — not a spinner. Table shape stays stable, so the page does not jump when data lands. |
| **Empty** | `EmptyState`: one-line explanation + the primary action that resolves it. Never a bare empty grid. |
| **Error** | Inline `Alert variant="destructive"` with a **Retry** button. Never a stack trace, never a raw Postgres message. |
| **Permission denied** | Two different treatments — see below. |

**Permission denied is not one behaviour:**
- Customer → staff route: silent redirect to `/search`. No explanation, because the existence of the
  route is itself information.
- Staff → admin-only *control*: the control is absent, not disabled-with-tooltip.
- Staff → `/settings/general`: fields render **read-only** with "Only administrators can change
  these". Staff need to know the search window value even though they cannot change it.

### Destructive confirm `Dialog`

For publishing an upload, deactivate-with-consequence, and blocked deletes. The dialog states **the
effect in numbers**, not the action in verbs: "14 to insert · 6 to update · 218 to remove" — not
"Are you sure?". Confirm button `variant="destructive"`, and it is the right-hand button.

Reversible actions (deactivate a vessel, delete a saved lane) get **no dialog** — they get a `Toast`
with **Undo**.

### Toasts

shadcn `Toast`, bottom-right. Success is short and specific ("Invitation sent to
ali@example.com"). Failures that the user must act on are `Alert`s in the page, not toasts — a toast
that disappears is not an error report.

### Forms

`Form` + `zod`. Validate on blur, re-validate on change after the first failed submit. Errors inline
below the field in `text-sm text-destructive`. Submit button shows a spinner and stays disabled
until the request settles — the double-submit guard in
[04-booking-requests.md](04-booking-requests.md) depends on it.

### Dates

All rendering goes through one helper reading `settings.date_format` and `settings.timezone`.
Cutoffs on staff views render with an explicit zone label (`14 Aug 17:00 MYT`) — a cutoff read in
the wrong timezone is an expensive mistake.

## Responsive

**v1 targets ≥1280px.** Mobile layout is a deliberate v2 deferral
([README.md](README.md#accepted-risks)).

The one global rule so phone users get something rather than nothing: every table sits in
`<div class="overflow-x-auto">`. Tables scroll horizontally; they never reflow into cards. Do not
add breakpoint variants beyond this — half-done responsive is worse than honest desktop-only.

## The masking rule, as a UI constraint

[03-schedule-search.md](03-schedule-search.md) enforces carrier masking in the database. The
front-end obligation is to not undo it:

- Customer pages import components that query `sailings_public`. **Never** the staff `ScheduleTable`
  with `columns` filtered.
- No `hidden`, no `display: none`, no `role === 'customer' && ...` on a carrier field. If the code
  needs to hide a carrier, the wrong query is being used.
- Export on a customer page reuses the customer query. A "server-side anyway" shortcut writes the
  carrier into a file the customer keeps.
- Keep it structurally impossible: `components/schedule/staff/` and `components/schedule/customer/`,
  no shared table component between them. The duplication is the safeguard.

---

# Part 2 — Page catalogue

---

## 1. `/login`

**Role:** public · **Module:** [01](01-auth-and-roles.md) · Auth shell

```
        ┌──────────────────────────────────┐
        │            LOGO                  │
        │                                  │
        │   Sign in                        │
        │                                  │
        │   Email                          │
        │   [____________________________] │
        │                                  │
        │   Password                       │
        │   [____________________________] │
        │                                  │
        │   [        Sign in           ]   │
        │                                  │
        │        Forgot password?          │
        └──────────────────────────────────┘
```

| Field | Component | Notes |
|---|---|---|
| Email | `Input type="email"` | autofocus, `autocomplete="username"` |
| Password | `Input type="password"` | `autocomplete="current-password"` |
| Sign in | `Button` full width | Spinner while pending |
| Forgot password | Link → page 3 | `text-sm text-muted-foreground` |

**No "Create account" link.** Accounts are admin-issued; a sign-up link would be a dead end.

**States**
- Loading: button spinner, fields disabled.
- Error (bad credentials): `Alert` — **"Incorrect email or password."** One message for both cases.
  Distinguishing them tells an attacker which addresses are registered.
- Error (deactivated): "This account has been deactivated. Contact your administrator." Signed back
  out immediately.
- Success: redirect by role — admin/staff → `/dashboard`, customer → `/search`.

---

## 2. `/invite` — accept invitation

**Role:** invited user (token) · **Module:** [01](01-auth-and-roles.md) · Auth shell

```
        ┌──────────────────────────────────┐
        │            LOGO                  │
        │                                  │
        │   Welcome — set your password     │
        │                                  │
        │   ali@example.com    (read-only) │
        │                                  │
        │   New password                   │
        │   [____________________________] │
        │   At least 8 characters          │
        │                                  │
        │   Confirm password               │
        │   [____________________________] │
        │                                  │
        │   [   Set password & sign in  ]  │
        └──────────────────────────────────┘
```

Email shown as static text, not a disabled input — it is context, not a field.

**States**
- Error (expired/used link): full-page message — "This invitation has expired. Ask your
  administrator to resend it." No self-service resend button; that would let anyone holding the
  address trigger mail.
- Error (mismatch): inline on the confirm field.
- Success: session established, redirect by role. No intermediate "account created" screen.

---

## 3. `/forgot-password` and `/reset-password`

**Role:** public · **Module:** [01](01-auth-and-roles.md) · Auth shell

```
        ┌──────────────────────────────────┐
        │            LOGO                  │
        │                                  │
        │   Reset your password            │
        │   We'll email you a link.        │
        │                                  │
        │   Email                          │
        │   [____________________________] │
        │                                  │
        │   [     Send reset link      ]   │
        │                                  │
        │        ← Back to sign in         │
        └──────────────────────────────────┘
```

| Field | Component | Notes |
|---|---|---|
| Email | `Input type="email"` | autofocus |
| Send reset link | `Button` full width | Spinner while pending |
| Back to sign in | Link → page 1 | |

**Confirmation is unconditional** and replaces the form entirely:

```
        ┌──────────────────────────────────┐
        │   ✓  Check your email            │
        │                                  │
        │   If that address has an account,│
        │   a reset link is on its way.    │
        │                                  │
        │        ← Back to sign in         │
        └──────────────────────────────────┘
```

Shown whether or not the address exists — same reasoning as the login error. Do not add a "we
couldn't find that email" branch.

`/reset-password`: new password + confirm, identical layout to page 2.

**States**
- Loading: button spinner.
- Success: the confirmation panel above, form removed from the DOM (not just hidden — resubmitting
  is not useful and re-sends mail).
- Error (send failed): `Alert` + Retry. This is the one case that *does* differ from success, since
  it is our failure, not a missing account.
- Error (`/reset-password` expired token): full-page message — "This reset link has expired. Request
  a new one." + link back to `/forgot-password`. Matches page 2's expired state.

---

---

## 4. `/dashboard` — staff landing

**Role:** admin, staff · **Module:** [03](03-schedule-search.md) · Staff shell

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ Dashboard                                              [ Upload schedule ]   │
├──────────────┬──────────────┬───────────────┬───────────────────────────────┤
│ SAILINGS     │ PENDING      │ CUTOFFS <48H  │ LAST UPLOAD                    │
│ THIS WEEK    │ REQUESTS     │               │ Maersk      2h ago             │
│    128       │      3   →   │      7   →    │ ONE         1d ago             │
│              │              │               │ Evergreen   9d ago  ⚠          │
└──────────────┴──────────────┴───────────────┴───────────────────────────────┘
┌──────────────────────────────────────────────────────────────────────────────┐
│ [Carrier ▾] [POL ▾] [POD ▾] [Date range ▾] [ ] Direct only    [Export ▾]     │
├────────┬─────────┬───────┬──────┬──────┬───────┬───────┬───────┬────────────┤
│Carrier │ Vessel  │Voyage │ POL  │ POD  │ ETD   │ ETA   │ SI cut│ CY cut     │
├────────┼─────────┼───────┼──────┼──────┼───────┼───────┼───────┼────────────┤
│Maersk  │MSC ISAB.│ 034E  │MYPKG │AEJEA │14 Aug │28 Aug │12 Aug │13 Aug   ⚠  │
│ONE     │EVER GIVE│ 118W  │MYPKG │NLRTM │15 Aug │02 Sep │13 Aug │14 Aug      │
└────────┴─────────┴───────┴──────┴──────┴───────┴───────┴───────┴────────────┘
                                            Showing 1–50 of 312   [◀ 1 2 3 ▶]
```

### KPI tiles — `KpiTile`, 4-up `grid grid-cols-4 gap-4`

| Tile | Value | Click | Notes |
|---|---|---|---|
| Sailings this week | count | → table filtered to this week | |
| Pending booking requests | count of `status = 'new'` | → `/admin/bookings?status=new` | Zero renders as `—`, not `0`, and is not styled as a warning |
| Cutoffs closing within 48h | count | → table filtered | Amber when > 0 |
| Last upload per carrier | list, one row per carrier | → `/admin/uploads` | **Staleness indicator.** Amber `⚠` at >7 days, red at >14. This is the tile's whole purpose — a carrier nobody has updated is invisible otherwise |

### Schedule table

Full staff field set: carrier · vessel · voyage · POL · POD · POL terminal · POD terminal · ETD ·
ETA · berthing · SI/VGM/CY/DOC cutoffs · service loop · direct · transit days. Terminals, berthing,
service loop and transit days are behind a **Columns ▾** toggle, off by default — 17 columns
unfiltered is unreadable.

Cutoff cells within 48h get amber text + `⚠`. Past cutoffs get `text-muted-foreground line-through`.

Default filter: ETD in the next `settings.search_window_days`. Row click → page 7.

**Export ▾**: Excel / PDF of the current filtered set, full staff columns.

**States**
- Loading: 10 skeleton rows; KPI tiles show skeleton values.
- Empty (no data at all): `EmptyState` — "No schedules uploaded yet" + **Upload schedule**.
- Empty (filters match nothing): "No sailings from Port Klang to Jebel Ali in this window" +
  **Clear filters**.
- Error: `Alert` + Retry, KPI tiles render independently so one failure does not blank the page.

---

## 5. `/upload`

**Role:** admin, staff · **Module:** [02](02-schedule-ingestion.md) · Staff shell

```
┌──────────────────────────────────────────────────────────────┐
│ Upload schedule                                              │
│                                                              │
│ Carrier                                                      │
│ [ Select carrier                                        ▾ ]  │
│ The upload replaces this carrier's entire schedule.          │
│                                                              │
│ ┌──────────────────────────────────────────────────────────┐ │
│ │                                                          │ │
│ │        Drop the carrier's file here, or browse           │ │
│ │        .xlsx  .xls  .pdf   —  up to 20 MB                │ │
│ │                                                          │ │
│ └──────────────────────────────────────────────────────────┘ │
│                                                              │
│ Upload the carrier's original file. No template needed.      │
└──────────────────────────────────────────────────────────────┘
```

Carrier is **first and required**; the dropzone is disabled until it is chosen. Everything
downstream keys off the carrier, and picking it after the file invites picking the wrong one.

The helper line under the carrier select states the replace behaviour at the moment of choosing —
not buried in a tooltip.

### Progress states, in the page (not a modal)

```
  ┌────────────────────────────────────────────────────┐
  │ maersk-wk32.xlsx                                   │
  │ ████████████████████░░░░░░░░  Uploading… 68%       │
  └────────────────────────────────────────────────────┘

  ┌────────────────────────────────────────────────────┐
  │ maersk-wk32.xlsx                                   │
  │ ◐ Reading the schedule…                            │
  │ This takes up to a minute for PDFs.                │
  └────────────────────────────────────────────────────┘
```

**Parse state must survive a refresh.** It lives in `upload_batches.status`, not React state — staff
will refresh. On mount, resume from the batch row.

**States**
- Error (wrong type): rejected client-side before upload, inline.
- Error (scanned PDF): "No readable text found in this PDF. It may be a scanned image — ask the
  carrier for the original."
- Error (unparseable): "Could not identify the schedule columns in this file." + a link to download
  what was uploaded, so staff can look at it.
- Success: the confirm dialog, page 6.

---

## 6. Upload confirm dialog

**Role:** admin, staff · **Module:** [02](02-schedule-ingestion.md) · `Dialog`, `max-w-2xl`

**The most important screen in the application.** Publishing is immediate, an upload replaces the
carrier's whole schedule, and **v1 has no rollback** — so this dialog is the only point where a bad
import is catchable. Once Publish is clicked, the only correction is re-uploading a good file.

```
┌────────────────────────────────────────────────────────────┐
│ Review before publishing                              [✕]  │
│ Maersk · maersk-wk32.xlsx                                  │
│                                                            │
│  ┌──────────┐  ┌──────────┐  ┌────────────────────────┐   │
│  │    14    │  │     6    │  │         218            │   │
│  │  insert  │  │  update  │  │       REMOVE           │   │
│  └──────────┘  └──────────┘  └────────────────────────┘   │
│                                                            │
│  ⚠  218 sailings will be removed from Maersk's schedule.   │
│     If this file only covers part of the schedule, cancel  │
│     and ask the carrier for the full file.                 │
│                                                            │
│  ▾ Removals (218)                                          │
│    MSC ISABELLA 034E   MYPKG → AEJEA   14 Aug              │
│    EVER GIVEN   118W   MYPKG → NLRTM   15 Aug              │
│    …                                            [show all] │
│                                                            │
│  ▸ Updates (6)                                             │
│  ▸ Inserts (14)                                            │
│  ▸ Skipped rows (2)                                        │
│                                                            │
│                            [ Cancel ]  [ Publish ]         │
└────────────────────────────────────────────────────────────┘
```

### Count tiles

Three tiles, **removals last and largest**. Reading order runs to the number that matters.

| Count | Normal | Elevated |
|---|---|---|
| Insert | neutral | — |
| Update | neutral | — |
| **Remove** | neutral when `0` | **`border-destructive bg-red-50 text-destructive`, larger text, when > 0. The removals section auto-expands when removals exceed inserts + updates** — the partial-file signature |

The warning `Alert` appears whenever removals > 0 and names the carrier.

### Sections

- **Removals** — vessel, voyage, lane, ETD. First 10, then **show all**.
- **Updates** — `DiffList`: field, `old → new`, old in `text-muted-foreground line-through`.
- **Inserts** — same columns as removals.
- **Skipped rows** — raw text + reason ("Port 'PORT KELANG (W)' not found in master data") + a link
  to `/settings/ports`. Staff can add the port and re-upload without hunting for the screen.

**Buttons:** `Cancel` (`variant="outline"`) and `Publish` (`variant="default"`, or
`variant="destructive"` when removals are elevated). Publish shows a spinner; the dialog cannot be
dismissed while committing.

**States**
- Zero rows parsed: this dialog **must never render** as `0 / 0 / all-removed`. An empty parse is a
  failure, handled on page 5.
- Commit error: dialog stays open, `Alert` inside it, nothing written.
- Success: dialog closes, redirect to `/admin/uploads`, success toast.

---

## 7. `/schedule/[id]` — sailing detail

**Role:** admin, staff · **Module:** [03](03-schedule-search.md) · `Sheet` from the right, or a page

```
┌──────────────────────────────────────────────────┐
│ MSC ISABELLA · 034E                        [✕]   │
│ Maersk · Asia–Middle East loop AE7               │
├──────────────────────────────────────────────────┤
│ ROUTING                                          │
│ POL   Port Klang (MYPKG) · Westport              │
│ POD   Jebel Ali (AEJEA) · Terminal 2             │
│ Direct · 14 transit days                         │
│                                                  │
│ SCHEDULE                                         │
│ Berthing   13 Aug 2026 08:00 MYT                 │
│ ETD        14 Aug 2026 18:00 MYT                 │
│ ETA        28 Aug 2026 06:00 +04                 │
│                                                  │
│ CUTOFFS                                          │
│ SI    12 Aug 17:00 MYT                           │
│ VGM   12 Aug 17:00 MYT                           │
│ CY    13 Aug 12:00 MYT   ⚠ closes in 31h         │
│ DOC   12 Aug 12:00 MYT                           │
│                                                  │
│ SOURCE                                           │
│ maersk-wk32.xlsx · uploaded 12 Aug by Ali        │
│ [ Download original ]                            │
└──────────────────────────────────────────────────┘
```

**The SOURCE block is the mitigation for having no review gate.** Every sailing is one click from
the file it came from, so a disputed cutoff is settled by opening the carrier's own document. Do not
bury it — it is a top-level section, always visible.

Download uses a short-lived signed Storage URL.

**States**
- Loading: skeleton sections.
- Error (404): "This sailing no longer exists. It may have been removed by a later upload." + link
  to the dashboard. Expected after a carrier-wide replace, not a bug.

---

## 8. `/search` — customer schedule search

**Role:** customer · **Module:** [03](03-schedule-search.md) · Customer shell

```
┌──────────────────────────────────────────────────────────────────────┐
│ Find a sailing                                                       │
│                                                                      │
│  Port of loading      Port of discharge     Cargo ready date         │
│  [ Port Klang     ▾]  [ Select port    ▾]   [ 12 Aug 2026     📅]    │
│                                                                      │
│  Showing sailings within [ 2 weeks ▾ ]          [    Search    ]     │
└──────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────┐
│ Port Klang → Jebel Ali · 12–26 Aug        [ Save lane ] [ Export ▾ ] │
├───────────────┬────────┬──────────────────┬──────────────┬──────────┤
│ Vessel        │ Voyage │ ETA POL terminal │ ETA POD term.│          │
├───────────────┼────────┼──────────────────┼──────────────┼──────────┤
│ MSC ISABELLA  │ 034E   │ 13 Aug 08:00     │ 28 Aug 06:00 │[Request] │
│ EVER GIVEN    │ 118W   │ 14 Aug 10:00     │ 30 Aug 14:00 │[Request] │
└───────────────┴────────┴──────────────────┴──────────────┴──────────┘
                                              Showing 1–12 of 12
```

### Columns — exactly these, and no others

**vessel · voyage · ETA POL (terminal) · ETA POD (terminal) · [Booking Request]**

No carrier. No cutoffs. No service loop. No transhipment. No ETD/ETA beyond the two terminal ETAs.
If a field is not in that list it is not in the payload — see
[the masking rule](#the-masking-rule-as-a-ui-constraint).

| Input | Component | Notes |
|---|---|---|
| POL | `Combobox` from `ports` | Pre-filled from `settings.default_pol_id` |
| POD | `Combobox` from `ports` | Required |
| Cargo ready date | `DatePicker` | Defaults to today |
| Window | `Select` — 1/2/4 weeks | Default from `settings.search_window_days` |

Rows are **not** clickable — there is no customer sailing-detail page. The only action is Request.

**States**
- Loading: skeleton rows.
- Empty (initial): the results area shows "Choose a route and search."
- Empty (no results): **"No sailings found for this lane and date. Try widening the date window, or
  contact us."** Never explain why — "no carrier serves this lane" is carrier information.
- Error: `Alert` + Retry.
- **Export** reuses this page's query. Verify the downloaded file contains no carrier column.

---

## 9. `/booking/new` — booking request form

**Role:** customer · **Module:** [04](04-booking-requests.md) · Customer shell

```
┌──────────────────────────────────────────────────────────────────┐
│ Booking request                                                  │
│ ┌──────────────────────────────────────────────────────────────┐ │
│ │ MSC ISABELLA · 034E                                          │ │
│ │ Port Klang → Jebel Ali    ETA POL 13 Aug · ETA POD 28 Aug    │ │
│ └──────────────────────────────────────────────────────────────┘ │
│                                                                  │
│ CARGO                                                            │
│ Container type [40HC ▾]   Quantity [  2 ]                        │
│ Commodity      [__________________________________________]      │
│ Gross weight   [ 18500 ] kg      Cargo ready [ 12 Aug 📅 ]       │
│                                                                  │
│ PARTIES                                                          │
│ Shipper        [__________________________________________]      │
│ Consignee      [__________________________________________]      │
│ Notify party   [__________________________________________]      │
│ Contact name   [_____________]  Phone [_________________]        │
│ Contact email  [__________________________________________]      │
│                                                                  │
│ SPECIAL HANDLING                                                 │
│ [ ] Dangerous goods                                              │
│ Reefer temp    [ ____ ] °C                                       │
│ Out-of-gauge   [__________________________________________]      │
│ Remarks        [__________________________________________]      │
│                [__________________________________________]      │
│                                                                  │
│                              [ Cancel ]  [ Submit request ]      │
└──────────────────────────────────────────────────────────────────┘
```

The summary header is **read-only** and carries no carrier — not in the header, not the page title,
not the confirmation email.

| Group | Fields | Notes |
|---|---|---|
| Cargo | container type, quantity, commodity, gross weight (kg), cargo ready date | Weight label states **kg**. No unit toggle — a mixed-unit column is a permanent data problem |
| Parties | shipper, consignee, notify party, contact name / phone / email | Contact fields pre-fill from the profile but stay editable; the booking contact is often not the person logged in |
| Special handling | DG toggle → UN number + class, reefer temp, OOG dimensions, remarks | |

**Dangerous goods:** checking the box reveals **UN number** and **class**, both required. This is a
liability field — do not make it optional, and render it prominently in the staff email.

There is no customer-company field. The company attaches server-side from the profile.

**States**
- Validation error: inline; the first invalid field is scrolled to and focused.
- Submit pending: button spinner + disabled (the double-submit guard).
- Error (submit failed): `Alert` above the buttons, form data retained.
- Success: page 10.

---

## 10. `/booking/confirmation`

**Role:** customer · **Module:** [04](04-booking-requests.md) · Customer shell

```
        ┌────────────────────────────────────────────┐
        │  ✓  Request submitted                      │
        │                                            │
        │  Reference   BR-2026-0142                  │
        │  Sailing     MSC ISABELLA · 034E           │
        │  Route       Port Klang → Jebel Ali        │
        │  Containers  2 × 40HC                      │
        │                                            │
        │  Our team will contact you to confirm.     │
        │  This is a request, not a confirmed        │
        │  booking.                                  │
        │                                            │
        │  [ View my requests ]   [ New search ]     │
        └────────────────────────────────────────────┘
```

**That last sentence is required, not decorative.** A form that looks like a booking creates
commercial disputes. Render it as body text, not fine print.

Reference number is `text-lg font-mono` — it is the thing the customer quotes on the phone.

**States**
- Reached without a submission (direct URL, back button after navigating away): redirect to
  `/requests`. Never render a blank confirmation.
- Email-send failure is **not** surfaced here. The record committed, so the customer's request
  succeeded; the failure is logged and the request still appears in the staff inbox
  ([04-booking-requests.md](04-booking-requests.md)).
- Browser back from here must not re-submit the form — replace history rather than push.

---

## 11. `/requests` — customer's requests

**Role:** customer · **Module:** [04](04-booking-requests.md) · Customer shell

```
┌────────────────────────────────────────────────────────────────────┐
│ My requests                              [ Status: All ▾ ]         │
├────────────┬───────────────┬───────────────────┬──────────┬───────┤
│ Reference  │ Sailing       │ Route             │ Submitted│Status │
├────────────┼───────────────┼───────────────────┼──────────┼───────┤
│BR-2026-0142│MSC ISABELLA034E│MYPKG → AEJEA     │ 01 Aug   │ New   │
│BR-2026-0138│EVER GIVEN 118W │MYPKG → NLRTM     │ 28 Jul   │Closed │
└────────────┴───────────────┴───────────────────┴──────────┴───────┘
```

Shows the **whole company's** requests, not just the logged-in user's — colleagues need to see each
other's. Label it "My requests" in nav but state "Requests from {Company}" as the page subtitle so
this is not surprising.

Row click → read-only detail: everything submitted plus the sailing snapshot. **No edit, no cancel**
in v1; the detail view says "To change this request, submit a new one and note the change in
remarks."

**States**
- Empty: "You haven't submitted any booking requests yet." + **Search sailings**.
- Status badge via `StatusBadge`: New / In progress / Closed.

---

## 12. `/saved` — saved lanes

**Role:** customer (and staff) · **Module:** [05](05-saved-searches-and-alerts.md)

```
┌────────────────────────────────────────────────────────────────┐
│ Saved lanes                                                    │
├────────────────────────┬─────────────────┬──────────┬─────────┤
│ Label                  │ Lane            │ Alerts   │         │
├────────────────────────┼─────────────────┼──────────┼─────────┤
│ Klang → Jebel Ali      │ MYPKG → AEJEA   │  [ on ]  │ ⋯       │
│ Klang → Rotterdam      │ MYPKG → NLRTM   │  [ off]  │ ⋯       │
└────────────────────────┴─────────────────┴──────────┴─────────┘
```

Row click re-runs the search with today as the cargo-ready date. Alerts column is an inline
`Switch`, saving immediately. `⋯` menu: rename, delete.

**Delete is immediate with an Undo toast** — no confirm dialog. Nothing here is precious.

**Save lane dialog** (opened from page 8): label pre-filled `"Port Klang → Jebel Ali"`, alerts
toggle default **on**.

**States**
- Empty: "No saved lanes yet — run a search and save it to get change alerts."
- Lane whose port was deactivated: row shows `Badge` "Lane unavailable" and is not clickable. The
  row is kept, not silently deleted — it is the user's data.

---

## 13. `/settings/general`

**Role:** admin (staff read-only) · **Module:** [06](06-settings-and-master-data.md) · Staff shell

```
┌────────────────────────────────────────────────────────────┐
│ Settings   [ General ] [ Ports ] [ Terminals ] [ Carriers ]│
│                        [ Vessels ] [ Container types ]     │
├────────────────────────────────────────────────────────────┤
│ SEARCH DEFAULTS                                            │
│ Search window        [ 14 ] days                           │
│ Default port of load [ Port Klang (MYPKG)        ▾]        │
│ Date format          [ DD MMM YYYY               ▾]        │
│ Timezone             [ Asia/Kuala_Lumpur         ▾]        │
│ Rows per page        [ 50                        ▾]        │
│                                                            │
│ NOTIFICATIONS                                              │
│ Booking requests to  [ ops@company.com                  ]  │
│ ⓘ Booking requests contain customer contact details.       │
│   This address will receive personal data.                 │
│                                                            │
│                                     [ Save changes ]       │
└────────────────────────────────────────────────────────────┘
```

The note under the recipient field is required — configuring that address is a data-handling
decision and the person making it should see that stated.

**Timezone** carries a helper: "Used for displaying dates and for reading dates from uploaded
carrier files."

**States**
- Staff (non-admin): all fields render **read-only** with a banner "Only administrators can change
  these settings." Read-only beats a redirect — staff need to know the window length.
- Success: toast "Settings saved."

---

## 14. `/settings/[entity]` — master data

**Role:** admin, staff · **Module:** [06](06-settings-and-master-data.md) · Staff shell

One layout, five tabs. `Tabs` shared with page 13.

```
┌────────────────────────────────────────────────────────────┐
│ Settings   [General] [ Ports ] [Terminals] [Carriers] …    │
├────────────────────────────────────────────────────────────┤
│ [ Search ports…            ]  [ ] Show inactive  [+ New]   │
├──────────┬───────────────────┬───────────┬────────┬───────┤
│ UN/LOCODE│ Name              │ Country   │ Status │       │
├──────────┼───────────────────┼───────────┼────────┼───────┤
│ MYPKG    │ Port Klang        │ Malaysia  │ Active │ ⋯     │
│ AEJEA    │ Jebel Ali         │ UAE       │ Active │ ⋯     │
└──────────┴───────────────────┴───────────┴────────┴───────┘
```

Inactive rows are hidden until **Show inactive** is checked, then rendered
`text-muted-foreground` with a "Inactive" badge.

### Fields per entity

| Tab | Fields | Notes |
|---|---|---|
| Ports | UN/LOCODE*, name*, country | Code uppercased and trimmed on save; unique |
| Terminals | Port*, name*, code | List **grouped by port** — a flat list of hundreds is unusable |
| Carriers | Name*, SCAC | Staff/admin only, as everywhere |
| Vessels | Name*, IMO | Search prominent; ingestion auto-creates rows here so the list grows on its own |
| Container types | Code*, description | Rarely touched |

`⋯` menu: Edit · Deactivate / Reactivate · Delete.

### Delete — the part that matters

Delete on a **referenced** row must never surface a foreign-key error. It opens a dialog that
explains and offers the right action:

```
┌──────────────────────────────────────────────────┐
│ Can't delete MSC ISABELLA                        │
│                                                  │
│ This vessel is used by 34 sailings.              │
│ Deactivating hides it from new entries and       │
│ keeps existing records intact.                   │
│                                                  │
│              [ Cancel ]  [ Deactivate instead ]  │
└──────────────────────────────────────────────────┘
```

**Deactivate** is the primary button. Delete stays available only for rows with zero references —
in practice, typos caught immediately.

**States**
- Error (duplicate code): inline — "MYPKG already exists" with a link to that row. This is the
  common case and it is usually the user's own earlier entry.
- Empty (ports/terminals before seeding): "No ports yet. Add the ports you ship from and to." +
  **New port**.
- Deactivate/reactivate: no dialog, toast with Undo.

---

## 15. `/admin/users`

**Role:** admin · **Module:** [07](07-admin.md), [01](01-auth-and-roles.md) · Staff shell

```
┌──────────────────────────────────────────────────────────────────────┐
│ Users                     [Role ▾] [Status ▾] [Search…]  [+ New user]│
├──────────────┬──────────────────┬────────┬────────────┬──────┬──────┤
│ Name         │ Email            │ Role   │ Company    │Status│      │
├──────────────┼──────────────────┼────────┼────────────┼──────┼──────┤
│ Ali Rahman   │ ali@co.com       │ Staff  │ —          │Active│ ⋯    │
│ Siti Nur     │ siti@acme.com    │Customer│ ACME Sdn   │Invited│ ⋯   │
│ Lim Wei      │ lim@co.com       │ Admin  │ —          │Active│ ⋯    │
└──────────────┴──────────────────┴────────┴────────────┴──────┴──────┘
```

### New user `Dialog`

```
┌────────────────────────────────────────────┐
│ Invite user                           [✕]  │
│                                            │
│ Email        [__________________________]  │
│ Full name    [__________________________]  │
│ Role         [ Customer              ▾ ]   │
│                                            │
│ Company      [ Select company        ▾ ]   │  ← only when role = Customer
│              + New company                 │
│                                            │
│ An invitation email will be sent. They     │
│ set their own password.                    │
│                                            │
│              [ Cancel ]  [ Send invite ]   │
└────────────────────────────────────────────┘
```

Company field appears only for Customer, and is required. **+ New company** opens a nested dialog —
the first user for a new customer is the common case, and bouncing to another screen loses the form.

No password field anywhere. The admin never sets or sees a password.

`⋯` menu: Edit · Reset password · Deactivate / Reactivate.

**Role change to Customer** warns in the edit dialog: "They will lose access to carrier information
immediately."

**Deactivate dialog:** "They will be signed out and cannot log in. Their booking requests and
history are kept."

**States**
- Error (duplicate email): inline — "This email already has an account" + link to that row. No
  silent re-invite.
- Error (last admin): the Deactivate/demote action is **blocked** with "At least one active
  administrator is required."
- Status badge: Invited (neutral) · Active (success) · Deactivated (destructive).

---

## 16. `/admin/uploads`

**Role:** admin, staff · **Module:** [07](07-admin.md), [02](02-schedule-ingestion.md)

**Read-only record. There is no rollback in v1** — see
[07-admin.md](07-admin.md#upload-history). Nothing on this screen writes.

```
┌────────────────────────────────────────────────────────────────────────┐
│ Upload history                    [Carrier ▾] [Status ▾]  [+ Upload]   │
├────────────┬─────────┬──────────────────┬────────┬─────┬─────┬───┬────┤
│ Uploaded   │ Carrier │ File             │ By     │ +   │ ~   │ − │    │
├────────────┼─────────┼──────────────────┼────────┼─────┼─────┼───┼────┤
│01 Aug 14:22│ Maersk  │maersk-wk32.xlsx  │ Ali    │ 14  │  6  │ 2 │ ⤓  │
│31 Jul 09:10│ ONE     │one-aug.pdf       │ Ali    │120  │  0  │ 0 │ ⤓  │
│30 Jul 16:44│Evergreen│eg-partial.xlsx   │ Siti   │  0  │  3  │218│ ⤓  │
└────────────┴─────────┴──────────────────┴────────┴─────┴─────┴───┴────┘
```

Columns `+ / ~ / −` are inserted / updated / removed, `tabular-nums`. A removal count above a
threshold is `text-destructive` — the same signal as the confirm dialog, now historical.

`⤓` is **download original file** (signed Storage URL). No `⋯` menu — a single action does not need
one.

Row click → batch detail: full `DiffList` of inserts, updates (before → after) and removals, plus
`SourceFileBlock`.

### Correcting a bad upload

The screen offers no undo. When staff spot a bad batch here, the fix is to upload the correct file
for that carrier again — the carrier-wide replace applies to the correction the same way, so the
good file overwrites the bad one, and its own confirm dialog shows the counts.

Say this in the UI rather than leaving staff to work it out. Batch detail carries one line under the
diff:

> To correct this upload, upload the carrier's correct file again. It will replace this carrier's
> schedule. [Upload schedule →]

**States**
- Empty: "No uploads yet" + **Upload schedule**.
- Status badge: parsing · awaiting confirm · committed · failed.
- No permission-denied variant — admin and staff see the identical screen.

---

## 17. `/admin/audit`

**Role:** admin · **Module:** [07](07-admin.md) · Staff shell

```
┌────────────────────────────────────────────────────────────────────┐
│ Audit log            [Actor ▾] [Action ▾] [Date range ▾]           │
├──────────────────┬──────────┬────────────────┬────────────────────┤
│ When             │ Who      │ Action         │ Entity             │
├──────────────────┼──────────┼────────────────┼────────────────────┤
│01 Aug 14:25      │ Lim Wei  │ Role changed   │ User · Siti Nur  ▾ │
│01 Aug 14:22      │ Ali      │ Upload committed│ Batch · Maersk    │
│31 Jul 11:02      │ Lim Wei  │ Settings changed│ booking_recipient │
└──────────────────┴──────────┴────────────────┴────────────────────┘
```

Reverse-chronological. Row expands to a before/after `DiffList`.

**Read-only. No delete, no edit, no bulk actions.** That is the entire value of the screen — do not
add a "clean up" control.

**States**
- Empty: effectively never; the first admin action populates it.
- Long values in before/after are truncated with an expand.

---

## 18. `/admin/bookings` — request inbox

**Role:** admin, staff · **Module:** [04](04-booking-requests.md), [07](07-admin.md)

```
┌──────────────────────────────────────────────────────────────────────┐
│ Booking requests        [Status: New ▾] [Company ▾] [Search…]        │
├────────────┬────────────┬───────────────┬───────────┬──────┬────────┤
│ Reference  │ Company    │ Sailing       │ Route     │ Sub. │ Status │
├────────────┼────────────┼───────────────┼───────────┼──────┼────────┤
│BR-2026-0142│ ACME Sdn   │MSC ISABELLA034E│MYPKG→AEJEA│01 Aug│ New    │
│BR-2026-0141│ Bina Trade │EVER GIVEN 118W │MYPKG→NLRTM│31 Jul│In prog.│
└────────────┴────────────┴───────────────┴───────────┴──────┴────────┘
```

Default filter **Status = New** — the inbox's job is the queue, not the archive.

Row click → detail panel:

```
┌──────────────────────────────────────────────────┐
│ BR-2026-0142 · ACME Sdn Bhd      [ Status: New ▾]│
├──────────────────────────────────────────────────┤
│ SAILING (as shown to the customer)               │
│ MSC ISABELLA · 034E · MYPKG → AEJEA              │
│ Carrier: Maersk            ← staff-only          │
│ ⚠ This sailing is no longer in the schedule      │
│                                                  │
│ CARGO      2 × 40HC · Electronics · 18,500 kg    │
│            Ready 12 Aug                          │
│ PARTIES    Shipper / Consignee / Notify …        │
│ CONTACT    Siti Nur · +60 12-345 6789 · siti@…   │
│                                                  │
│ ⚠ DANGEROUS GOODS  UN1203 · Class 3              │
│                                                  │
│ REMARKS    …                                     │
└──────────────────────────────────────────────────┘
```

**Carrier appears here** — this is a staff screen and staff need it to act. The customer's own view
of the same record (page 11) shows the snapshot without it.

**Dangerous goods renders as a destructive-styled banner**, not an ordinary field row. Same in the
notification email.

The "no longer in the schedule" warning shows when `sailing_id` is null — expected after a
carrier-wide replace, and the reason the snapshot exists.

Status `Select`: New → In progress → Closed. Free transitions; no workflow, no assignment, no SLA.

**States**
- Empty: "No booking requests yet."
- Empty (filtered): "No requests with status New." + Clear filters.

---

# Part 3 — Component inventory

## shadcn/ui components to generate

```bash
npx shadcn@latest add table dialog sheet form input select combobox checkbox switch textarea button badge alert toast skeleton tabs popover calendar dropdown-menu separator pagination
```

| Component | Used by |
|---|---|
| `Table` + `Pagination` | 4, 8, 11, 12, 14, 15, 16, 17, 18 |
| `Dialog` | 6, 14, 15 |
| `Sheet` | 7, 18 |
| `Form` / `Input` / `Textarea` | 1, 2, 3, 9, 13, 14, 15 |
| `Select` / `Combobox` | 4, 5, 8, 9, 13, 14, 18 |
| `Calendar` + `Popover` | 8, 9 |
| `Checkbox` / `Switch` | 4, 9, 12, 14 |
| `Badge` | 4, 11, 12, 14, 15, 16, 18 |
| `Alert` | 1, 5, 6, 13, 18 |
| `Toast` | everywhere |
| `Skeleton` | every data view |
| `Tabs` | 13, 14 |
| `DropdownMenu` | 12, 14, 15 |

## Custom components — build once

| Component | Purpose |
|---|---|
| `KpiTile` | Dashboard tiles: label, value, optional warning state, optional link. Page 4 |
| `StaffScheduleTable` | Staff schedule grid, column toggles, cutoff urgency styling. Page 4 |
| `CustomerScheduleTable` | Masked grid, five columns, fixed. Page 8. **Deliberately not shared with the staff table** |
| `FilterBar` | URL-synced filter row + Clear filters. Pages 4, 8, 15, 16, 17, 18 |
| `DiffList` | `field: old → new`, old struck through. Pages 6, 16, 17 |
| `StatusBadge` | Single mapping from status string → semantic colour. Every status column |
| `EmptyState` | Icon + line + primary action. Every data view |
| `DestructiveConfirmDialog` | Effect-in-numbers confirm. Pages 6, 14, 15 |
| `SourceFileBlock` | Filename, uploader, timestamp, signed download. Pages 7, 16 |

## Directory shape

```
app/
  (auth)/login | invite | forgot-password | reset-password
  (staff)/dashboard | upload | schedule/[id] | settings/* | admin/*
  (customer)/search | booking/new | booking/confirmation | requests | saved
components/
  ui/                  shadcn generated
  schedule/staff/      StaffScheduleTable, column config
  schedule/customer/   CustomerScheduleTable  ← no imports from ../staff
  shared/              KpiTile, FilterBar, DiffList, StatusBadge, EmptyState
```

The `schedule/staff` ↔ `schedule/customer` split is the structural half of the masking rule. Add a
lint rule forbidding imports across that boundary if it ever looks tempting.
