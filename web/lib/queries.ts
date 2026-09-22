import { createClient } from "@/lib/supabase/server";
import { fmtDate, fmtDateTime, isoDate, within48h, ageOf } from "@/lib/format";

// Server-side reads. All run as the logged-in user — RLS applies.

export type SailingRow = {
  id: string;
  carrier: string;
  vessel: string;
  voyage: string;
  pol: string;
  polName: string;
  pod: string;
  podName: string;
  mode: string;
  etd: string;
  etdIso: string;
  eta: string;
  cyCutoff: string;
  cyCutoffSoon: boolean;
};

export async function getSailings(): Promise<SailingRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("sailings")
    .select(
      "id, voyage_no, mode, etd, eta, cy_cutoff, carriers(name), vessels(name), pol:ports!sailings_pol_id_fkey(unlocode, name), pod:ports!sailings_pod_id_fkey(unlocode, name)",
    )
    .order("etd", { ascending: true });
  if (error) throw error;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data as any[]).map((s) => ({
    id: s.id,
    carrier: s.carriers?.name ?? "—",
    vessel: s.vessels?.name ?? "—",
    voyage: s.voyage_no,
    pol: s.pol?.unlocode ?? "",
    polName: s.pol?.name ?? "",
    pod: s.pod?.unlocode ?? "",
    podName: s.pod?.name ?? "",
    mode: s.mode,
    etd: fmtDate(s.etd),
    etdIso: isoDate(s.etd),
    eta: fmtDate(s.eta),
    cyCutoff: fmtDateTime(s.cy_cutoff),
    cyCutoffSoon: within48h(s.cy_cutoff),
  }));
}

export async function getKpis() {
  const supabase = await createClient();
  const now = new Date();
  const weekOut = new Date(now.getTime() + 7 * 86400e3);

  const [sailingsWeek, pendingReqs, cutoffs, carriers, batches] = await Promise.all([
    supabase
      .from("sailings")
      .select("id", { count: "exact", head: true })
      .gte("etd", now.toISOString())
      .lt("etd", weekOut.toISOString()),
    // No status lifecycle — "recent" means submitted in the last 7 days.
    supabase
      .from("booking_requests")
      .select("id", { count: "exact", head: true })
      .gte("created_at", new Date(now.getTime() - 7 * 86400e3).toISOString()),
    supabase
      .from("sailings")
      .select("id", { count: "exact", head: true })
      .gte("cy_cutoff", now.toISOString())
      .lt("cy_cutoff", new Date(now.getTime() + 48 * 3600e3).toISOString()),
    supabase.from("carriers").select("id, name").eq("is_active", true).order("name"),
    supabase
      .from("upload_batches")
      .select("carrier_id, uploaded_at")
      .eq("status", "committed")
      .order("uploaded_at", { ascending: false }),
  ]);

  const latestByCarrier = new Map<string, string>();
  for (const b of batches.data ?? []) {
    if (!latestByCarrier.has(b.carrier_id)) latestByCarrier.set(b.carrier_id, b.uploaded_at);
  }

  return {
    sailingsThisWeek: sailingsWeek.count ?? 0,
    pendingRequests: pendingReqs.count ?? 0,
    cutoffsClosing: cutoffs.count ?? 0,
    lastUploads: (carriers.data ?? []).map((c) => {
      const at = latestByCarrier.get(c.id);
      return {
        carrier: c.name,
        age: at ? ageOf(at) : "—",
        stale: at ? Date.now() - new Date(at).getTime() > 7 * 86400e3 : true,
      };
    }),
  };
}

export async function getUploadBatches() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("upload_batches")
    .select("id, uploaded_at, original_filename, status, rows_inserted, rows_updated, rows_removed, carriers(name), profiles(full_name, email)")
    .order("uploaded_at", { ascending: false });
  if (error) throw error;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data as any[]).map((b) => ({
    id: b.id,
    uploadedAt: fmtDateTime(b.uploaded_at),
    carrier: b.carriers?.name ?? "—",
    file: b.original_filename ?? "—",
    by: b.profiles?.full_name ?? b.profiles?.email ?? "—",
    inserted: b.rows_inserted ?? 0,
    updated: b.rows_updated ?? 0,
    removed: b.rows_removed ?? 0,
    status: b.status as string,
  }));
}

export async function getBookingRequests() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("booking_requests")
    .select("*, customer_companies(name), sailings(carriers(name))")
    .order("created_at", { ascending: false });
  if (error) throw error;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data as any[]).map((r) => ({
    id: r.id as string,
    ref: `BR-${String(r.id).slice(0, 4).toUpperCase()}`,
    company: r.customer_companies?.name ?? "—",
    vessel: r.sailing_snapshot?.vessel ?? "—",
    voyage: r.sailing_snapshot?.voyage ?? "",
    pol: r.sailing_snapshot?.pol ?? "",
    pod: r.sailing_snapshot?.pod ?? "",
    submitted: fmtDate(r.created_at),
    carrier: r.sailings?.carriers?.name ?? null,
    cargo: [
      Array.isArray(r.containers) && r.containers.length > 0
        ? r.containers.map((l: { qty: number; code: string }) => `${l.qty}×${l.code}`).join(" + ")
        : r.container_qty,
      r.commodity,
      r.hs_code ? `HS ${r.hs_code}` : null,
      r.gross_weight_kg ? `${r.gross_weight_kg} kg` : null,
      r.freight_term ? `Freight ${r.freight_term}` : null,
    ]
      .filter(Boolean)
      .join(" · ") || "—",
    contact: [r.contact_name, r.contact_email].filter(Boolean).join(" · ") || "—",
    dangerousGoods: r.is_dangerous_goods ? { un: r.un_number, cls: r.dg_class } : undefined,
    sailingRemoved: r.sailing_id == null,
  }));
}

export async function getUsers() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, email, role, is_active, can_view_reports, customer_companies(name)")
    .order("created_at");
  if (error) throw error;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data as any[]).map((u) => ({
    id: u.id as string,
    name: u.full_name ?? "—",
    email: u.email as string,
    role: (u.role as string)[0].toUpperCase() + (u.role as string).slice(1),
    company: u.customer_companies?.name as string | undefined,
    status: (u.is_active ? "active" : "deactivated") as "active" | "deactivated" | "invited",
    canViewReports: Boolean(u.can_view_reports),
  }));
}

export async function getAuditLog() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("audit_log")
    .select("id, created_at, action, entity_type, entity_id, before, after, profiles(full_name, email)")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data as any[]).map((e) => ({
    id: e.id as string,
    when: fmtDateTime(e.created_at),
    who: e.profiles?.full_name ?? e.profiles?.email ?? "—",
    action: e.action as string,
    entity: [e.entity_type, e.entity_id].filter(Boolean).join(" · ") || "—",
    before: e.before,
    after: e.after,
  }));
}

export async function getProfile() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("profiles")
    .select("full_name, email, role, customer_company_id, can_view_reports")
    .eq("id", user.id)
    .single();
  return data ? { ...data, id: user.id } : null;
}

// Per-client quarterly summary: bookings + activity within [startIso, endIso).
export async function getClientReport(startIso: string, endIso: string) {
  const supabase = await createClient();
  const [bookings, activity, companies] = await Promise.all([
    supabase
      .from("booking_requests")
      .select("customer_company_id, containers, container_qty, created_at")
      .gte("created_at", startIso)
      .lt("created_at", endIso),
    supabase
      .from("user_activity")
      .select("company_id, day")
      .gte("day", startIso.slice(0, 10))
      .lt("day", endIso.slice(0, 10)),
    supabase.from("customer_companies").select("id, name").order("name"),
  ]);

  type Agg = {
    company: string;
    requests: number;
    containers: number;
    lastSubmitted: string | null;
    activeDays: number;
    lastActive: string | null;
  };
  const byCompany = new Map<string, Agg>();
  const agg = (id: string | null) => {
    const key = id ?? "unknown";
    let a = byCompany.get(key);
    if (!a) {
      const name = (companies.data ?? []).find((c) => c.id === id)?.name ?? "—";
      a = { company: name, requests: 0, containers: 0, lastSubmitted: null, activeDays: 0, lastActive: null };
      byCompany.set(key, a);
    }
    return a;
  };

  for (const b of bookings.data ?? []) {
    const a = agg(b.customer_company_id);
    a.requests += 1;
    a.containers += Array.isArray(b.containers)
      ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (b.containers as any[]).reduce((s, l) => s + (Number(l.qty) || 0), 0)
      : Number(b.container_qty) || 0;
    if (!a.lastSubmitted || b.created_at > a.lastSubmitted) a.lastSubmitted = b.created_at;
  }
  const daysSeen = new Map<string, Set<string>>();
  for (const ev of activity.data ?? []) {
    if (!ev.company_id) continue;
    const a = agg(ev.company_id);
    let set = daysSeen.get(ev.company_id);
    if (!set) daysSeen.set(ev.company_id, (set = new Set()));
    set.add(ev.day);
    if (!a.lastActive || ev.day > a.lastActive) a.lastActive = ev.day;
  }
  for (const [id, set] of daysSeen) agg(id).activeDays = set.size;

  return [...byCompany.values()]
    .map((a) => ({
      ...a,
      lastSubmitted: a.lastSubmitted ? fmtDate(a.lastSubmitted) : "—",
      lastActive: a.lastActive ? fmtDate(a.lastActive) : "—",
    }))
    .sort((x, y) => y.requests - x.requests || y.activeDays - x.activeDays);
}
