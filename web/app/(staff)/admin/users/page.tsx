import { getUsers } from "@/lib/queries";
import { createClient } from "@/lib/supabase/server";
import { UsersClient } from "./users-client";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const supabase = await createClient();
  const [users, { data: companies }] = await Promise.all([
    getUsers(),
    supabase.from("customer_companies").select("id, name").eq("is_active", true).order("name"),
  ]);
  return <UsersClient users={users} companies={companies ?? []} />;
}
