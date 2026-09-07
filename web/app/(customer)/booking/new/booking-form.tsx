"use client";

import { useState } from "react";
import { Card, PrimaryButton } from "@/components/ui";

type ContainerType = { id: string; code: string; description: string | null };

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
  const [dg, setDg] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setPending(true);
    setError("");
    const data = Object.fromEntries(new FormData(e.currentTarget).entries());
    const res = await fetch("/api/booking-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...data, sailing_id: sailingId, is_dangerous_goods: dg }),
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
    <Card className="max-w-2xl p-5">
      {error && (
        <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}
      <form onSubmit={submit}>
        <div className={section}>CARGO</div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={label} htmlFor="container_type_id">Container type</label>
            <select id="container_type_id" name="container_type_id" required className={field}>
              {containerTypes.map((c) => (
                <option key={c.id} value={c.id}>{c.code}{c.description ? ` — ${c.description}` : ""}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={label} htmlFor="container_qty">Quantity</label>
            <input id="container_qty" name="container_qty" type="number" min={1} required defaultValue={1} className={field} />
          </div>
          <div className="col-span-2">
            <label className={label} htmlFor="commodity">Commodity description</label>
            <input id="commodity" name="commodity" required className={field} />
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

        <div className={section}>PARTIES</div>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className={label} htmlFor="shipper">Shipper</label>
            <input id="shipper" name="shipper" required className={field} />
          </div>
          <div>
            <label className={label} htmlFor="consignee">Consignee</label>
            <input id="consignee" name="consignee" className={field} />
          </div>
          <div>
            <label className={label} htmlFor="notify_party">Notify party</label>
            <input id="notify_party" name="notify_party" className={field} />
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
              <label className={label} htmlFor="dg_class">Class (required)</label>
              <input id="dg_class" name="dg_class" required placeholder="3" className={field} />
            </div>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={label} htmlFor="reefer_temp_c">Reefer temperature (°C, if any)</label>
            <input id="reefer_temp_c" name="reefer_temp_c" type="number" step="0.1" className={field} />
          </div>
          <div>
            <label className={label} htmlFor="oog_dimensions">Out-of-gauge dimensions (if any)</label>
            <input id="oog_dimensions" name="oog_dimensions" className={field} />
          </div>
          <div className="col-span-2">
            <label className={label} htmlFor="remarks">Remarks</label>
            <textarea id="remarks" name="remarks" rows={3} className={field} />
          </div>
        </div>

        <div className="mt-5 flex justify-end">
          <PrimaryButton>{pending ? "Submitting…" : "Submit request"}</PrimaryButton>
        </div>
      </form>
    </Card>
  );
}
