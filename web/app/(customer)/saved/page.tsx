import Link from "next/link";
import { Card, EmptyState } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { DeleteLaneButton } from "./delete-lane-button";

export const dynamic = "force-dynamic";

export default async function SavedLanesPage() {
  const supabase = await createClient();
  const { data: lanes } = await supabase
    .from("saved_searches")
    .select("id, label, created_at")
    .order("created_at", { ascending: false });

  return (
    <>
      <h1 className="mb-4 text-2xl font-semibold">Saved lanes</h1>
      <Card className="max-w-2xl">
        {(lanes ?? []).length === 0 ? (
          <EmptyState
            message="No saved lanes yet — run a search and save it."
            action={<Link href="/search" className="text-sm font-medium text-accent">Search sailings →</Link>}
          />
        ) : (
          <div>
            {(lanes ?? []).map((l) => {
              // ponytail: lane stored as "POL → POD" label text; parse to re-run the search
              const [pol = "", pod = ""] = l.label.split(" → ");
              const href = `/search?pol=${encodeURIComponent(pol === "Anywhere" ? "" : pol)}&pod=${encodeURIComponent(pod === "Anywhere" ? "" : pod)}`;
              return (
                <div key={l.id} className="flex items-center justify-between border-b border-line-soft px-4 py-2.5 last:border-0">
                  <Link href={href} className="text-sm font-medium text-accent hover:text-accent-hover">
                    {l.label}
                  </Link>
                  <DeleteLaneButton id={l.id} />
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </>
  );
}
