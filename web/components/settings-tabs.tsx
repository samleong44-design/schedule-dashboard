"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { href: "/settings/ports", label: "Ports" },
  { href: "/settings/carriers", label: "Carriers" },
] as const;

export function SettingsTabs() {
  const pathname = usePathname();
  return (
    <div className="mb-4 flex gap-1 border-b border-line">
      {tabs.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          className={`border-b-2 px-3 py-2 text-sm font-medium ${
            pathname.startsWith(t.href)
              ? "border-accent text-accent"
              : "border-transparent text-muted hover:text-foreground"
          }`}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}
