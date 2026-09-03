# 01 — Authentication & Roles

## Purpose

Every other module depends on knowing *who* is asking. This module establishes identity via Supabase
Auth and attaches a role and a customer company to it. The driving constraint is commercial, not
technical: a customer must never see carrier data, so the role has to be readable inside database
policies — not just inside React. Authentication that only guards the UI is decorative here.

There is no public sign-up. Accounts exist because an admin created them.

## Scope

**In v1**
- Supabase Auth email/password login
- Admin-issued invite → user sets their own password on first login
- Forgot-password via Supabase Auth email
- Three fixed roles: Admin, Staff/Ops, Customer
- Customer ↔ customer company linkage (one company, many logins)
- Deactivation (no hard delete of users)
- Route protection in Next.js middleware + RLS enforcement in the database

**Deferred to v2**
- Customer self-registration
- MFA / SSO
- A permission matrix UI — roles are fixed in code, not configurable

## Data & Supabase surface

**Owns:** `profiles`, `customer_companies`.
**Read by everything else** via the `app_role()` and `app_company()` helpers.
Schema: [data-model.md](data-model.md#identity).

### Where the role lives

Role is a column on `profiles`, resolved in policies through a `SECURITY DEFINER` function — not a
JWT custom claim.

Why: a JWT claim is faster (no lookup) but goes stale. Change someone from Staff to Customer and
their existing token keeps staff access until it expires. Given carrier masking is the product's
core commercial promise, a stale elevated token is the wrong failure mode. Deactivation has the same
problem. The lookup costs an index hit on a table of tens of rows.

The function must be `SECURITY DEFINER`, because a policy on `profiles` that queries `profiles`
recurses:

```sql
create function public.app_role() returns text
language sql stable security definer set search_path = public as $$
  select role from profiles where id = auth.uid() and is_active
$$;
```

Note `and is_active` — a deactivated user returns `null`, which fails every role comparison. One
condition, and deactivation is enforced database-wide instead of per-policy.

### Profile creation

`profiles` is populated by a trigger on `auth.users` insert, so an auth user can never exist without
a profile:

```sql
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();
```

`handle_new_user()` reads `role` and `customer_company_id` from the invite's
`raw_user_meta_data` — the admin supplies both when issuing the invite.

### RLS sketch

```sql
alter table profiles enable row level security;

create policy "own profile" on profiles
  for select using (id = auth.uid());

create policy "admin manages profiles" on profiles
  for all using (app_role() = 'admin') with check (app_role() = 'admin');
```

Deliberately absent: any policy letting a user update their own `role` or `customer_company_id`.
Self-service is limited to `full_name` — add a narrow `for update` policy with a
`with check (role = (select role from profiles where id = auth.uid()))` guard if profile editing is
wanted, or leave it admin-only.

### Route protection

Next.js middleware reads the Supabase session and redirects unauthenticated requests to `/login`.
Role-gated segments (`/admin/*`, `/settings/*`, `/upload/*`) check the role from the profile in a
server component and `notFound()` on mismatch.

**This is UX, not security.** The middleware exists so a customer typing `/admin` gets a clean
redirect instead of an empty screen. The actual control is RLS: even if middleware were bypassed
entirely, the admin queries return nothing.

### Auth touchpoints

| Action | API |
|---|---|
| Invite | `supabase.auth.admin.inviteUserByEmail(email, { data: { role, customer_company_id } })` — service role, server-side only |
| Set initial password | `supabase.auth.updateUser({ password })` after the invite link exchange |
| Login | `supabase.auth.signInWithPassword()` |
| Forgot password | `supabase.auth.resetPasswordForEmail()` |
| Admin reset | `supabase.auth.admin.generateLink({ type: 'recovery' })` or re-invite |
| Deactivate | Set `profiles.is_active = false` (do **not** delete the auth user — booking requests and audit rows reference the profile) |

## User experience flow

### Admin — creating a user

1. Entry: `/admin/users` → **New user**.
2. Form: email, full name, role. Selecting **Customer** reveals a required customer-company picker
   (with **+ New company** inline, since a first user for a new customer is the common case).
3. Submit → server route calls `inviteUserByEmail` with role and company in metadata.
4. System response: row appears in the user list with status **Invited**. Toast confirms the address
   the invite went to.
5. End state: the invitee has an email. No password was ever chosen by the admin, and none is
   displayed.
6. **Error state** — address already registered: inline "This email already has an account", with a
   link to that user's row. The invite is not resent silently.

### New user — first login

1. Entry: invite email → **Accept invitation** link.
2. Screen: set-password form (new password, confirm). Email is shown, read-only.
3. Submit → `updateUser({ password })`, session established.
4. System response: redirect by role — Admin/Staff to the staff dashboard, Customer to the search
   screen. A customer never sees the staff dashboard exists.
5. **Error state** — link expired (Supabase invite links are single-use and time-limited):
   "This invitation has expired — ask your administrator to resend it." No self-service resend, as
   that would let anyone with the address trigger mail.

### Any user — returning login

1. Entry: `/login`.
2. Email + password → `signInWithPassword`.
3. Redirect by role, as above.
4. **Error state** — bad credentials: one generic "Incorrect email or password". Do not distinguish
   unknown-email from wrong-password; that difference tells an attacker which addresses are
   registered.
5. **Deactivated account:** login may succeed at the auth layer while `app_role()` returns null,
   so every page renders empty. Check `is_active` immediately post-login and sign the user straight
   back out with "This account has been deactivated."

### Any user — forgot password

1. `/login` → **Forgot password** → email field → `resetPasswordForEmail`.
2. Confirmation is unconditional: "If that address has an account, a reset link is on its way."
   Same reasoning as above.
3. Email link → new-password form → signed in.

### Customer — hitting a staff route

1. Customer types `/admin/users`.
2. Middleware sees `role = 'customer'` → redirect to the customer search with no error detail.
3. If middleware were bypassed, the page's queries return zero rows under RLS. The screen is empty,
   not populated-and-hidden.

## Edge cases & open questions

- **Last admin.** Deactivating or demoting the only remaining admin locks everyone out of user
  management permanently. Block it: count active admins before the write and refuse with "At least
  one active administrator is required."
- **Role change mid-session.** Because the role is read per-query rather than from the JWT, a
  demotion takes effect on the next request — the user's current page may still show stale data
  until navigation, but no privileged data can be *fetched* after the change.
- **Moving a customer between companies.** Changing `customer_company_id` changes which booking
  requests they can see. Existing `booking_requests` rows keep their original company (the column is
  copied at submit time, not joined), which is the correct behaviour — history should not migrate.
- **Email deliverability.** Supabase's default SMTP is rate-limited and unsuitable for production
  invites. Configure a custom SMTP provider before go-live or invites will silently queue.
- **Open:** whether staff can create customer users, or only admins. Spec says user management is
  admin-only; assumed here. Confirm with the user.
