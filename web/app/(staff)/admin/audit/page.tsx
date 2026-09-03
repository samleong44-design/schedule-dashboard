import { Card, EmptyState, PageHeader, Th, Td } from "@/components/ui";
import { getAuditLog } from "@/lib/queries";
import { Fragment } from "react";

export const dynamic = "force-dynamic";

export default async function AuditLogPage() {
  const entries = await getAuditLog();

  return (
    <>
      <PageHeader title="Audit log" />
      <Card className="max-w-3xl">
        {entries.length === 0 ? (
          <EmptyState message="No audit entries yet. Privileged actions will appear here." />
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr><Th>WHEN</Th><Th>WHO</Th><Th>ACTION</Th><Th>ENTITY</Th></tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <Fragment key={e.id}>
                  <tr>
                    <Td>{e.when}</Td>
                    <Td>{e.who}</Td>
                    <Td>{e.action}</Td>
                    <Td>{e.entity}</Td>
                  </tr>
                  {(e.before || e.after) && (
                    <tr>
                      <td colSpan={4} className="border-b border-line-soft px-2.5 pb-2">
                        <div className="rounded-md bg-slate-50 px-2.5 py-1.5 font-mono text-xs">
                          {e.before && <span className="text-faint line-through">{JSON.stringify(e.before)}</span>}
                          {e.before && e.after && " → "}
                          {e.after && <span className="font-semibold">{JSON.stringify(e.after)}</span>}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}
