"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// Landing page for invite/recovery emails. Corporate mail scanners (Outlook
// SafeLinks) GET every link on delivery, which used to consume the one-time
// token. Here the token is only redeemed when the person clicks the button.
function ConfirmInner() {
  const params = useSearchParams();
  const tokenHash = params.get("token_hash") ?? "";
  const type = params.get("type") === "recovery" ? "recovery" : "invite";
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  const go = async () => {
    setPending(true);
    setError("");
    const supabase = createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (error) {
      setError("This link has expired or was already used. Please request a new one.");
      setPending(false);
      return;
    }
    window.location.assign("/reset-password");
  };

  return (
    <div className="rounded-xl border border-line bg-white p-6 shadow-sm">
      <Image src="/logo.png" alt="YAGO" width={96} height={32} priority className="mb-5 h-8 w-auto" style={{ width: "auto" }} />

      {!tokenHash ? (
        <>
          <h1 className="mb-2 text-lg font-semibold">Invalid link</h1>
          <p className="text-sm text-muted">This link is incomplete. Please use the link from your email.</p>
        </>
      ) : (
        <>
          <h1 className="mb-1 text-lg font-semibold">
            {type === "invite" ? "Accept your invitation" : "Reset your password"}
          </h1>
          <p className="mb-4 text-sm text-muted">
            Click below to continue and set your password.
          </p>

          {error && (
            <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error} <Link href="/forgot-password" className="text-accent">Request a new link →</Link>
            </div>
          )}

          <button
            type="button"
            onClick={go}
            disabled={pending}
            className="w-full rounded-md bg-accent px-3.5 py-2 text-sm font-semibold text-white hover:bg-accent-hover disabled:opacity-60"
          >
            {pending ? "Checking…" : "Continue"}
          </button>
        </>
      )}
    </div>
  );
}

export default function ConfirmPage() {
  return (
    <Suspense>
      <ConfirmInner />
    </Suspense>
  );
}
