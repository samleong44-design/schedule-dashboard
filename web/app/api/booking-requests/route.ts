import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Customer booking submission. Runs under the user's own session — RLS enforces
// role=customer and company scoping. Snapshot built server-side from the MASKED
// view; client-supplied snapshot content is never trusted (docs/04).
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, customer_company_id, is_active")
    .eq("id", user.id)
    .single();
  if (!profile?.is_active || profile.role !== "customer" || !profile.customer_company_id) {
    return NextResponse.json({ error: "Only customer accounts can submit booking requests" }, { status: 403 });
  }

  const body = await request.json();
  if (!body.sailing_id) return NextResponse.json({ error: "sailing_id required" }, { status: 400 });
  if (body.is_dangerous_goods && (!body.un_number || !body.dg_class)) {
    return NextResponse.json({ error: "UN number and IMCO number are required for dangerous goods" }, { status: 400 });
  }
  if (!["prepaid", "collect"].includes(body.freight_term)) {
    return NextResponse.json({ error: "Choose freight prepaid or freight collect" }, { status: 400 });
  }
  const hsDigits = String(body.hs_code ?? "").replace(/\D/g, "");
  if (hsDigits.length < 6) {
    return NextResponse.json({ error: "HS code must have at least 6 digits, e.g. 1234.56" }, { status: 400 });
  }

  // Container lines: [{container_type_id, qty}] — resolve codes server-side so
  // the stored record is readable even if a type is later renamed.
  const rawLines = Array.isArray(body.containers) ? body.containers : [];
  const { data: types } = await supabase.from("container_types").select("id, code");
  const typeCode = new Map((types ?? []).map((t) => [t.id, t.code]));
  const containers = rawLines
    .filter((l: { container_type_id?: string; qty?: number }) =>
      typeCode.has(l.container_type_id ?? "") && Number(l.qty) >= 1)
    .map((l: { container_type_id: string; qty: number }) => ({
      container_type_id: l.container_type_id,
      code: typeCode.get(l.container_type_id),
      qty: Math.floor(Number(l.qty)),
    }));
  if (containers.length === 0) {
    return NextResponse.json({ error: "Add at least one container line" }, { status: 400 });
  }

  const { data: sailing } = await supabase
    .from("sailings_public")
    .select("*")
    .eq("id", body.sailing_id)
    .maybeSingle();

  const snapshot = sailing
    ? {
        vessel: sailing.vessel_name,
        voyage: sailing.voyage_no,
        pol: sailing.pol_name,
        pod: sailing.pod_name,
        mode: sailing.mode,
        etd: sailing.etd,
        eta: sailing.eta,
      }
    : { note: "Sailing was no longer in the schedule at submission time" };

  const num = (v: unknown) => (v === "" || v == null ? null : Number(v));
  const str = (v: unknown) => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);

  const { data: created, error } = await supabase
    .from("booking_requests")
    .insert({
      sailing_id: sailing?.id ?? null,
      sailing_snapshot: snapshot,
      customer_company_id: profile.customer_company_id,
      submitted_by: user.id,
      containers,
      // Legacy single-type columns kept filled from the first line for older views
      container_type_id: containers[0].container_type_id,
      container_qty: containers.reduce((n: number, l: { qty: number }) => n + l.qty, 0),
      commodity: str(body.commodity),
      hs_code: str(body.hs_code),
      freight_term: body.freight_term,
      gross_weight_kg: num(body.gross_weight_kg),
      cargo_ready_date: str(body.cargo_ready_date),
      shipper: str(body.shipper),
      consignee: str(body.consignee),
      contact_name: str(body.contact_name),
      contact_phone: str(body.contact_phone),
      contact_email: str(body.contact_email),
      is_dangerous_goods: Boolean(body.is_dangerous_goods),
      un_number: str(body.un_number),
      dg_class: str(body.dg_class),
      reefer_temp_c: num(body.reefer_temp_c),
      remarks: str(body.remarks),
    })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Notify the team. The DB row is the source of truth — a mail failure never
  // fails the customer's submission (docs/04).
  try {
    await sendBookingEmail({
      ref: `BR-${String(created.id).slice(0, 8).toUpperCase()}`,
      snapshot,
      containers,
      body,
      companyId: profile.customer_company_id,
      supabaseUserEmail: user.email ?? "",
    });
  } catch (e) {
    console.error("Booking notification email failed:", e);
  }

  return NextResponse.json({ id: created.id });
}

// ponytail: recipients hardcoded per YAGO's request; move to settings when they change
const BOOKING_RECIPIENTS = [
  "cs@yago.com.my",
  "kate@yago.com.my",
  "chingwei@yago.com.my",
  "jace@yago.com.my",
];

async function sendBookingEmail(args: {
  ref: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  snapshot: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  containers: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  body: any;
  companyId: string;
  supabaseUserEmail: string;
}) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("RESEND_API_KEY not set — booking email skipped");
    return;
  }
  const { ref, snapshot, containers, body } = args;
  const lines = containers.map((l) => `${l.qty} x ${l.code}`).join(" + ");
  const dg = body.is_dangerous_goods
    ? `\n*** DANGEROUS GOODS: UN ${body.un_number} / IMCO ${body.dg_class} ***\n`
    : "";
  const text = [
    `New booking request ${ref}`,
    ``,
    `Sailing:   ${snapshot.vessel ?? "-"} ${snapshot.voyage ?? ""}`,
    `Route:     ${snapshot.pol ?? "-"} -> ${snapshot.pod ?? "-"}`,
    `ETD:       ${snapshot.etd ?? "-"}`,
    `Containers: ${lines}`,
    `Commodity: ${body.commodity ?? "-"} (HS ${body.hs_code ?? "-"})`,
    `Weight:    ${body.gross_weight_kg ?? "-"} kg`,
    `Freight:   ${body.freight_term}`,
    `Cargo ready: ${body.cargo_ready_date ?? "-"}`,
    dg,
    `Shipper:   ${body.shipper ?? "-"}`,
    `Consignee: ${body.consignee ?? "-"}`,
    `Contact:   ${body.contact_name ?? "-"} / ${body.contact_phone ?? "-"} / ${body.contact_email ?? "-"}`,
    body.remarks ? `Remarks:   ${body.remarks}` : "",
    ``,
    `Reply directly to the customer contact above to proceed.`,
    `Full record: https://yago-schedule.netlify.app/admin/bookings`,
  ].join("\n");

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.BOOKING_FROM ?? "YAGO Schedule <bookings@yago.com.my>",
      to: BOOKING_RECIPIENTS,
      reply_to: body.contact_email || undefined,
      subject: `${body.is_dangerous_goods ? "[DG] " : ""}Booking request ${ref} — ${snapshot.pol ?? ""} to ${snapshot.pod ?? ""}`,
      text,
    }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
}
