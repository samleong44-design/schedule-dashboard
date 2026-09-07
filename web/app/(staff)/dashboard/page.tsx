import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { getSailings, getKpis } from "@/lib/queries";
import { createClient } from "@/lib/supabase/server";
import { DashboardClient } from "./dashboard-client";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const supabase = await createClient();
  const [sailings, kpis, { data: ports }] = await Promise.all([
    getSailings(),
    getKpis(),
    supabase.from("ports").select("name").eq("is_active", true).order("name"),
  ]);
  const portNames = (ports ?? []).map((p) => p.name);

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
      <DashboardClient sailings={sailings} kpis={kpis} portNames={portNames} />
    </>
  );
}
