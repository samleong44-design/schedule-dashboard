"use client";

import { useState } from "react";
import { Card, EmptyState, StatusBadge, Th, Td, type BadgeTone } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";

type BookingRow = {
  id: string;
  ref: string;
  company: string;
  vessel: string;
  voyage: string;
  pol: string;
  pod: string;
  submitted: string;
  status: "new" | "in_progress" | "closed";
  carrier: string | null;
  cargo: string;
  contact: string;
  dangerousGoods?: { un: string; cls: string };
  sailingRemoved?: boolean;
};

const statusTone: Record<BookingRow["status"], BadgeTone> = {
  new: "neutral",
  in_progress: "progress",
  closed: "success",
};

const statusLabel: Record<BookingRow["status"], string> = {
  new: "New",
  in_progress: "In progress",
  closed: "Closed",
};

export function BookingsClient({ requests }: { requests: BookingRow[] }) {
  const [rows, setRows] = useState(requests);
  const [selectedId, setSelectedId] = useState(requests[0]?.id);
  const selected = rows.find((r) => r.id === selectedId);

  const setStatus = async (id: string, status: BookingRow["status"]) => {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, status } : r)));
    const supabase = createClient();
    const { error } = await supabase.from("booking_requests").update({ status }).eq("id", id);
    if (error) alert("Failed to update status — try again.");
  };

  if (rows.length === 0) {
    return (
      <Card className="max-w-4xl">
        <EmptyState message="No booking requests yet." />
      </Card>
    );
  }

  return (
    <Card className="flex max-w-4xl">
      <div className="w-1/2 border-r border-line">
        <table className="w-full border-collapse">
          <thead>
            <tr><Th>REF</Th><Th>COMPANY</Th><Th>ROUTE</Th><Th>STATUS</Th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.id}
                onClick={() => setSelectedId(r.id)}
                className={`cursor-pointer ${r.id === selectedId ? "bg-blue-50" : "hover:bg-slate-50"}`}
              >
                <Td className="font-mono text-xs">{r.ref}</Td>
                <Td>{r.company}</Td>
                <Td>{r.pol} → {r.pod}</Td>
                <Td><StatusBadge tone={statusTone[r.status]}>{statusLabel[r.status]}</StatusBadge></Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selected && (
        <div className="w-1/2 p-5">
          <div className="text-base font-semibold">{selected.ref} · {selected.company}</div>

          <div className="mt-4 text-[11px] font-semibold tracking-wide text-faint">SAILING (as shown to the customer)</div>
          <div className="mt-0.5 text-sm">{selected.vessel} · {selected.voyage} · {selected.pol} → {selected.pod}</div>
          {selected.carrier && (
            <div className="mt-0.5 text-sm font-semibold text-amber-700">Carrier: {selected.carrier}</div>
          )}

          {selected.sailingRemoved && (
            <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-sm text-amber-800">
              ⚠ This sailing is no longer in the schedule
            </div>
          )}

          {selected.dangerousGoods && (
            <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-2.5 py-1.5 text-sm font-semibold text-red-600">
              ⚠ DANGEROUS GOODS · {selected.dangerousGoods.un} · IMCO {selected.dangerousGoods.cls}
            </div>
          )}

          <div className="mt-4 text-[11px] font-semibold tracking-wide text-faint">CARGO</div>
          <div className="mt-0.5 text-sm">{selected.cargo}</div>

          <div className="mt-4 text-[11px] font-semibold tracking-wide text-faint">CONTACT</div>
          <div className="mt-0.5 text-sm">{selected.contact}</div>

          <div className="mt-5">
            <label className="mr-2 text-sm text-muted" htmlFor="status">Status</label>
            <select
              id="status"
              value={selected.status}
              onChange={(e) => setStatus(selected.id, e.target.value as BookingRow["status"])}
              className="rounded-md border border-line px-2 py-1 text-sm"
            >
              <option value="new">New</option>
              <option value="in_progress">In progress</option>
              <option value="closed">Closed</option>
            </select>
          </div>
        </div>
      )}
    </Card>
  );
}
