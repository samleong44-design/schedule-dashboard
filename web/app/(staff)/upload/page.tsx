"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, PageHeader, PrimaryButton, GhostButton } from "@/components/ui";

type Phase = "idle" | "uploading" | "parsing" | "confirm";

// Mock parse result. Real flow: upload to Supabase Storage, invoke the
// parse-schedule Edge Function, poll upload_batches.status — docs/02-schedule-ingestion.md.
const parseResult = {
  file: "maersk-wk32.xlsx",
  carrier: "Maersk",
  inserted: 14,
  updated: 6,
  removed: 218,
  removals: [
    { label: "MSC ISABELLA 034E · MYPKG → AEJEA", etd: "14 Aug" },
    { label: "EVER GIVEN 118W · MYPKG → NLRTM", etd: "15 Aug" },
  ],
};

export default function UploadPage() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [carrier, setCarrier] = useState("");
  const [mode, setMode] = useState("");
  const router = useRouter();

  const start = () => {
    setPhase("uploading");
    setTimeout(() => setPhase("parsing"), 900);
    setTimeout(() => setPhase("confirm"), 2200);
  };

  const removalsElevated = parseResult.removed > parseResult.inserted + parseResult.updated;

  return (
    <>
      <PageHeader title="Upload schedule" />
      <Card className="max-w-md p-5">
        <label className="mb-1 block text-sm font-semibold" htmlFor="carrier">Carrier</label>
        <select
          id="carrier"
          value={carrier}
          onChange={(e) => setCarrier(e.target.value)}
          className="w-full rounded-md border border-line px-3 py-2 text-sm"
        >
          <option value="">Select carrier</option>
          <option>Maersk</option>
          <option>ONE</option>
          <option>Evergreen</option>
        </select>
        <p className="mt-1 text-xs text-muted">The upload replaces this carrier&apos;s entire schedule.</p>

        <label className="mt-3 mb-1 block text-sm font-semibold" htmlFor="mode">FCL / LCL</label>
        <select
          id="mode"
          value={mode}
          onChange={(e) => setMode(e.target.value)}
          className="w-full rounded-md border border-line px-3 py-2 text-sm"
        >
          <option value="">Select mode</option>
          <option>FCL</option>
          <option>LCL</option>
        </select>

        <button
          type="button"
          disabled={!carrier || !mode || phase !== "idle"}
          onClick={start}
          className="mt-4 flex h-32 w-full flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-slate-300 text-muted enabled:hover:border-accent enabled:hover:text-accent disabled:opacity-50"
        >
          <span className="text-sm font-medium text-slate-700">Drop the carrier&apos;s file here, or browse</span>
          <span className="text-xs">.xlsx  .xls  .pdf — up to 20 MB</span>
        </button>

        {phase === "uploading" && (
          <div className="mt-4 rounded-lg border border-line p-3">
            <div className="mb-1.5 text-sm font-semibold">{parseResult.file}</div>
            <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full w-2/3 bg-accent" />
            </div>
            <div className="mt-1 text-xs text-muted">Uploading… 68%</div>
          </div>
        )}

        {phase === "parsing" && (
          <div className="mt-4 rounded-lg border border-line p-3">
            <div className="text-sm font-semibold">{parseResult.file}</div>
            <div className="mt-1 text-xs text-muted">Reading the schedule… This takes up to a minute for PDFs.</div>
          </div>
        )}
      </Card>

      {phase === "confirm" && (
        <div className="fixed inset-0 z-10 flex items-center justify-center bg-slate-900/50 p-6">
          <div className="w-full max-w-2xl overflow-hidden rounded-xl bg-white shadow-2xl">
            <div className="border-b border-line px-5 py-3.5">
              <div className="text-base font-semibold">Review before publishing</div>
              <div className="text-xs text-muted">{parseResult.carrier} · {parseResult.file}</div>
            </div>
            <div className="p-5">
              <div className="grid grid-cols-[1fr_1fr_1.4fr] gap-3">
                <div className="rounded-lg border border-line p-3 text-center">
                  <div className="text-xl font-bold tabular-nums">{parseResult.inserted}</div>
                  <div className="text-xs text-muted">insert</div>
                </div>
                <div className="rounded-lg border border-line p-3 text-center">
                  <div className="text-xl font-bold tabular-nums">{parseResult.updated}</div>
                  <div className="text-xs text-muted">update</div>
                </div>
                <div className={`rounded-lg border p-3 text-center ${removalsElevated ? "border-2 border-red-600 bg-red-50" : "border-line"}`}>
                  <div className={`text-2xl font-extrabold tabular-nums ${removalsElevated ? "text-red-600" : ""}`}>{parseResult.removed}</div>
                  <div className={`text-xs font-bold ${removalsElevated ? "text-red-600" : "text-muted"}`}>REMOVE</div>
                </div>
              </div>

              {parseResult.removed > 0 && (
                <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
                  ⚠ {parseResult.removed} sailings will be removed from {parseResult.carrier}&apos;s schedule.
                  If this file only covers part of the schedule, cancel and ask the carrier for the full file.
                </div>
              )}

              <div className="mt-3 rounded-lg border border-line">
                <div className="border-b border-line px-3 py-2 text-sm font-semibold">▾ Removals ({parseResult.removed})</div>
                {parseResult.removals.map((r) => (
                  <div key={r.label} className="flex justify-between border-b border-line-soft px-3 py-1.5 text-sm">
                    <span>{r.label}</span>
                    <span className="text-muted">{r.etd}</span>
                  </div>
                ))}
                <button type="button" className="px-3 py-1.5 text-xs text-accent">show all</button>
              </div>
              <div className="mt-2 text-sm text-slate-600">▸ Updates (6) · ▸ Inserts (14) · ▸ Skipped rows (2)</div>
            </div>
            <div className="flex justify-end gap-2 border-t border-line px-5 py-3">
              <GhostButton onClick={() => setPhase("idle")}>Cancel</GhostButton>
              <PrimaryButton destructive={removalsElevated} onClick={() => router.push("/admin/uploads")}>
                Publish
              </PrimaryButton>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
