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
        </nav>
        <div className="ml-auto flex items-center gap-3">
          <span className="text-xs text-muted">{profile.full_name ?? profile.email}</span>
          <SignOutButton />
        </div>
      </header>
      <main className="flex-1 p-6">{children}</main>
      <footer className="border-t border-line bg-white px-6 py-5">
        <div className="mx-auto flex max-w-4xl flex-wrap justify-between gap-6 text-xs text-muted">
          <div>
            <div className="mb-1 text-sm font-semibold text-foreground">YAGO AGENCY (M) SDN BHD</div>
            <div>No.11-B, Lorong Sentosa 4, Taman Bayu Tinggi</div>
            <div>41200 Klang, Selangor Darul Ehsan, Malaysia</div>
            <div className="mt-1">Tel: 603-33198686 · <a href="https://www.yago.com.my" target="_blank" rel="noreferrer" className="text-accent">www.yago.com.my</a></div>
          </div>
          <div>
            <div className="mb-1 text-sm font-semibold text-foreground">Contact our team</div>
            <div>Mailisa · <a href="mailto:cs@yago.com.my" className="text-accent">cs@yago.com.my</a></div>
            <div>Kate Lee · <a href="mailto:kate@yago.com.my" className="text-accent">kate@yago.com.my</a></div>
            <div>Nora · <a href="mailto:doc@yago.com.my" className="text-accent">doc@yago.com.my</a></div>
            <div>Ching Wei · <a href="mailto:chingwei@yago.com.my" className="text-accent">chingwei@yago.com.my</a></div>
            <div>Jace Kee · <a href="mailto:jace@yago.com.my" className="text-accent">jace@yago.com.my</a></div>
          </div>
        </div>
      </footer>
    </div>
  );
}
