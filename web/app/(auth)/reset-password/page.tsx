"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";

type State = "checking" | "ready" | "expired";

export default function ResetPasswordPage() {
  const [state, setState] = useState<State>("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    // The recovery link signs the user in via the URL; if no session appears,
    // the link was expired or already used.
    const supabase = createClient();
    const timer = setTimeout(async () => {
      const { data } = await supabase.auth.getSession();
      setState(data.session ? "ready" : "expired");
    }, 1000);
    return () => clearTimeout(timer);
  }, []);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setPending(true);
    setError("");
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setError(error.message);
      setPending(false);
      return;
    }
    window.location.assign("/dashboard");
  };

  return (
    <div className="rounded-xl border border-line bg-white p-6 shadow-sm">
      <Image src="/logo.png" alt="YAGO" width={96} height={32} priority className="mb-5 h-8 w-auto" style={{ width: "auto" }} />

      {state === "checking" && <p className="text-sm text-muted">Checking your link…</p>}

      {state === "expired" && (
        <>
          <h1 className="mb-2 text-lg font-semibold">Link expired</h1>
          <p className="mb-4 text-sm text-muted">
            This reset link has expired or was already used. Request a new one.
          </p>
          <Link href="/forgot-password" className="text-sm text-accent">Request a new link →</Link>
        </>
      )}

      {state === "ready" && (
        <>
          <h1 className="mb-4 text-lg font-semibold">Set a new password</h1>

          {error && (
            <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          <form onSubmit={save}>
            <label className="mb-1 block text-sm font-semibold" htmlFor="password">New password</label>
            <input
              id="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mb-1 w-full rounded-md border border-line px-3 py-2 text-sm"
            />
            <p className="mb-3 text-xs text-muted">At least 8 characters</p>

            <label className="mb-1 block text-sm font-semibold" htmlFor="confirm">Confirm password</label>
            <input
              id="confirm"
              type="password"
              autoComplete="new-password"
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="mb-4 w-full rounded-md border border-line px-3 py-2 text-sm"
            />

            <button
              type="submit"
              disabled={pending}
              className="w-full rounded-md bg-accent px-3.5 py-2 text-sm font-semibold text-white hover:bg-accent-hover disabled:opacity-60"
            >
              {pending ? "Saving…" : "Set password & sign in"}
            </button>
          </form>
        </>
      )}
    </div>
  );
}
