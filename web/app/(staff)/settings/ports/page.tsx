import { PageHeader } from "@/components/ui";
import { SettingsTabs } from "@/components/settings-tabs";
import { createClient } from "@/lib/supabase/server";
import { PortsClient } from "./ports-client";

export const dynamic = "force-dynamic";

export default async function PortsPage() {
  const supabase = await createClient();
  const { data: ports } = await supabase
    .from("ports")
    .select("id, unlocode, name, country, is_active")
    .order("name");

  return (
    <>
      <PageHeader title="Settings" />
      <SettingsTabs />
      <PortsClient ports={ports ?? []} />
    </>
  );
}
