"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, PrimaryButton, GhostButton } from "@/components/ui";

type Carrier = { id: string; name: string };

type ParseResult = {
  batch_id: string;
  carrier: string;
  file: string;
  counts: { insert: number; update: number; remove: number };
  removals: string[];
  skipped: { raw: string; reason: string }[];
  notes: string | null;
};

type Phase = "idle" | "working" | "confirm" | "committing";

export function UploadClient({ carriers }: { carriers: Carrier[] }) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [carrierId, setCarrierId] = useState("");
  const [mode, setMode] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState<ParseResult | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const parse = async (file: File) => {
    setPhase("working");
    setError("");
    const form = new FormData();
    form.set("file", file);
    form.set("carrier_id", carrierId);
    form.set("mode", mode);
    try {
      const res = await fetch("/api/parse-schedule", { method: "POST", body: form });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "Parsing failed");
        setPhase("idle");
        return;
      }
      setResult(body);
      setPhase("confirm");
    } catch {
      setError("Upload failed — check your connection and try again.");
      setPhase("idle");
    }
  };

  const finish = async (action: "commit" | "cancel") => {
    if (!result) return;
    setPhase("committing");
    const res = await fetch("/api/commit-schedule", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ batch_id: result.batch_id, action }),
    });
    if (!res.ok) {
      const body = await res.json();
      setError(body.error ?? "Failed");
      setPhase("confirm");
      return;
    }
    if (action === "commit") {
      router.push("/admin/uploads");
    } else {
      setResult(null);
      setPhase("idle");
    }
  };

  const removalsElevated =
    result != null && result.counts.remove > result.counts.insert + result.counts.update;

  return (
    <>
      <Card className="max-w-md p-5">
        {error && (
          <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        <label className="mb-1 block text-sm font-semibold" htmlFor="carrier">Carrier</label>
        <select
          id="carrier"
          value={carrierId}
          onChange={(e) => setCarrierId(e.target.value)}
          className="w-full rounded-md border border-line px-3 py-2 text-sm"
        >
          <option value="">Select carrier</option>
          {carriers.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
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

        <input
          ref={fileInput}
          type="file"
          accept=".xlsx,.xls,.pdf"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) parse(f);
            e.target.value = "";
          }}
        />
        <button
          type="button"
          disabled={!carrierId || !mode || phase !== "idle"}
          onClick={() => fileInput.current?.click()}
          className="mt-4 flex h-32 w-full flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-slate-300 text-muted enabled:hover:border-accent enabled:hover:text-accent disabled:opacity-50"
        >
          <span className="text-sm font-medium text-slate-700">
            {phase === "working" ? "Reading the schedule…" : "Choose the carrier's file"}
          </span>
          <span className="text-xs">
            {phase === "working" ? "This takes up to a minute for PDFs." : ".xlsx  .xls  .pdf — up to 20 MB"}
          </span>
        </button>
      </Card>

      {(phase === "confirm" || phase === "committing") && result && (
        <div className="fixed inset-0 z-10 flex items-center justify-center bg-slate-900/50 p-6">
          <div className="max-h-full w-full max-w-2xl overflow-y-auto rounded-xl bg-white shadow-2xl">
            <div className="border-b border-line px-5 py-3.5">
              <div className="text-base font-semibold">Review before publishing</div>
              <div className="text-xs text-muted">{result.carrier} · {result.file}</div>
            </div>
            <div className="p-5">
              <div className="grid grid-cols-[1fr_1fr_1.4fr] gap-3">
                <div className="rounded-lg border border-line p-3 text-center">
                  <div className="text-xl font-bold tabular-nums">{result.counts.insert}</div>
                  <div className="text-xs text-muted">insert</div>
                </div>
                <div className="rounded-lg border border-line p-3 text-center">
                  <div className="text-xl font-bold tabular-nums">{result.counts.update}</div>
                  <div className="text-xs text-muted">update</div>
                </div>
                <div className={`rounded-lg border p-3 text-center ${removalsElevated ? "border-2 border-red-600 bg-red-50" : "border-line"}`}>
                  <div className={`text-2xl font-extrabold tabular-nums ${removalsElevated ? "text-red-600" : ""}`}>
                    {result.counts.remove}
                  </div>
                  <div className={`text-xs font-bold ${removalsElevated ? "text-red-600" : "text-muted"}`}>REMOVE</div>
                </div>
              </div>

              {result.counts.remove > 0 && (
                <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
                  ⚠ {result.counts.remove} sailings will be removed from {result.carrier}&apos;s schedule.
                  If this file only covers part of the schedule, cancel and ask the carrier for the full file.
                  There is no undo.
                </div>
              )}

              {result.removals.length > 0 && (
                <div className="mt-3 max-h-40 overflow-y-auto rounded-lg border border-line">
                  <div className="border-b border-line px-3 py-2 text-sm font-semibold">
                    Removals ({result.counts.remove})
                  </div>
                  {result.removals.map((r, i) => (
                    <div key={i} className="border-b border-line-soft px-3 py-1.5 text-sm">{r}</div>
                  ))}
                </div>
              )}

              {result.skipped.length > 0 && (
                <div className="mt-3 rounded-lg border border-line">
                  <div className="border-b border-line px-3 py-2 text-sm font-semibold">
                    Skipped rows ({result.skipped.length})
                  </div>
                  {result.skipped.map((s, i) => (
                    <div key={i} className="border-b border-line-soft px-3 py-1.5 text-sm">
                      {s.raw} — <span className="text-muted">{s.reason}</span>
                    </div>
                  ))}
                </div>
              )}

              {result.notes && (
                <p className="mt-3 text-xs text-muted">Parser note: {result.notes}</p>
              )}
            </div>
            <div className="flex justify-end gap-2 border-t border-line px-5 py-3">
              <GhostButton onClick={() => finish("cancel")}>Cancel</GhostButton>
              <PrimaryButton destructive={removalsElevated} onClick={() => finish("commit")}>
                {phase === "committing" ? "Publishing…" : "Publish"}
              </PrimaryButton>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
