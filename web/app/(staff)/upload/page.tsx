import { PageHeader } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { UploadClient } from "./upload-client";

export const dynamic = "force-dynamic";

export default async function UploadPage() {
  const supabase = await createClient();
  const { data: carriers } = await supabase
    .from("carriers")
    .select("id, name")
    .eq("is_active", true)
    .order("name");

  return (
    <>
      <PageHeader title="Upload schedule" />
      <UploadClient carriers={carriers ?? []} />
    </>
  );
}
