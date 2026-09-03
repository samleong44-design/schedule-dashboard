import { getUsers } from "@/lib/queries";
import { UsersClient } from "./users-client";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const users = await getUsers();
  return <UsersClient users={users} />;
}
