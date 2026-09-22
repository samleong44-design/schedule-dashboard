import Link from "next/link";
import { redirect } from "next/navigation";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { getClientReport, getProfile } from "@/lib/queries";
import { ClientReportTable } from "./report-table";

export const dynamic = "force-dynamic";

// Quarters in MYT (UTC+8, no DST): Q1 starts Jan 1 00:00 +08:00 etc.
function quarterRange(year: number, q: number) {
  const startMonth = (q - 1) * 3; // 0-based
  const start = new Date(Date.UTC(year, startMonth, 1) - 8 * 3600e3);
  const end = new Date(Date.UTC(startMonth === 9 ? year + 1 : year, (startMonth + 3) % 12, 1) - 8 * 3600e3);
  return { startIso: start.toISOString(), endIso: end.toISOString() };
}

function currentQuarter() {
  const mytNow = new Date(Date.now() + 8 * 3600e3);
  return { year: mytNow.getUTCFullYear(), q: Math.floor(mytNow.getUTCMonth() / 3) + 1 };
}

export default async function ClientReportPage({ searchParams }: PageProps<"/admin/clients">) {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  if (profile.role === "customer") redirect("/search");
  if (profile.role !== "admin" && !profile.can_view_reports) redirect("/dashboard");

  // Quarter options: current + previous 4.
  const cur = currentQuarter();
  const options: { year: number; q: number }[] = [];
  for (let i = 0, y = cur.year, q = cur.q; i < 5; i++) {
    options.push({ year: y, q });
    q -= 1;
    if (q === 0) { q = 4; y -= 1; }
  }

  const params = await searchParams;
  const picked = typeof params.q === "string" ? params.q : "";
  const match = /^(\d{4})-Q([1-4])$/.exec(picked);
  const sel = match
    ? { year: Number(match[1]), q: Number(match[2]) }
    : options[0];

  const { startIso, endIso } = quarterRange(sel.year, sel.q);
  const rows = await getClientReport(startIso, endIso);
  const label = `${sel.year} Q${sel.q}`;

  return (
    <>
      <PageHeader title="Client Report" />
      <div className="mb-4 flex max-w-4xl items-center gap-1.5">
        {options.map((o) => {
          const active = o.year === sel.year && o.q === sel.q;
          return (
            <Link
              key={`${o.year}-Q${o.q}`}
              href={`/admin/clients?q=${o.year}-Q${o.q}`}
              className={`rounded-md px-2.5 py-1.5 text-sm ${active ? "bg-slate-100 font-semibold" : "border border-line hover:bg-slate-50"}`}
            >
              {o.year} Q{o.q}
            </Link>
          );
        })}
      </div>

      {rows.length === 0 ? (
        <Card className="max-w-4xl"><EmptyState message={`No client activity in ${label}.`} /></Card>
      ) : (
        <ClientReportTable rows={rows} label={label} />
      )}
      <p className="mt-3 max-w-4xl text-xs text-muted">
        Active days = days the client&apos;s users opened the portal. Export the CSV to share or file the report.
      </p>
    </>
  );
}
