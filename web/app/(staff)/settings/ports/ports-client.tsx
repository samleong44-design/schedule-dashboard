"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, PrimaryButton, StatusBadge, Th, Td } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";

type Port = {
  id: string;
  unlocode: string;
  name: string;
  country: string | null;
  is_active: boolean;
};

export function PortsClient({ ports }: { ports: Port[] }) {
  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [unlocode, setUnlocode] = useState("");
  const [name, setName] = useState("");
  const [country, setCountry] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const router = useRouter();

  const visible = ports.filter(
    (p) =>
      (showInactive || p.is_active) &&
      (p.unlocode + " " + p.name + " " + (p.country ?? ""))
        .toLowerCase()
        .includes(search.trim().toLowerCase()),
  );

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    setPending(true);
    setError("");
    const code = unlocode.trim().toUpperCase();
    const supabase = createClient();
    const { error } = await supabase
      .from("ports")
      .insert({ unlocode: code, name: name.trim(), country: country.trim() || null });
    setPending(false);
    if (error) {
      setError(
        error.code === "23505"
          ? `${code} already exists — search for it in the list.`
          : error.message,
      );
      return;
    }
    setUnlocode("");
    setName("");
    setCountry("");
    router.refresh();
  };

  const setActive = async (p: Port, active: boolean) => {
    const supabase = createClient();
    const { error } = await supabase.from("ports").update({ is_active: active }).eq("id", p.id);
    if (error) setError(error.message);
    else router.refresh();
  };

  return (
    <>
      <Card className="mb-4 max-w-3xl p-4">
        <div className="mb-2 text-sm font-semibold">Add port</div>
        <p className="mb-3 text-xs text-muted">
          Use the name exactly as the carrier prints it in their schedule — parsing matches on this.
        </p>
        {error && (
          <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}
        <form onSubmit={add} className="flex items-end gap-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted" htmlFor="p-code">UN/LOCODE</label>
            <input id="p-code" required value={unlocode} onChange={(e) => setUnlocode(e.target.value)}
              placeholder="MYLPK" maxLength={6}
              className="w-28 rounded-md border border-line px-2.5 py-1.5 font-mono text-sm uppercase" />
          </div>
          <div className="flex-1">
            <label className="mb-1 block text-xs font-semibold text-muted" htmlFor="p-name">Port name</label>
            <input id="p-name" required value={name} onChange={(e) => setName(e.target.value)}
              placeholder="Port Klang North Port"
              className="w-full rounded-md border border-line px-2.5 py-1.5 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted" htmlFor="p-country">Country</label>
            <input id="p-country" value={country} onChange={(e) => setCountry(e.target.value)}
              placeholder="Malaysia"
              className="w-40 rounded-md border border-line px-2.5 py-1.5 text-sm" />
          </div>
          <PrimaryButton type="submit">{pending ? "Adding…" : "Add port"}</PrimaryButton>
        </form>
      </Card>

      <Card className="max-w-3xl">
        <div className="flex items-center gap-3 border-b border-line px-4 py-2.5">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search ports…"
            className="w-64 rounded-md border border-line px-2.5 py-1.5 text-sm"
          />
          <label className="flex items-center gap-1.5 text-sm text-muted">
            <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
            Show inactive
          </label>
          <div className="ml-auto text-xs text-muted">{visible.length} of {ports.length}</div>
        </div>
        <table className="w-full border-collapse">
          <thead>
            <tr><Th>UN/LOCODE</Th><Th>NAME</Th><Th>COUNTRY</Th><Th>STATUS</Th><Th /></tr>
          </thead>
          <tbody>
            {visible.map((p) => (
              <tr key={p.id} className={p.is_active ? "" : "text-faint"}>
                <Td className="font-mono text-xs">{p.unlocode}</Td>
                <Td>{p.name}</Td>
                <Td>{p.country ?? "—"}</Td>
                <Td>
                  <StatusBadge tone={p.is_active ? "success" : "destructive"}>
                    {p.is_active ? "Active" : "Inactive"}
                  </StatusBadge>
                </Td>
                <Td right>
                  <button
                    type="button"
                    onClick={() => setActive(p, !p.is_active)}
                    className="text-xs text-accent hover:text-accent-hover"
                  >
                    {p.is_active ? "Deactivate" : "Reactivate"}
                  </button>
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}
