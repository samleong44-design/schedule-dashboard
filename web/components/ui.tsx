import type { ReactNode } from "react";

// Semantic status colours — the single mapping from docs/ui-guide.md.
const badgeStyles = {
  neutral: "bg-slate-100 text-slate-700",
  progress: "bg-blue-50 text-blue-700",
  success: "bg-emerald-50 text-emerald-700",
  warning: "bg-amber-50 text-amber-700",
  destructive: "bg-red-50 text-red-700",
} as const;

export type BadgeTone = keyof typeof badgeStyles;

export function StatusBadge({ tone, children }: { tone: BadgeTone; children: ReactNode }) {
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${badgeStyles[tone]}`}>
      {children}
    </span>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-lg border border-line bg-white shadow-sm ${className}`}>
      {children}
    </div>
  );
}

export function PageHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="mb-4 flex items-center justify-between">
      <h1 className="text-2xl font-semibold">{title}</h1>
      {action}
    </div>
  );
}

export function Th({ children, right = false }: { children?: ReactNode; right?: boolean }) {
  return (
    <th
      className={`border-b border-line px-2.5 py-2 text-[11px] font-semibold tracking-wide text-faint ${right ? "text-right" : "text-left"}`}
    >
      {children}
    </th>
  );
}

export function Td({ children, right = false, className = "" }: { children?: ReactNode; right?: boolean; className?: string }) {
  return (
    <td
      className={`border-b border-line-soft px-2.5 py-2 text-sm ${right ? "text-right tabular-nums" : "text-left"} ${className}`}
    >
      {children}
    </td>
  );
}

export function PrimaryButton({ children, onClick, destructive = false, type = "button" }: { children: ReactNode; onClick?: () => void; destructive?: boolean; type?: "button" | "submit" }) {
  return (
    <button
      type={type}
      onClick={onClick}
      className={`rounded-md px-3.5 py-1.5 text-sm font-semibold text-white ${destructive ? "bg-red-600 hover:bg-red-700" : "bg-accent hover:bg-accent-hover"}`}
    >
      {children}
    </button>
  );
}

export function GhostButton({ children, onClick }: { children: ReactNode; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-md border border-line px-3.5 py-1.5 text-sm hover:bg-slate-50"
    >
      {children}
    </button>
  );
}

export function EmptyState({ message, action }: { message: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 py-14 text-sm text-muted">
      <p>{message}</p>
      {action}
    </div>
  );
}
