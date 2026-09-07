import { PageHeader } from "@/components/ui";
import { SettingsTabs } from "@/components/settings-tabs";
import { createClient } from "@/lib/supabase/server";
import { CarriersClient } from "./carriers-client";

export const dynamic = "force-dynamic";

export default async function CarriersPage() {
  const supabase = await createClient();
  const { data: carriers } = await supabase
    .from("carriers")
    .select("id, name, scac, is_active")
    .order("name");

  return (
    <>
      <PageHeader title="Settings" />
      <SettingsTabs />
      <CarriersClient carriers={carriers ?? []} />
    </>
  );
}
