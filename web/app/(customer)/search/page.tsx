import Link from "next/link";
import { Card, EmptyState, Th, Td } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { fmtDate } from "@/lib/format";

export const dynamic = "force-dynamic";

// Customer search. Reads ONLY sailings_public — the carrier-masked view.
// Never query `sailings` from this page (docs/03-schedule-search.md).
export default async function SearchPage({ searchParams }: PageProps<"/search">) {
  const params = await searchParams;
  const pol = typeof params.pol === "string" ? params.pol.trim() : "";
  const pod = typeof params.pod === "string" ? params.pod.trim() : "";
  const ready = typeof params.ready === "string" ? params.ready : "";
  const mode = typeof params.mode === "string" ? params.mode : "";
  const windowWeeks = Number(params.window) || 2;
  const searched = pol !== "" || pod !== "";

  const supabase = await createClient();
  const { data: ports } = await supabase.from("ports").select("name").eq("is_active", true).order("name");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let rows: any[] = [];
  if (searched) {
    const from = ready ? new Date(`${ready}T00:00:00+08:00`) : new Date();
    const to = new Date(from.getTime() + windowWeeks * 7 * 86400e3);
    let q = supabase
      .from("sailings_public")
      .select("*")
      .gte("etd", from.toISOString())
      .lt("etd", to.toISOString())
      .order("etd")
      .limit(100);
    if (pol) q = q.ilike("pol_name", `%${pol}%`);
    if (pod) q = q.ilike("pod_name", `%${pod}%`);
    if (mode === "FCL" || mode === "LCL") q = q.eq("mode", mode);
    const { data } = await q;
    rows = data ?? [];
  }

  return (
    <>
      <h1 className="mb-4 text-2xl font-semibold">Find a sailing</h1>

      <Card className="mb-4 p-4">
        <form method="get" className="flex items-end gap-3">
          <datalist id="port-options">
            {(ports ?? []).map((p) => <option key={p.name} value={p.name} />)}
          </datalist>
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted" htmlFor="pol">Port of loading</label>
            <input id="pol" name="pol" list="port-options" defaultValue={pol}
              placeholder="e.g. Port Klang" className="w-44 rounded-md border border-line px-2.5 py-1.5 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted" htmlFor="pod">Port of discharge</label>
            <input id="pod" name="pod" list="port-options" defaultValue={pod}
              placeholder="e.g. Manila" className="w-44 rounded-md border border-line px-2.5 py-1.5 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted" htmlFor="ready">Cargo readiness date</label>
            <input id="ready" name="ready" type="date" defaultValue={ready}
              className="rounded-md border border-line px-2.5 py-1.5 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted" htmlFor="mode">FCL / LCL</label>
            <select id="mode" name="mode" defaultValue={mode} className="rounded-md border border-line px-2.5 py-1.5 text-sm">
              <option value="">All</option>
              <option value="FCL">FCL</option>
              <option value="LCL">LCL</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted" htmlFor="window">Window</label>
            <select id="window" name="window" defaultValue={String(windowWeeks)} className="rounded-md border border-line px-2.5 py-1.5 text-sm">
              <option value="1">1 week</option>
              <option value="2">2 weeks</option>
              <option value="4">4 weeks</option>
              <option value="8">8 weeks</option>
            </select>
          </div>
          <button type="submit" className="rounded-md bg-accent px-4 py-1.5 text-sm font-semibold text-white hover:bg-accent-hover">
            Search
          </button>
        </form>
      </Card>

      {searched && (
        <Card>
          <div className="border-b border-line px-4 py-2.5 text-sm font-medium">
            {pol || "Anywhere"} → {pod || "Anywhere"}
          </div>
          {rows.length === 0 ? (
            <EmptyState message="No sailings found for this lane and date. Try widening the date window, or contact us." />
          ) : (
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <Th>VESSEL / VOYAGE</Th><Th>POL</Th><Th>POD</Th>
                  <Th right>DEPARTURE</Th><Th right>ARRIVAL</Th><Th />
                </tr>
              </thead>
              <tbody>
                {rows.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50">
                    <Td className="whitespace-nowrap">{s.vessel_name} {s.voyage_no}</Td>
                    <Td>{s.pol_name} <span className="text-xs text-faint">{s.pol_code}</span></Td>
                    <Td>{s.pod_name} <span className="text-xs text-faint">{s.pod_code}</span></Td>
                    <Td right>{fmtDate(s.etd)}</Td>
                    <Td right>{fmtDate(s.eta)}</Td>
                    <Td right>
                      <Link href={`/booking/new?sailing=${s.id}`}
                        className="whitespace-nowrap rounded-md bg-accent px-2.5 py-1 text-xs font-semibold text-white hover:bg-accent-hover">
                        Booking Request
                      </Link>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      )}
      {!searched && (
        <p className="text-sm text-muted">Choose a route and search.</p>
      )}
    </>
  );
}
