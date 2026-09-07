import { redirect } from "next/navigation";
import { Card } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { fmtDate } from "@/lib/format";
import { BookingForm } from "./booking-form";

export const dynamic = "force-dynamic";

export default async function NewBookingPage({ searchParams }: PageProps<"/booking/new">) {
  const params = await searchParams;
  const sailingId = typeof params.sailing === "string" ? params.sailing : "";
  if (!sailingId) redirect("/search");

  const supabase = await createClient();
  // Pre-fill comes from the MASKED view — never the sailings table (docs/04).
  const [{ data: sailing }, { data: containerTypes }, { data: profile }] = await Promise.all([
    supabase.from("sailings_public").select("*").eq("id", sailingId).single(),
    supabase.from("container_types").select("id, code, description").eq("is_active", true).order("code"),
    supabase.from("profiles").select("full_name, email").maybeSingle(),
  ]);

  if (!sailing) {
    return (
      <Card className="max-w-lg p-6">
        <h1 className="mb-2 text-lg font-semibold">Sailing not available</h1>
        <p className="text-sm text-muted">
          This sailing is no longer in the schedule. Please search again.
        </p>
      </Card>
    );
  }

  return (
    <>
      <h1 className="mb-4 text-2xl font-semibold">Booking request</h1>
      <Card className="mb-4 max-w-2xl border-l-4 border-l-accent p-4">
        <div className="text-sm font-semibold">
          {sailing.vessel_name} · {sailing.voyage_no} · {sailing.mode}
        </div>
        <div className="mt-0.5 text-sm text-muted">
          {sailing.pol_name} → {sailing.pod_name} · Departs {fmtDate(sailing.etd)} · Arrives {fmtDate(sailing.eta)}
        </div>
      </Card>
      <BookingForm
        sailingId={sailing.id}
        containerTypes={containerTypes ?? []}
        contactName={profile?.full_name ?? ""}
        contactEmail={profile?.email ?? ""}
      />
    </>
  );
}
