import Link from "next/link";
import { redirect } from "next/navigation";
import { Card } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function BookingConfirmationPage({ searchParams }: PageProps<"/booking/confirmation">) {
  const params = await searchParams;
  const id = typeof params.id === "string" ? params.id : "";
  if (!id) redirect("/requests");

  const supabase = await createClient();
  const { data: req } = await supabase
    .from("booking_requests")
    .select("id, sailing_snapshot, containers, container_qty, container_types(code)")
    .eq("id", id)
    .maybeSingle();
  if (!req) redirect("/requests");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const snap = req.sailing_snapshot as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ct = (req as any).container_types?.code;
  const ref = `BR-${String(req.id).slice(0, 8).toUpperCase()}`;

  return (
    <div className="mx-auto max-w-md pt-10">
      <Card className="p-6">
        <div className="mb-3 text-lg font-semibold text-emerald-700">✓ Request submitted</div>
        <dl className="space-y-1.5 text-sm">
          <div className="flex justify-between"><dt className="text-muted">Reference</dt><dd className="font-mono">{ref}</dd></div>
          {snap?.vessel && (
            <div className="flex justify-between"><dt className="text-muted">Sailing</dt><dd>{snap.vessel} · {snap.voyage}</dd></div>
          )}
          {snap?.pol && (
            <div className="flex justify-between"><dt className="text-muted">Route</dt><dd>{snap.pol} → {snap.pod}</dd></div>
          )}
          {Array.isArray(req.containers) && req.containers.length > 0 ? (
            <div className="flex justify-between"><dt className="text-muted">Containers</dt>
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              <dd>{(req.containers as any[]).map((l) => `${l.qty}×${l.code}`).join(" + ")}</dd>
            </div>
          ) : req.container_qty ? (
            <div className="flex justify-between"><dt className="text-muted">Containers</dt><dd>{req.container_qty} × {ct ?? ""}</dd></div>
          ) : null}
        </dl>
        <p className="mt-4 text-sm">
          Thank you for your booking request. Our customer service team has been notified and will
          contact you shortly to confirm availability and finalise the arrangements.
        </p>
        <p className="mt-2 text-sm text-muted">
          Please note that this submission is a booking request; your booking is confirmed only once
          our team issues a confirmation.
        </p>
        <div className="mt-5 flex gap-3">
          <Link href="/requests" className="rounded-md bg-accent px-3.5 py-1.5 text-sm font-semibold text-white hover:bg-accent-hover">
            View my requests
          </Link>
          <Link href="/search" className="rounded-md border border-line px-3.5 py-1.5 text-sm hover:bg-slate-50">
            New search
          </Link>
        </div>
      </Card>
    </div>
  );
}
