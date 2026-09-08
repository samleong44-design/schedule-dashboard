-- Booking form changes: multi-container lines, HS code, freight term.
alter table booking_requests
  add column if not exists hs_code text,
  add column if not exists containers jsonb,
  add column if not exists freight_term text check (freight_term in ('prepaid','collect'));
