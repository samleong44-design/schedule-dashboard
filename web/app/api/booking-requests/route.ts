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
    return NextResponse.json({ error: "UN number and class are required for dangerous goods" }, { status: 400 });
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
      container_type_id: str(body.container_type_id),
      container_qty: num(body.container_qty),
      commodity: str(body.commodity),
      gross_weight_kg: num(body.gross_weight_kg),
      cargo_ready_date: str(body.cargo_ready_date),
      shipper: str(body.shipper),
      consignee: str(body.consignee),
      notify_party: str(body.notify_party),
      contact_name: str(body.contact_name),
      contact_phone: str(body.contact_phone),
      contact_email: str(body.contact_email),
      is_dangerous_goods: Boolean(body.is_dangerous_goods),
      un_number: str(body.un_number),
      dg_class: str(body.dg_class),
      reefer_temp_c: num(body.reefer_temp_c),
      oog_dimensions: str(body.oog_dimensions),
      remarks: str(body.remarks),
    })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  // Email notification to staff: not wired yet (needs an email provider).
  // The admin inbox is the source of truth either way (docs/04).
  return NextResponse.json({ id: created.id });
}
