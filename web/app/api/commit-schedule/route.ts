import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
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

  const { batch_id, action } = (await request.json()) as { batch_id?: string; action?: string };
  if (!batch_id || !["commit", "cancel"].includes(action ?? "")) {
    return NextResponse.json({ error: "batch_id and action (commit|cancel) required" }, { status: 400 });
  }

  const admin = createAdminClient();

  if (action === "cancel") {
    const { error } = await admin
      .from("upload_batches")
      .update({ status: "failed", error_message: "Cancelled by staff" })
      .eq("id", batch_id)
      .eq("status", "awaiting_confirm");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  // Commit runs inside one Postgres function — all-or-nothing (docs/02 step 7).
  const { data, error } = await admin.rpc("commit_upload_batch", {
    p_batch_id: batch_id,
    p_actor_id: user.id,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, counts: data });
}
