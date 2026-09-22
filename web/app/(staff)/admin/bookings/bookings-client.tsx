"use client";

import { useState } from "react";
import { Card, EmptyState, Th, Td } from "@/components/ui";

type BookingRow = {
  id: string;
  ref: string;
  company: string;
  vessel: string;
  voyage: string;
  pol: string;
  pod: string;
  submitted: string;
  carrier: string | null;
  cargo: string;
  contact: string;
  dangerousGoods?: { un: string; cls: string };
  sailingRemoved?: boolean;
};

// Read-only: after submission all correspondence is by email — no status upkeep.
export function BookingsClient({ requests }: { requests: BookingRow[] }) {
  const [rows] = useState(requests);
  const [selectedId, setSelectedId] = useState(requests[0]?.id);
  const selected = rows.find((r) => r.id === selectedId);

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
            <tr><Th>REF</Th><Th>COMPANY</Th><Th>ROUTE</Th><Th right>SUBMITTED</Th></tr>
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
                <Td right>{r.submitted}</Td>
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

          <p className="mt-5 text-xs text-muted">
            Handled by email — reply on the booking notification to correspond with the customer.
          </p>
        </div>
      )}
    </Card>
  );
}
