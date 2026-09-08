"use client";

import { useState } from "react";
import { Card, PrimaryButton } from "@/components/ui";

type ContainerType = { id: string; code: string; description: string | null };
type ContainerLine = { container_type_id: string; qty: number };

const field = "w-full rounded-md border border-line px-2.5 py-1.5 text-sm";
const label = "mb-1 block text-xs font-semibold text-muted";
const section = "mb-2 mt-4 text-[11px] font-semibold tracking-wide text-faint";

export function BookingForm({
  sailingId,
  containerTypes,
  contactName,
  contactEmail,
}: {
  sailingId: string;
  containerTypes: ContainerType[];
  contactName: string;
  contactEmail: string;
}) {
  const [lines, setLines] = useState<ContainerLine[]>([
    { container_type_id: containerTypes[0]?.id ?? "", qty: 1 },
  ]);
  const [dg, setDg] = useState(false);
  const [freight, setFreight] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  const setLine = (i: number, patch: Partial<ContainerLine>) =>
    setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!freight) {
      setError("Please choose freight prepaid or freight collect.");
      return;
    }
    const form = new FormData(e.currentTarget);
    const hsDigits = String(form.get("hs_code") ?? "").replace(/\D/g, "");
    if (hsDigits.length < 6) {
      setError("HS code must have at least 6 digits, e.g. 1234.56");
      return;
    }
    setPending(true);
    setError("");
    const data = Object.fromEntries(new FormData(e.currentTarget).entries());
    const res = await fetch("/api/booking-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...data,
        sailing_id: sailingId,
        is_dangerous_goods: dg,
        freight_term: freight,
        containers: lines,
      }),
    });
    const body = await res.json();
    if (!res.ok) {
      setError(body.error ?? "Submission failed — try again.");
      setPending(false);
      return;
    }
    window.location.replace(`/booking/confirmation?id=${body.id}`);
  };

  return (
    <Card className="p-5">
      {error && (
        <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}
      <form onSubmit={submit}>
        <div className={section}>CARGO</div>

        <label className={label}>Containers</label>
        {lines.map((l, i) => (
          <div key={i} className="mb-2 flex items-center gap-2">
            <input
              type="number"
              min={1}
              value={l.qty}
              onChange={(e) => setLine(i, { qty: Math.max(1, Number(e.target.value)) })}
              className="w-20 rounded-md border border-line px-2.5 py-1.5 text-sm"
              aria-label="Quantity"
            />
            <span className="text-sm text-muted">×</span>
            <select
              value={l.container_type_id}
              onChange={(e) => setLine(i, { container_type_id: e.target.value })}
              className="flex-1 rounded-md border border-line px-2.5 py-1.5 text-sm"
              aria-label="Container type"
            >
              {containerTypes.map((c) => (
                <option key={c.id} value={c.id}>{c.code}{c.description ? ` — ${c.description}` : ""}</option>
              ))}
            </select>
            {lines.length > 1 && (
              <button type="button" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}
                className="text-xs text-muted hover:text-red-600">
                Remove
              </button>
            )}
          </div>
        ))}
        <button
          type="button"
          onClick={() => setLines((ls) => [...ls, { container_type_id: containerTypes[0]?.id ?? "", qty: 1 }])}
          className="mb-3 text-xs font-medium text-accent hover:text-accent-hover"
        >
          + Add another container type
        </button>

        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className={label} htmlFor="commodity">Commodity description</label>
            <input id="commodity" name="commodity" required className={field} />
          </div>
          <div className="col-span-2">
            <label className={label} htmlFor="hs_code">HS code</label>
            <input id="hs_code" name="hs_code" required placeholder="e.g. 1234.56" className={field} />
            <p className="mt-0.5 text-[11px] text-muted">At least 6 digits</p>
          </div>
          <div>
            <label className={label} htmlFor="gross_weight_kg">Gross weight (kg)</label>
            <input id="gross_weight_kg" name="gross_weight_kg" type="number" min={1} step="0.1" required className={field} />
          </div>
          <div>
            <label className={label} htmlFor="cargo_ready_date">Cargo readiness date</label>
            <input id="cargo_ready_date" name="cargo_ready_date" type="date" required className={field} />
          </div>
        </div>

        <div className={section}>FREIGHT TERM</div>
        <div className="flex gap-6 text-sm">
          <label className="flex items-center gap-2">
            <input type="radio" name="freight_choice" checked={freight === "prepaid"} onChange={() => setFreight("prepaid")} />
            Freight prepaid
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" name="freight_choice" checked={freight === "collect"} onChange={() => setFreight("collect")} />
            Freight collect
          </label>
        </div>

        <div className={section}>PARTIES</div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={label} htmlFor="shipper">Shipper</label>
            <input id="shipper" name="shipper" required className={field} />
          </div>
          <div>
            <label className={label} htmlFor="consignee">Consignee</label>
            <input id="consignee" name="consignee" className={field} />
          </div>
          <div>
            <label className={label} htmlFor="contact_name">Contact person</label>
            <input id="contact_name" name="contact_name" required defaultValue={contactName} className={field} />
          </div>
          <div>
            <label className={label} htmlFor="contact_phone">Contact phone</label>
            <input id="contact_phone" name="contact_phone" required className={field} />
          </div>
          <div className="col-span-2">
            <label className={label} htmlFor="contact_email">Contact email</label>
            <input id="contact_email" name="contact_email" type="email" required defaultValue={contactEmail} className={field} />
          </div>
        </div>

        <div className={section}>SPECIAL HANDLING</div>
        <label className="mb-3 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={dg} onChange={(e) => setDg(e.target.checked)} />
          Dangerous goods
        </label>
        {dg && (
          <div className="mb-3 grid grid-cols-2 gap-3 rounded-md border border-red-200 bg-red-50 p-3">
            <div>
              <label className={label} htmlFor="un_number">UN number (required)</label>
              <input id="un_number" name="un_number" required placeholder="UN1203" className={field} />
            </div>
            <div>
              <label className={label} htmlFor="dg_class">IMCO number (required)</label>
              <input id="dg_class" name="dg_class" required placeholder="3" className={field} />
            </div>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={label} htmlFor="reefer_temp_c">Reefer temperature (°C, if any)</label>
            <input id="reefer_temp_c" name="reefer_temp_c" type="number" step="0.1" className={field} />
          </div>
          <div />
          <div className="col-span-2">
            <label className={label} htmlFor="remarks">Remarks</label>
            <textarea id="remarks" name="remarks" rows={3} className={field} />
          </div>
        </div>

        <div className="mt-5 flex justify-end">
          <PrimaryButton type="submit">{pending ? "Submitting…" : "Submit request"}</PrimaryButton>
        </div>
      </form>
    </Card>
  );
}
