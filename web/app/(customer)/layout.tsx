import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import { getProfile } from "@/lib/queries";
import { SignOutButton } from "@/components/sign-out";

export const dynamic = "force-dynamic";

// Customer shell — minimal top nav. Nothing here hints that staff screens exist.
export default async function CustomerLayout({ children }: LayoutProps<"/">) {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "customer") redirect("/dashboard");

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex h-14 items-center gap-6 border-b border-line bg-white px-6">
        <Image src="/logo.png" alt="YAGO" width={96} height={32} priority className="h-8 w-auto" style={{ width: "auto" }} />
        <nav className="flex gap-4 text-sm">
          <Link href="/search" className="text-slate-700 hover:text-accent">Search</Link>
          <Link href="/requests" className="text-slate-700 hover:text-accent">My Requests</Link>
          <Link href="/saved" className="text-slate-700 hover:text-accent">Saved Lanes</Link>
        </nav>
        <div className="ml-auto flex items-center gap-3">
          <span className="text-xs text-muted">{profile.full_name ?? profile.email}</span>
          <SignOutButton />
        </div>
      </header>
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
