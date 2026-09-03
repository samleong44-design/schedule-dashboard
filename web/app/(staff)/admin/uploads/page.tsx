import Link from "next/link";
import { Card, EmptyState, PageHeader, StatusBadge, Th, Td, type BadgeTone } from "@/components/ui";
import { getUploadBatches } from "@/lib/queries";

export const dynamic = "force-dynamic";

const statusTone: Record<string, BadgeTone> = {
  parsing: "neutral",
  awaiting_confirm: "progress",
  committed: "success",
  failed: "destructive",
};

const statusLabel: Record<string, string> = {
  parsing: "Parsing",
  awaiting_confirm: "Awaiting confirm",
  committed: "Committed",
  failed: "Failed",
};

// Read-only record — no rollback in v1 (docs/07-admin.md). The one action is
// downloading the original file; correction = re-upload the correct file.
export default async function UploadHistoryPage() {
  const batches = await getUploadBatches();

  return (
    <>
      <PageHeader
        title="Upload history"
        action={
          <Link href="/upload" className="rounded-md bg-accent px-3.5 py-1.5 text-sm font-semibold text-white hover:bg-accent-hover">
            + Upload
          </Link>
        }
      />
      <Card className="max-w-3xl">
        {batches.length === 0 ? (
          <EmptyState
            message="No uploads yet."
            action={<Link href="/upload" className="text-sm font-medium text-accent">Upload schedule →</Link>}
          />
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <Th>UPLOADED</Th><Th>CARRIER</Th><Th>FILE</Th><Th>BY</Th>
                <Th right>+</Th><Th right>~</Th><Th right>−</Th><Th>STATUS</Th><Th />
              </tr>
            </thead>
            <tbody>
              {batches.map((b) => (
                <tr key={b.id} className="hover:bg-slate-50">
                  <Td>{b.uploadedAt}</Td>
                  <Td>{b.carrier}</Td>
                  <Td className="font-mono text-xs">{b.file}</Td>
                  <Td>{b.by}</Td>
                  <Td right>{b.inserted}</Td>
                  <Td right>{b.updated}</Td>
                  <Td right className={b.removed > 50 ? "font-bold text-red-600" : ""}>{b.removed}</Td>
                  <Td><StatusBadge tone={statusTone[b.status] ?? "neutral"}>{statusLabel[b.status] ?? b.status}</StatusBadge></Td>
                  <Td right>
                    <span title="Download original file" className="text-accent">⤓</span>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="border-t border-line px-4 py-3 text-sm text-muted">
          To correct an upload, upload the carrier&apos;s correct file again — it replaces that carrier&apos;s schedule.{" "}
          <Link href="/upload" className="text-accent">Upload schedule →</Link>
        </div>
      </Card>
    </>
  );
}
