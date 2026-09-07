import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { extractToText } from "@/lib/parse/extract";
import { mapFieldsWithClaude, type ParsedRow } from "@/lib/parse/claude";

export const maxDuration = 120; // honored where the platform supports it

// Normalise voyage numbers so "001 E" / "001e" match "001E" (docs/02 edge case).
const normVoyage = (v: string) => v.toUpperCase().replace(/\s+/g, "").trim();

// cy_cutoff business rule: ETD minus 1 day at 10:00 Malaysia time.
function defaultCyCutoff(etdIso: string): string {
  const d = new Date(`${etdIso}T00:00:00+08:00`);
  d.setUTCDate(d.getUTCDate() - 1);
  const y = d.toISOString().slice(0, 10);
  return `${y}T10:00:00+08:00`;
}

export async function POST(request: Request) {
  // Auth: service role bypasses RLS, so verify the caller ourselves.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, is_active")
    .eq("id", user.id)
    .single();
  if (!profile?.is_active || !["admin", "staff"].includes(profile.role)) {
    return NextResponse.json({ error: "Not permitted" }, { status: 403 });
  }

  const form = await request.formData();
  const file = form.get("file") as File | null;
  const carrierId = form.get("carrier_id") as string | null;
  const mode = form.get("mode") as string | null;
  if (!file || !carrierId || !mode) {
    return NextResponse.json({ error: "file, carrier_id and mode are required" }, { status: 400 });
  }
  if (file.size > 20 * 1024 * 1024) {
    return NextResponse.json({ error: "File exceeds 20 MB" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: carrier } = await admin.from("carriers").select("id, name").eq("id", carrierId).single();
  if (!carrier) return NextResponse.json({ error: "Unknown carrier" }, { status: 400 });

  // One batch at a time per carrier (docs/02: refuse concurrent batches).
  const { count: pending } = await admin
    .from("upload_batches")
    .select("id", { count: "exact", head: true })
    .eq("carrier_id", carrierId)
    .in("status", ["parsing", "awaiting_confirm"]);
  if ((pending ?? 0) > 0) {
    return NextResponse.json(
      { error: "Another upload for this carrier is still in progress. Finish or cancel it first." },
      { status: 409 },
    );
  }

  // 1. Store the original file + create the batch record.
  const buffer = Buffer.from(await file.arrayBuffer());
  const { data: batch, error: batchErr } = await admin
    .from("upload_batches")
    .insert({
      carrier_id: carrierId,
      mode,
      original_filename: file.name,
      uploaded_by: user.id,
      status: "parsing",
    })
    .select("id")
    .single();
  if (batchErr) return NextResponse.json({ error: batchErr.message }, { status: 500 });

  const storagePath = `${carrierId}/${batch.id}/${file.name}`;
  const { error: storageErr } = await admin.storage
    .from("carrier-schedules")
    .upload(storagePath, buffer, { contentType: file.type || "application/octet-stream" });
  if (!storageErr) {
    await admin.from("upload_batches").update({ storage_path: storagePath }).eq("id", batch.id);
  }

  const fail = async (message: string, status = 422) => {
    await admin.from("upload_batches").update({ status: "failed", error_message: message }).eq("id", batch.id);
    return NextResponse.json({ error: message, batch_id: batch.id }, { status });
  };

  try {
    // 2. Deterministic text extraction.
    const text = await extractToText(buffer, file.name);
    if (text.replace(/\s/g, "").length < 40) {
      return await fail(
        "No readable text found in this file. It may be a scanned image — ask the carrier for the original.",
      );
    }

    // 3. AI field mapping (text only — never the raw file).
    const { rows, notes } = await mapFieldsWithClaude(text, carrier.name);
    // Zero rows is a parse FAILURE, never "remove everything" (docs/02).
    if (rows.length === 0) {
      return await fail("Could not identify any sailings in this file.");
    }

    // 4. Normalise: resolve ports, auto-create unknown vessels.
    const [{ data: ports }, { data: vessels }, { data: existing }] = await Promise.all([
      admin.from("ports").select("id, unlocode, name"),
      admin.from("vessels").select("id, name"),
      admin
        .from("sailings")
        .select("id, voyage_no, vessels(name), pol:ports!sailings_pol_id_fkey(unlocode)")
        .eq("carrier_id", carrierId),
    ]);

    const portByKey = new Map<string, string>();
    for (const p of ports ?? []) {
      portByKey.set(p.unlocode.toUpperCase(), p.id);
      portByKey.set(p.name.toUpperCase(), p.id);
    }
    const vesselByName = new Map((vessels ?? []).map((v) => [v.name.toUpperCase(), v.id]));

    const resolvePort = (raw: string) => portByKey.get(raw.trim().toUpperCase()) ?? null;

    // Auto-create unknown vessels (carriers add ships constantly — docs/02).
    const unknownVessels = [
      ...new Set(
        rows.map((r) => r.vessel.trim().toUpperCase()).filter((n) => n && !vesselByName.has(n)),
      ),
    ];
    if (unknownVessels.length > 0) {
      const { data: created } = await admin
        .from("vessels")
        .insert(unknownVessels.map((name) => ({ name })))
        .select("id, name");
      for (const v of created ?? []) vesselByName.set(v.name.toUpperCase(), v.id);
    }

    type InsertOp = {
      carrier_id: string; vessel_id: string; voyage_no: string; pol_id: string; pod_id: string;
      mode: string; etd: string; eta: string | null; cy_cutoff: string;
      vessel: string; pol: string; pod: string; // display only
    };
    const inserts: InsertOp[] = [];
    const updates: { id: string; set: Record<string, string | null>; label: string }[] = [];
    const skipped: { raw: string; reason: string }[] = [];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const existingByKey = new Map<string, any>();
    for (const s of existing ?? []) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const row = s as any;
      existingByKey.set(
        `${row.vessels?.name?.toUpperCase()}|${normVoyage(row.voyage_no)}|${row.pol?.unlocode?.toUpperCase()}`,
        row,
      );
    }

    const seenKeys = new Set<string>();
    for (const r of rows) {
      const label = `${r.vessel} ${r.voyage} · ${r.pol} → ${r.pod}`;
      const polId = resolvePort(r.pol);
      const podId = resolvePort(r.pod);
      if (!polId) { skipped.push({ raw: label, reason: `Port '${r.pol}' not found in master data` }); continue; }
      if (!podId) { skipped.push({ raw: label, reason: `Port '${r.pod}' not found in master data` }); continue; }
      if (!r.etd) { skipped.push({ raw: label, reason: "No departure date" }); continue; }

      const vesselName = r.vessel.trim().toUpperCase();
      const vesselId = vesselByName.get(vesselName);
      if (!vesselId) { skipped.push({ raw: label, reason: "Vessel could not be created" }); continue; }

      const polCode = (ports ?? []).find((p) => p.id === polId)?.unlocode.toUpperCase();
      const key = `${vesselName}|${normVoyage(r.voyage)}|${polCode}`;
      if (seenKeys.has(key)) { skipped.push({ raw: label, reason: "Duplicate row in file" }); continue; }
      seenKeys.add(key);

      const etd = `${r.etd}T00:00:00+08:00`;
      const eta = r.eta ? `${r.eta}T00:00:00+08:00` : null;
      const cyCutoff = r.cy_cutoff ?? defaultCyCutoff(r.etd);

      const match = existingByKey.get(key);
      if (match) {
        updates.push({ id: match.id, set: { etd, eta, cy_cutoff: cyCutoff, pod_id: podId, mode }, label });
      } else {
        inserts.push({
          carrier_id: carrierId, vessel_id: vesselId, voyage_no: normVoyage(r.voyage),
          pol_id: polId, pod_id: podId, mode, etd, eta, cy_cutoff: cyCutoff,
          vessel: r.vessel, pol: r.pol, pod: r.pod,
        });
      }
    }

    // Carrier-wide replace: anything not in the file is removed (docs/02 step 5).
    const matchedIds = new Set(updates.map((u) => u.id));
    const removes = (existing ?? [])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .filter((s: any) => !matchedIds.has(s.id))
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((s: any) => ({ id: s.id, label: `${s.vessels?.name} ${s.voyage_no}` }));

    if (inserts.length + updates.length === 0) {
      return await fail("No usable rows — every row was skipped. Check skipped reasons.", 422);
    }

    // 5. Store the plan; the confirm dialog decides what happens next.
    const payload = { inserts, updates, removes, skipped, notes };
    await admin
      .from("upload_batches")
      .update({ status: "awaiting_confirm", parsed_payload: payload })
      .eq("id", batch.id);

    return NextResponse.json({
      batch_id: batch.id,
      carrier: carrier.name,
      file: file.name,
      counts: { insert: inserts.length, update: updates.length, remove: removes.length },
      removals: removes.map((r) => r.label),
      skipped,
      notes,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Parsing failed";
    return await fail(message, 500);
  }
}
