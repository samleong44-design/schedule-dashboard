"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/upload", label: "Upload Schedule" },
  { href: "/admin/bookings", label: "Booking Requests" },
  { href: "/admin/uploads", label: "Upload History" },
] as const;

const adminItems = [
  { href: "/admin/users", label: "Users" },
  { href: "/admin/audit", label: "Audit log" },
] as const;

export function NavLinks({ pendingCount = 0 }: { pendingCount?: number }) {
  const pathname = usePathname();

  const link = (href: string, label: string) => {
    const active = pathname.startsWith(href);
    return (
      <Link
        key={href}
        href={href}
        className={`flex items-center justify-between rounded-md px-3 py-1.5 text-sm ${active ? "bg-slate-100 font-medium" : "text-slate-600 hover:bg-slate-50"}`}
      >
        {label}
        {href === "/admin/bookings" && pendingCount > 0 && (
          <span className="rounded-full bg-accent px-1.5 text-xs font-semibold text-white">{pendingCount}</span>
        )}
      </Link>
    );
  };

  return (
    <nav className="flex flex-col gap-0.5 px-2 pt-2">
      {items.map((i) => link(i.href, i.label))}
      <div className="mt-3 mb-1 px-3 text-[11px] font-semibold tracking-wide text-faint">ADMIN</div>
      {adminItems.map((i) => link(i.href, i.label))}
    </nav>
  );
}
