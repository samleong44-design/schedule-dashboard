import Link from "next/link";
import { Card, EmptyState, StatusBadge, Th, Td, type BadgeTone } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { fmtDate } from "@/lib/format";

export const dynamic = "force-dynamic";

const statusTone: Record<string, BadgeTone> = { new: "neutral", in_progress: "progress", closed: "success" };
const statusLabel: Record<string, string> = { new: "New", in_progress: "In progress", closed: "Closed" };

export default async function RequestsPage() {
  const supabase = await createClient();
  // RLS scopes this to the customer's own company (docs/04) — colleagues see each other's.
  const { data: requests } = await supabase
    .from("booking_requests")
    .select("id, sailing_snapshot, containers, container_qty, status, created_at, container_types(code)")
    .order("created_at", { ascending: false });

  return (
    <>
      <h1 className="mb-4 text-2xl font-semibold">My requests</h1>
      <Card className="max-w-3xl">
        {(requests ?? []).length === 0 ? (
          <EmptyState
            message="You haven't submitted any booking requests yet."
            action={<Link href="/search" className="text-sm font-medium text-accent">Search sailings →</Link>}
          />
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr><Th>REFERENCE</Th><Th>SAILING</Th><Th>ROUTE</Th><Th>CARGO</Th><Th right>SUBMITTED</Th><Th>STATUS</Th></tr>
            </thead>
            <tbody>
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              {(requests ?? []).map((r: any) => {
                const snap = r.sailing_snapshot ?? {};
                return (
                  <tr key={r.id}>
                    <Td className="font-mono text-xs">BR-{String(r.id).slice(0, 8).toUpperCase()}</Td>
                    <Td>{snap.vessel ? `${snap.vessel} · ${snap.voyage}` : "—"}</Td>
                    <Td>{snap.pol ? `${snap.pol} → ${snap.pod}` : "—"}</Td>
                    <Td>
                      {Array.isArray(r.containers) && r.containers.length > 0
                        ? r.containers.map((l: { qty: number; code: string }) => `${l.qty}×${l.code}`).join(" + ")
                        : r.container_qty
                          ? `${r.container_qty} × ${r.container_types?.code ?? ""}`
                          : "—"}
                    </Td>
                    <Td right>{fmtDate(r.created_at)}</Td>
                    <Td><StatusBadge tone={statusTone[r.status] ?? "neutral"}>{statusLabel[r.status] ?? r.status}</StatusBadge></Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>
      <p className="mt-3 max-w-3xl text-xs text-muted">
        To change a submitted request, submit a new one and mention the change in remarks.
      </p>
    </>
  );
}
