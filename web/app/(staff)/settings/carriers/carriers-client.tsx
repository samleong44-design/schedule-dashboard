"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, PrimaryButton, StatusBadge, Th, Td } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";

type Carrier = {
  id: string;
  name: string;
  scac: string | null;
  is_active: boolean;
};

export function CarriersClient({ carriers }: { carriers: Carrier[] }) {
  const [name, setName] = useState("");
  const [scac, setScac] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const router = useRouter();

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    setPending(true);
    setError("");
    const supabase = createClient();
    const { error } = await supabase
      .from("carriers")
      .insert({ name: name.trim(), scac: scac.trim().toUpperCase() || null });
    setPending(false);
    if (error) {
      setError(
        error.code === "23505" ? `${name.trim()} already exists.` : error.message,
      );
      return;
    }
    setName("");
    setScac("");
    router.refresh();
  };

  const setActive = async (c: Carrier, active: boolean) => {
    const supabase = createClient();
    const { error } = await supabase.from("carriers").update({ is_active: active }).eq("id", c.id);
    if (error) setError(error.message);
    else router.refresh();
  };

  return (
    <>
      <Card className="mb-4 max-w-2xl p-4">
        <div className="mb-2 text-sm font-semibold">Add carrier</div>
        {error && (
          <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}
        <form onSubmit={add} className="flex items-end gap-3">
          <div className="flex-1">
            <label className="mb-1 block text-xs font-semibold text-muted" htmlFor="c-name">Carrier name</label>
            <input id="c-name" required value={name} onChange={(e) => setName(e.target.value)}
              placeholder="Wan Hai"
              className="w-full rounded-md border border-line px-2.5 py-1.5 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted" htmlFor="c-scac">SCAC (optional)</label>
            <input id="c-scac" value={scac} onChange={(e) => setScac(e.target.value)}
              placeholder="WHLC" maxLength={4}
              className="w-28 rounded-md border border-line px-2.5 py-1.5 font-mono text-sm uppercase" />
          </div>
          <PrimaryButton type="submit">{pending ? "Adding…" : "Add carrier"}</PrimaryButton>
        </form>
      </Card>

      <Card className="max-w-2xl">
        <table className="w-full border-collapse">
          <thead>
            <tr><Th>NAME</Th><Th>SCAC</Th><Th>STATUS</Th><Th /></tr>
          </thead>
          <tbody>
            {carriers.map((c) => (
              <tr key={c.id} className={c.is_active ? "" : "text-faint"}>
                <Td>{c.name}</Td>
                <Td className="font-mono text-xs">{c.scac ?? "—"}</Td>
                <Td>
                  <StatusBadge tone={c.is_active ? "success" : "destructive"}>
                    {c.is_active ? "Active" : "Inactive"}
                  </StatusBadge>
                </Td>
                <Td right>
                  <button
                    type="button"
                    onClick={() => setActive(c, !c.is_active)}
                    className="text-xs text-accent hover:text-accent-hover"
                  >
                    {c.is_active ? "Deactivate" : "Reactivate"}
                  </button>
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="border-t border-line px-4 py-2.5 text-xs text-muted">
          Deactivating hides a carrier from the upload dropdown; its published sailings stay.
        </div>
      </Card>
    </>
  );
}
