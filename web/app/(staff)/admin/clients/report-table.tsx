"use client";

import { Card, Th, Td } from "@/components/ui";

type Row = {
  company: string;
  requests: number;
  containers: number;
  lastSubmitted: string;
  activeDays: number;
  lastActive: string;
};

export function ClientReportTable({ rows, label }: { rows: Row[]; label: string }) {
  const exportCsv = () => {
    const header = ["Client", "Booking requests", "Containers", "Last submitted", "Active days", "Last active"];
    const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
    const lines = [
      header.join(","),
      ...rows.map((r) =>
        [r.company, String(r.requests), String(r.containers), r.lastSubmitted, String(r.activeDays), r.lastActive]
          .map(esc)
          .join(","),
      ),
    ];
    // ﻿ BOM so Excel opens it as UTF-8
    const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `client-report-${label.replace(" ", "-")}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <Card className="max-w-4xl">
      <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
        <div className="text-sm font-semibold">Client activity · {label}</div>
        <button
          type="button"
          onClick={exportCsv}
          className="rounded-md border border-line px-2.5 py-1.5 text-sm font-medium hover:bg-slate-50"
        >
          Export CSV
        </button>
      </div>
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <Th>CLIENT</Th>
            <Th right>REQUESTS</Th>
            <Th right>CONTAINERS</Th>
            <Th right>LAST SUBMITTED</Th>
            <Th right>ACTIVE DAYS</Th>
            <Th right>LAST ACTIVE</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.company}>
              <Td>{r.company}</Td>
              <Td right>{r.requests}</Td>
              <Td right>{r.containers}</Td>
              <Td right>{r.lastSubmitted}</Td>
              <Td right>{r.activeDays}</Td>
              <Td right>{r.lastActive}</Td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
