import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Admin-only "forgot password" recovery without email: sets a fresh password
// for any user and returns it once for the admin to pass on directly.
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
  if (!profile?.is_active || profile.role !== "admin") {
    return NextResponse.json({ error: "Only administrators can set passwords" }, { status: 403 });
  }

  const body = await request.json();
  const userId = typeof body.user_id === "string" ? body.user_id : "";
  if (!userId) return NextResponse.json({ error: "user_id required" }, { status: 400 });
  if (typeof body.password === "string" && body.password.length > 0 && body.password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
  }
  const password =
    typeof body.password === "string" && body.password.length >= 8
      ? body.password
      : "Yago-" + crypto.randomBytes(4).toString("hex");

  const admin = createAdminClient();
  const { data: target } = await admin.from("profiles").select("email").eq("id", userId).single();
  if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const { error } = await admin.auth.admin.updateUserById(userId, { password });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await admin.from("audit_log").insert({
    actor_id: user.id,
    action: "Password reset by admin",
    entity_type: "user",
    entity_id: target.email,
  });

  return NextResponse.json({ ok: true, password, email: target.email });
}
