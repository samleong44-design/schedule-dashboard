"use client";

import { useState } from "react";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  const signIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setPending(true);
    setError("");
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      // One generic message — never reveal whether the email exists.
      setError("Incorrect email or password.");
      setPending(false);
      return;
    }
    // Full navigation so the proxy sees the fresh session cookie.
    window.location.assign("/dashboard");
  };

  return (
    <div className="rounded-xl border border-line bg-white p-6 shadow-sm">
      <Image src="/logo.png" alt="YAGO" width={96} height={32} priority className="mb-5 h-8 w-auto" style={{ width: "auto" }} />
      <h1 className="mb-4 text-lg font-semibold">Sign in</h1>

      {error && (
        <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <form onSubmit={signIn}>
        <label className="mb-1 block text-sm font-semibold" htmlFor="email">Email</label>
        <input
          id="email"
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mb-3 w-full rounded-md border border-line px-3 py-2 text-sm"
        />
        <label className="mb-1 block text-sm font-semibold" htmlFor="password">Password</label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mb-4 w-full rounded-md border border-line px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-md bg-accent px-3.5 py-2 text-sm font-semibold text-white hover:bg-accent-hover disabled:opacity-60"
        >
          {pending ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
