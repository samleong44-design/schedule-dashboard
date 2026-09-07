"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function DeleteLaneButton({ id }: { id: string }) {
  const router = useRouter();
  const del = async () => {
    await createClient().from("saved_searches").delete().eq("id", id);
    router.refresh();
  };
  return (
    <button type="button" onClick={del} className="text-xs text-muted hover:text-red-600">
      Delete
    </button>
  );
}
