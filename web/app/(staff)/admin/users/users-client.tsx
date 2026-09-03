"use client";

import { useState } from "react";
import { Card, PrimaryButton, GhostButton, StatusBadge, Th, Td, type BadgeTone } from "@/components/ui";

type UserRow = {
  id: string;
  name: string;
  email: string;
  role: string;
  company?: string;
  status: "invited" | "active" | "deactivated";
};

const statusTone: Record<UserRow["status"], BadgeTone> = {
  invited: "neutral",
  active: "success",
  deactivated: "destructive",
};

export function UsersClient({ users }: { users: UserRow[] }) {
  const [inviteOpen, setInviteOpen] = useState(false);
  const [role, setRole] = useState("Customer");

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Users</h1>
        <PrimaryButton onClick={() => setInviteOpen(true)}>+ New user</PrimaryButton>
      </div>
      <Card className="max-w-3xl">
        <table className="w-full border-collapse">
          <thead>
            <tr><Th>NAME</Th><Th>EMAIL</Th><Th>ROLE</Th><Th>COMPANY</Th><Th>STATUS</Th></tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="hover:bg-slate-50">
                <Td>{u.name}</Td>
                <Td className="text-muted">{u.email}</Td>
                <Td>{u.role}</Td>
                <Td>{u.company ?? "—"}</Td>
                <Td><StatusBadge tone={statusTone[u.status]}>{u.status[0].toUpperCase() + u.status.slice(1)}</StatusBadge></Td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {inviteOpen && (
        <div className="fixed inset-0 z-10 flex items-center justify-center bg-slate-900/50 p-6">
          <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-2xl">
            <div className="mb-4 text-base font-semibold">Invite user</div>

            <label className="mb-1 block text-sm font-semibold" htmlFor="inv-email">Email</label>
            <input id="inv-email" type="email" placeholder="name@company.com"
              className="mb-3 w-full rounded-md border border-line px-3 py-2 text-sm" />

            <label className="mb-1 block text-sm font-semibold" htmlFor="inv-name">Full name</label>
            <input id="inv-name" className="mb-3 w-full rounded-md border border-line px-3 py-2 text-sm" />

            <label className="mb-1 block text-sm font-semibold" htmlFor="inv-role">Role</label>
            <select id="inv-role" value={role} onChange={(e) => setRole(e.target.value)}
              className="mb-3 w-full rounded-md border border-line px-3 py-2 text-sm">
              <option>Admin</option>
              <option>Staff</option>
              <option>Customer</option>
            </select>

            {role === "Customer" && (
              <>
                <label className="mb-1 block text-sm font-semibold" htmlFor="inv-company">Company</label>
                <select id="inv-company" className="mb-1 w-full rounded-md border border-line px-3 py-2 text-sm">
                  <option>Select company</option>
                </select>
                <button type="button" className="mb-3 text-xs text-accent">+ New company</button>
              </>
            )}

            <p className="mb-4 text-xs text-muted">
              Sending invites requires the server secret key — add SUPABASE_SECRET_KEY to .env.local
              to enable this. Until then, create users from the Supabase dashboard.
            </p>

            <div className="flex justify-end gap-2">
              <GhostButton onClick={() => setInviteOpen(false)}>Cancel</GhostButton>
              <PrimaryButton onClick={() => setInviteOpen(false)}>Send invite</PrimaryButton>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
