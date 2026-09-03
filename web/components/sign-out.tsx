"use client";

import { createClient } from "@/lib/supabase/client";

export function SignOutButton() {
  const signOut = async () => {
    await createClient().auth.signOut();
    window.location.assign("/login");
  };
  return (
    <button type="button" onClick={signOut} className="text-xs text-muted hover:text-foreground">
      Sign out
    </button>
  );
}
