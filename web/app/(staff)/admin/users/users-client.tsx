"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, PrimaryButton, GhostButton, StatusBadge, Th, Td, type BadgeTone } from "@/components/ui";

type UserRow = {
  id: string;
  name: string;
  email: string;
  role: string;
  company?: string;
  status: "invited" | "active" | "deactivated";
};

type Company = { id: string; name: string };

const statusTone: Record<UserRow["status"], BadgeTone> = {
  invited: "neutral",
  active: "success",
  deactivated: "destructive",
};

export function UsersClient({ users, companies }: { users: UserRow[]; companies: Company[] }) {
  const [inviteOpen, setInviteOpen] = useState(false);
  const [role, setRole] = useState("customer");
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [newCompany, setNewCompany] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pending, setPending] = useState(false);
  const router = useRouter();

  const invite = async () => {
    setPending(true);
    setError("");
    const res = await fetch("/api/invite-user", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        full_name: fullName,
        role,
        customer_company_id: companyId || null,
        new_company_name: companyId ? "" : newCompany,
      }),
    });
    const body = await res.json();
    setPending(false);
    if (!res.ok) {
      setError(body.error ?? "Invite failed");
      return;
    }
    setNotice(`Invitation sent to ${email}. They set their own password from the email link.`);
    setInviteOpen(false);
    setEmail("");
    setFullName("");
    setCompanyId("");
    setNewCompany("");
    router.refresh();
  };

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Users</h1>
        <PrimaryButton onClick={() => { setInviteOpen(true); setNotice(""); }}>+ New user</PrimaryButton>
      </div>

      {notice && (
        <div className="mb-3 max-w-3xl rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {notice}
        </div>
      )}

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

            {error && (
              <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </div>
            )}

            <label className="mb-1 block text-sm font-semibold" htmlFor="inv-email">Email</label>
            <input id="inv-email" type="email" placeholder="name@company.com" value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mb-3 w-full rounded-md border border-line px-3 py-2 text-sm" />

            <label className="mb-1 block text-sm font-semibold" htmlFor="inv-name">Full name</label>
            <input id="inv-name" value={fullName} onChange={(e) => setFullName(e.target.value)}
              className="mb-3 w-full rounded-md border border-line px-3 py-2 text-sm" />

            <label className="mb-1 block text-sm font-semibold" htmlFor="inv-role">Role</label>
            <select id="inv-role" value={role} onChange={(e) => setRole(e.target.value)}
              className="mb-3 w-full rounded-md border border-line px-3 py-2 text-sm">
              <option value="admin">Admin</option>
              <option value="staff">Staff</option>
              <option value="customer">Customer</option>
            </select>

            {role === "customer" && (
              <>
                <label className="mb-1 block text-sm font-semibold" htmlFor="inv-company">Company</label>
                <select id="inv-company" value={companyId} onChange={(e) => setCompanyId(e.target.value)}
                  className="mb-2 w-full rounded-md border border-line px-3 py-2 text-sm">
                  <option value="">— New company —</option>
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                {!companyId && (
                  <input placeholder="New company name" value={newCompany}
                    onChange={(e) => setNewCompany(e.target.value)}
                    className="mb-3 w-full rounded-md border border-line px-3 py-2 text-sm" />
                )}
              </>
            )}

            <p className="mb-4 text-xs text-muted">An invitation email will be sent. They set their own password.</p>

            <div className="flex justify-end gap-2">
              <GhostButton onClick={() => setInviteOpen(false)}>Cancel</GhostButton>
              <PrimaryButton onClick={invite}>{pending ? "Sending…" : "Send invite"}</PrimaryButton>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
