"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    setPending(true);
    setError("");
    const supabase = createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setPending(false);
    if (error) {
      // Our failure (rate limit, config) — not "email not found"; Supabase
      // doesn't reveal that and neither do we.
      setError("Could not send the reset email. Try again in a minute.");
      return;
    }
    setSent(true);
  };

  return (
    <div className="rounded-xl border border-line bg-white p-6 shadow-sm">
      <Image src="/logo.png" alt="YAGO" width={96} height={32} priority className="mb-5 h-8 w-auto" style={{ width: "auto" }} />

      {sent ? (
        <>
          <h1 className="mb-2 text-lg font-semibold">Check your email</h1>
          <p className="mb-4 text-sm text-muted">
            If that address has an account, a reset link is on its way.
          </p>
          <Link href="/login" className="text-sm text-accent">← Back to sign in</Link>
        </>
      ) : (
        <>
          <h1 className="mb-1 text-lg font-semibold">Reset your password</h1>
          <p className="mb-4 text-sm text-muted">We&apos;ll email you a link.</p>

          {error && (
            <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          <form onSubmit={send}>
            <label className="mb-1 block text-sm font-semibold" htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              autoComplete="username"
              required
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mb-4 w-full rounded-md border border-line px-3 py-2 text-sm"
            />
            <button
              type="submit"
              disabled={pending}
              className="w-full rounded-md bg-accent px-3.5 py-2 text-sm font-semibold text-white hover:bg-accent-hover disabled:opacity-60"
            >
              {pending ? "Sending…" : "Send reset link"}
            </button>
          </form>
          <div className="mt-4 text-center">
            <Link href="/login" className="text-sm text-muted hover:text-foreground">← Back to sign in</Link>
          </div>
        </>
      )}
    </div>
  );
}
