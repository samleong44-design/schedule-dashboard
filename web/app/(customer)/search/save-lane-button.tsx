"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function SaveLaneButton({ pol, pod }: { pol: string; pod: string }) {
  const [state, setState] = useState<"idle" | "saved" | "error">("idle");
  if (!pol && !pod) return null;

  const save = async () => {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase.from("saved_searches").insert({
      user_id: user.id,
      label: `${pol || "Anywhere"} → ${pod || "Anywhere"}`,
      // Lane stored as free text via the label; port ids are not required for re-running.
      alerts_enabled: true,
    });
    setState(error ? "error" : "saved");
  };

  if (state === "saved") return <span className="text-xs text-emerald-700">Lane saved ✓</span>;
  return (
    <button type="button" onClick={save} className="text-xs font-medium text-accent hover:text-accent-hover">
      {state === "error" ? "Failed — retry?" : "Save lane"}
    </button>
  );
}
