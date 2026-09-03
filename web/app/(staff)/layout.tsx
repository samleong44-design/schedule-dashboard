import Link from "next/link";
import Image from "next/image";
import { NavLinks } from "@/components/nav-links";
import { SignOutButton } from "@/components/sign-out";
import { getProfile } from "@/lib/queries";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// Staff/Admin shell per docs/ui-guide.md.
export default async function StaffLayout({ children }: LayoutProps<"/">) {
  const profile = await getProfile();
  const supabase = await createClient();
  const { count } = await supabase
    .from("booking_requests")
    .select("id", { count: "exact", head: true })
    .eq("status", "new");

  const roleLabel = profile ? profile.role[0].toUpperCase() + profile.role.slice(1) : "";

  return (
    <div className="flex min-h-screen">
      <aside className="fixed inset-y-0 flex w-56 flex-col border-r border-line bg-white">
        <Link href="/dashboard" className="px-5 py-4 text-sm font-bold tracking-tight text-foreground">
          Schedule Console
        </Link>
        <NavLinks pendingCount={count ?? 0} />
        <div className="mt-auto flex items-center justify-between border-t border-line px-5 py-3">
          <span className="text-xs text-muted">
            {profile?.full_name ?? profile?.email ?? "—"} · {roleLabel}
          </span>
          <SignOutButton />
        </div>
      </aside>
      <div className="ml-56 flex flex-1 flex-col">
        <header className="flex h-14 items-center justify-end border-b border-line bg-white px-6">
          <Image src="/logo.png" alt="YAGO" width={110} height={36} priority className="h-9 w-auto" style={{ width: "auto" }} />
        </header>
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
