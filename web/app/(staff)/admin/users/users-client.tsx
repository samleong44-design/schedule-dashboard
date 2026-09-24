"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, PrimaryButton, GhostButton, StatusBadge, Th, Td, type BadgeTone } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";

type UserRow = {
  id: string;
  name: string;
  email: string;
  role: string;
  company?: string;
  status: "invited" | "active" | "deactivated";
  canViewReports: boolean;
};

type Company = { id: string; name: string };

const statusTone: Record<UserRow["status"], BadgeTone> = {
  invited: "neutral",
  active: "success",
  deactivated: "destructive",
};

const genPassword = () => "Yago-" + Math.random().toString(16).slice(2, 10);

export function UsersClient({ users, companies }: { users: UserRow[]; companies: Company[] }) {
  const [rows, setRows] = useState(users);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [role, setRole] = useState("customer");
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [newCompany, setNewCompany] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [credentials, setCredentials] = useState<{ email: string; password: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, setPending] = useState(false);
  // Set-new-password dialog state
  const [resetFor, setResetFor] = useState<UserRow | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  const [resetError, setResetError] = useState("");
  const router = useRouter();

  const copyCredentials = async (creds: { email: string; password: string }) => {
    try {
      await navigator.clipboard.writeText(`Login: ${creds.email}\nPassword: ${creds.password}\nhttps://schedule.yago.com.my`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable — values stay visible on screen */
    }
  };

  const doSetPassword = async () => {
    if (!resetFor) return;
    setPending(true);
    setResetError("");
    const res = await fetch("/api/set-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: resetFor.id, password: resetPassword }),
    });
    const bodyJson = await res.json();
    setPending(false);
    if (!res.ok) {
      setResetError(bodyJson.error ?? "Failed to set password");
      return;
    }
    setCredentials({ email: bodyJson.email, password: bodyJson.password });
    setNotice("");
    setResetFor(null);
    setResetPassword("");
  };

  // Admin-only by RLS ("admin manages profiles").
  const setReportAccess = async (id: string, canView: boolean) => {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, canViewReports: canView } : r)));
    const supabase = createClient();
    const { error: err } = await supabase.from("profiles").update({ can_view_reports: canView }).eq("id", id);
    if (err) {
      setRows((rs) => rs.map((r) => (r.id === id ? { ...r, canViewReports: !canView } : r)));
      alert("Failed to update report access — try again.");
    }
  };

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
        password,
      }),
    });
    const body = await res.json();
    setPending(false);
    if (!res.ok) {
      setError(body.error ?? "Could not create the account");
      return;
    }
    setCredentials({ email, password: body.tempPassword });
    setNotice("");
    setInviteOpen(false);
    setEmail("");
    setFullName("");
    setCompanyId("");
    setNewCompany("");
    setPassword("");
    router.refresh();
  };

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Users</h1>
        <PrimaryButton onClick={() => { setInviteOpen(true); setNotice(""); setCredentials(null); setPassword(genPassword()); }}>
          + New user
        </PrimaryButton>
      </div>

      {notice && (
        <div className="mb-3 max-w-3xl rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {notice}
        </div>
      )}

      {credentials && (
        <div className="mb-3 max-w-3xl rounded-md border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          <div className="font-semibold">Login details for {credentials.email}</div>
          <div className="mt-1">
            Password: <span className="rounded bg-white px-2 py-0.5 font-mono font-semibold">{credentials.password}</span>
          </div>
          <div className="mt-2 flex items-center gap-3">
            <button
              type="button"
              onClick={() => copyCredentials(credentials)}
              className="rounded-md border border-emerald-300 bg-white px-2.5 py-1 text-xs font-medium hover:bg-emerald-100"
            >
              {copied ? "Copied ✓" : "Copy login details"}
            </button>
            <span className="text-xs text-emerald-800">
              Share these with them directly (e.g. WhatsApp). Shown once — it will not appear again.
            </span>
          </div>
        </div>
      )}

      <Card className="max-w-3xl">
        <table className="w-full border-collapse">
          <thead>
            <tr><Th>NAME</Th><Th>EMAIL</Th><Th>ROLE</Th><Th>COMPANY</Th><Th>STATUS</Th><Th>CLIENT REPORT</Th><Th>PASSWORD</Th></tr>
          </thead>
          <tbody>
            {rows.map((u) => (
              <tr key={u.id} className="hover:bg-slate-50">
                <Td>{u.name}</Td>
                <Td className="text-muted">{u.email}</Td>
                <Td>{u.role}</Td>
                <Td>{u.company ?? "—"}</Td>
                <Td><StatusBadge tone={statusTone[u.status]}>{u.status[0].toUpperCase() + u.status.slice(1)}</StatusBadge></Td>
                <Td>
                  {u.role === "Admin" ? (
                    <span className="text-xs text-muted">Always</span>
                  ) : u.role === "Staff" ? (
                    <input
                      type="checkbox"
                      aria-label={`Client report access for ${u.email}`}
                      checked={u.canViewReports}
                      onChange={(e) => setReportAccess(u.id, e.target.checked)}
                    />
                  ) : (
                    <span className="text-xs text-muted">—</span>
                  )}
                </Td>
                <Td>
                  <button
                    type="button"
                    onClick={() => { setResetFor(u); setResetPassword(genPassword()); setResetError(""); setCredentials(null); }}
                    className="rounded-md border border-line px-2 py-1 text-xs font-medium hover:bg-slate-50"
                  >
                    Set new password
                  </button>
                </Td>
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

            <label className="mb-1 block text-sm font-semibold" htmlFor="inv-password">Password</label>
            <input id="inv-password" value={password} minLength={8}
              onChange={(e) => setPassword(e.target.value)}
              className="mb-1 w-full rounded-md border border-line px-3 py-2 font-mono text-sm" />
            <p className="mb-4 text-xs text-muted">
              Keep the suggested one or type your own (min 8 characters). No email is sent —
              you share the login with them directly.
            </p>

            <div className="flex justify-end gap-2">
              <GhostButton onClick={() => setInviteOpen(false)}>Cancel</GhostButton>
              <PrimaryButton onClick={invite}>{pending ? "Creating…" : "Create account"}</PrimaryButton>
            </div>
          </div>
        </div>
      )}

      {resetFor && (
        <div className="fixed inset-0 z-10 flex items-center justify-center bg-slate-900/50 p-6">
          <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-2xl">
            <div className="mb-1 text-base font-semibold">Set new password</div>
            <p className="mb-4 text-sm text-muted">for <strong>{resetFor.email}</strong></p>

            {resetError && (
              <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {resetError}
              </div>
            )}

            <label className="mb-1 block text-sm font-semibold" htmlFor="reset-password">New password</label>
            <input id="reset-password" value={resetPassword} minLength={8}
              onChange={(e) => setResetPassword(e.target.value)}
              className="mb-1 w-full rounded-md border border-line px-3 py-2 font-mono text-sm" />
            <p className="mb-4 text-xs text-muted">
              Their old password stops working immediately. Share the new one with them directly.
            </p>

            <div className="flex justify-end gap-2">
              <GhostButton onClick={() => setResetFor(null)}>Cancel</GhostButton>
              <PrimaryButton onClick={doSetPassword}>{pending ? "Setting…" : "Set password"}</PrimaryButton>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
