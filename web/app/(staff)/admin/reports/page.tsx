import { Card, EmptyState, PageHeader, Th, Td } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// TEU: 20-foot equivalents. Codes starting with "2" count 1, "4" count 2.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function teuOf(containers: any): number {
  if (!Array.isArray(containers)) return 0;
  return containers.reduce((sum, l) => {
    const per = String(l.code ?? "").startsWith("4") ? 2 : 1;
    return sum + per * (Number(l.qty) || 0);
  }, 0);
}

export default async function ReportsPage() {
  const supabase = await createClient();
  const { data: requests } = await supabase
    .from("booking_requests")
    .select("id, sailing_snapshot, containers, container_qty, status, created_at, customer_companies(name), contact_name")
    .order("created_at", { ascending: false });

  const rows = requests ?? [];
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const totalTeu = rows.reduce((s, r) => s + teuOf(r.containers), 0);
  const thisMonth = rows.filter((r) => new Date(r.created_at) >= monthStart);

  const groupBy = (keyOf: (r: (typeof rows)[number]) => string) => {
    const m = new Map<string, { count: number; teu: number }>();
    for (const r of rows) {
      const k = keyOf(r) || "—";
      const cur = m.get(k) ?? { count: 0, teu: 0 };
      cur.count += 1;
      cur.teu += teuOf(r.containers);
      m.set(k, cur);
    }
    return [...m.entries()].sort((a, b) => b[1].count - a[1].count);
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const byPod = groupBy((r) => (r.sailing_snapshot as any)?.pod ?? "");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const byCompany = groupBy((r) => (r as any).customer_companies?.name ?? "");

  return (
    <>
      <PageHeader title="Booking reports" />

      <div className="mb-4 grid max-w-3xl grid-cols-3 gap-4">
        <Card className="p-4">
          <div className="text-[11px] font-semibold tracking-wide text-faint">TOTAL REQUESTS</div>
          <div className="mt-1 text-2xl font-bold tabular-nums">{rows.length}</div>
        </Card>
        <Card className="p-4">
          <div className="text-[11px] font-semibold tracking-wide text-faint">THIS MONTH</div>
          <div className="mt-1 text-2xl font-bold tabular-nums">{thisMonth.length}</div>
        </Card>
        <Card className="p-4">
          <div className="text-[11px] font-semibold tracking-wide text-faint">TOTAL VOLUME (TEU)</div>
          <div className="mt-1 text-2xl font-bold tabular-nums">{totalTeu}</div>
        </Card>
      </div>

      {rows.length === 0 ? (
        <Card className="max-w-3xl"><EmptyState message="No booking requests yet." /></Card>
      ) : (
        <div className="grid max-w-3xl grid-cols-2 gap-4">
          <Card>
            <div className="border-b border-line px-4 py-2.5 text-sm font-semibold">By port of discharge</div>
            <table className="w-full border-collapse">
              <thead><tr><Th>POD</Th><Th right>REQUESTS</Th><Th right>TEU</Th></tr></thead>
              <tbody>
                {byPod.map(([pod, v]) => (
                  <tr key={pod}>
                    <Td>{pod}</Td>
                    <Td right>{v.count}</Td>
                    <Td right>{v.teu}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          <Card>
            <div className="border-b border-line px-4 py-2.5 text-sm font-semibold">By customer</div>
            <table className="w-full border-collapse">
              <thead><tr><Th>COMPANY</Th><Th right>REQUESTS</Th><Th right>TEU</Th></tr></thead>
              <tbody>
                {byCompany.map(([name, v]) => (
                  <tr key={name}>
                    <Td>{name}</Td>
                    <Td right>{v.count}</Td>
                    <Td right>{v.teu}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>
      )}
    </>
  );
}
