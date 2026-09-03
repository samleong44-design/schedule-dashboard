"use client";

import { useState } from "react";
import Link from "next/link";
import { Card, EmptyState, Th, Td } from "@/components/ui";
import type { SailingRow } from "@/lib/queries";

type Kpis = {
  sailingsThisWeek: number;
  pendingRequests: number;
  cutoffsClosing: number;
  lastUploads: { carrier: string; age: string; stale: boolean }[];
};

export function DashboardClient({ sailings, kpis }: { sailings: SailingRow[]; kpis: Kpis }) {
  const [polQuery, setPolQuery] = useState("");
  const [podQuery, setPodQuery] = useState("");
  const [readiness, setReadiness] = useState("");
  const [mode, setMode] = useState("");

  const filtered = sailings.filter(
    (s) =>
      s.polName.toLowerCase().includes(polQuery.trim().toLowerCase()) &&
      s.podName.toLowerCase().includes(podQuery.trim().toLowerCase()) &&
      (!readiness || s.etdIso >= readiness) &&
      (!mode || s.mode === mode),
  );

  const hasFilters = polQuery || podQuery || readiness || mode;

  return (
    <>
      <div className="mb-4 grid grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="text-[11px] font-semibold tracking-wide text-faint">SAILINGS THIS WEEK</div>
          <div className="mt-1 text-2xl font-bold tabular-nums">{kpis.sailingsThisWeek}</div>
        </Card>
        <Card className="p-4">
          <div className="text-[11px] font-semibold tracking-wide text-faint">PENDING REQUESTS</div>
          <div className="mt-1 text-2xl font-bold tabular-nums">
            {kpis.pendingRequests}{" "}
            <Link href="/admin/bookings" className="text-xs font-medium text-accent">view →</Link>
          </div>
        </Card>
        <Card className={kpis.cutoffsClosing > 0 ? "border-amber-200 bg-amber-50 p-4" : "p-4"}>
          <div className={`text-[11px] font-semibold tracking-wide ${kpis.cutoffsClosing > 0 ? "text-amber-700" : "text-faint"}`}>
            CUTOFFS &lt;48H
          </div>
          <div className={`mt-1 text-2xl font-bold tabular-nums ${kpis.cutoffsClosing > 0 ? "text-amber-700" : ""}`}>
            {kpis.cutoffsClosing}
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-[11px] font-semibold tracking-wide text-faint">LAST UPLOAD</div>
          <div className="mt-1.5 flex flex-col gap-0.5 text-sm">
            {kpis.lastUploads.map((u) => (
              <div key={u.carrier} className="flex justify-between">
                <span>{u.carrier}</span>
                <span className={u.stale ? "font-semibold text-amber-700" : "text-muted"}>
                  {u.age}{u.stale ? " ⚠" : ""}
                </span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card>
        <div className="flex items-end gap-3 border-b border-line px-4 py-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted" htmlFor="f-pol">Port of loading</label>
            <input id="f-pol" value={polQuery} onChange={(e) => setPolQuery(e.target.value)}
              placeholder="e.g. Port Klang" className="w-44 rounded-md border border-line px-2.5 py-1.5 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted" htmlFor="f-pod">Port of discharge</label>
            <input id="f-pod" value={podQuery} onChange={(e) => setPodQuery(e.target.value)}
              placeholder="e.g. Jebel Ali" className="w-44 rounded-md border border-line px-2.5 py-1.5 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted" htmlFor="f-ready">Cargo readiness date</label>
            <input id="f-ready" type="date" value={readiness} onChange={(e) => setReadiness(e.target.value)}
              className="rounded-md border border-line px-2.5 py-1.5 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted" htmlFor="f-mode">FCL / LCL</label>
            <select id="f-mode" value={mode} onChange={(e) => setMode(e.target.value)}
              className="rounded-md border border-line px-2.5 py-1.5 text-sm">
              <option value="">All</option>
              <option value="FCL">FCL</option>
              <option value="LCL">LCL</option>
            </select>
          </div>
          {hasFilters && (
            <button type="button"
              onClick={() => { setPolQuery(""); setPodQuery(""); setReadiness(""); setMode(""); }}
              className="rounded-md px-2.5 py-1.5 text-sm text-muted hover:bg-slate-50">
              Clear filters
            </button>
          )}
          <div className="flex-1" />
          <button type="button" className="rounded-md border border-line px-2.5 py-1.5 text-sm font-medium hover:bg-slate-50">
            Export ▾
          </button>
        </div>

        {sailings.length === 0 ? (
          <EmptyState
            message="No schedules uploaded yet."
            action={<Link href="/upload" className="text-sm font-medium text-accent">Upload schedule →</Link>}
          />
        ) : filtered.length === 0 ? (
          <EmptyState message="No sailings match this search. Try widening the date or clearing filters." />
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <Th>CARRIER</Th><Th>VESSEL</Th><Th>VOYAGE</Th><Th>POL</Th><Th>POD</Th><Th>MODE</Th>
                <Th right>ETD</Th><Th right>ETA</Th><Th right>CY CUT</Th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => (
                <tr key={s.id} className="cursor-pointer hover:bg-slate-50">
                  <Td>{s.carrier}</Td>
                  <Td>{s.vessel}</Td>
                  <Td>{s.voyage}</Td>
                  <Td>{s.polName} <span className="text-xs text-faint">{s.pol}</span></Td>
                  <Td>{s.podName} <span className="text-xs text-faint">{s.pod}</span></Td>
                  <Td>{s.mode}</Td>
                  <Td right>{s.etd}</Td>
                  <Td right>{s.eta}</Td>
                  <Td right className={s.cyCutoffSoon ? "font-semibold text-amber-700" : ""}>
                    {s.cyCutoff}{s.cyCutoffSoon ? " ⚠" : ""}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="flex justify-end px-4 py-2 text-xs text-muted">
          Showing {filtered.length} of {sailings.length}
        </div>
      </Card>
    </>
  );
}
