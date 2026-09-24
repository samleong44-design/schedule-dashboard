import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Admin-only. Creates the account directly with a temporary password shown
// once to the admin — no invite email, because corporate mail scanners burn
// one-time links before recipients can click them. Role + company travel in
// metadata and the handle_new_user trigger builds the profile (docs/01).
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
    return NextResponse.json({ error: "Only administrators can invite users" }, { status: 403 });
  }

  const body = await request.json();
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const fullName = typeof body.full_name === "string" ? body.full_name.trim() : "";
  const role = typeof body.role === "string" ? body.role : "";
  const companyId = typeof body.customer_company_id === "string" ? body.customer_company_id : null;
  const newCompanyName = typeof body.new_company_name === "string" ? body.new_company_name.trim() : "";

  if (!email || !["admin", "staff", "customer"].includes(role)) {
    return NextResponse.json({ error: "email and a valid role are required" }, { status: 400 });
  }

  const admin = createAdminClient();

  let resolvedCompanyId = companyId;
  if (role === "customer") {
    if (!resolvedCompanyId && newCompanyName) {
      const { data: company, error: companyErr } = await admin
        .from("customer_companies")
        .insert({ name: newCompanyName })
        .select("id")
        .single();
      if (companyErr) {
        return NextResponse.json(
          { error: companyErr.code === "23505" ? `Company '${newCompanyName}' already exists — pick it from the list.` : companyErr.message },
          { status: 400 },
        );
      }
      resolvedCompanyId = company.id;
    }
    if (!resolvedCompanyId) {
      return NextResponse.json({ error: "Customers must be linked to a company" }, { status: 400 });
    }
  }

  // Admin may supply a password; otherwise generate one to read off the screen.
  if (typeof body.password === "string" && body.password.length > 0 && body.password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
  }
  const tempPassword =
    typeof body.password === "string" && body.password.length >= 8
      ? body.password
      : "Yago-" + crypto.randomBytes(4).toString("hex");

  const { error } = await admin.auth.admin.createUser({
    email,
    password: tempPassword,
    email_confirm: true,
    user_metadata: {
      full_name: fullName,
      role,
      customer_company_id: role === "customer" ? resolvedCompanyId : "",
    },
  });
  if (error) {
    return NextResponse.json(
      { error: error.message.includes("already") ? "This email already has an account." : error.message },
      { status: 400 },
    );
  }

  await admin.from("audit_log").insert({
    actor_id: user.id,
    action: "User created",
    entity_type: "user",
    entity_id: email,
    after: { role, customer_company_id: resolvedCompanyId },
  });

  return NextResponse.json({ ok: true, tempPassword });
}
