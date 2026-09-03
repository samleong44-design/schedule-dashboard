import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { getSailings, getKpis } from "@/lib/queries";
import { DashboardClient } from "./dashboard-client";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [sailings, kpis] = await Promise.all([getSailings(), getKpis()]);

  return (
    <>
      <PageHeader
        title="Dashboard"
        action={
          <Link href="/upload" className="rounded-md bg-accent px-3.5 py-1.5 text-sm font-semibold text-white hover:bg-accent-hover">
            Upload schedule
          </Link>
        }
      />
      <DashboardClient sailings={sailings} kpis={kpis} />
    </>
  );
}
