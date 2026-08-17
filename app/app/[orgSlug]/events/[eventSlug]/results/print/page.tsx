"use client";

import { use } from "react";
import { useQuery } from "convex/react";
import { EyeOff, Printer } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/tabulation/StateBlock";
import { Num } from "@/components/tabulation/Num";

export default function ResultsPrintPage({
  params,
}: {
  params: Promise<{ orgSlug: string; eventSlug: string }>;
}) {
  const { orgSlug, eventSlug } = use(params);
  const results = useQuery(api.results.eventResults, { orgSlug, eventSlug });
  const ev = useQuery(api.events.get, { orgSlug, eventSlug });
  const categories = useQuery(api.categories.list, { orgSlug, eventSlug });

  if (results === undefined || ev === undefined || categories === undefined) {
    return <TableSkeleton rows={6} cols={4} />;
  }
  if (results instanceof Error) {
    return <ErrorState message="Results are not available." />;
  }
  if (ev === null) return <EmptyState icon={EyeOff} title="Event not found" />;

  const categoryNames = new Map(categories.map((category) => [category._id, category.name]));
  const groups = new Map<Id<"categories">, typeof results.final>();
  for (const row of results.final) {
    const list = groups.get(row.categoryId) ?? [];
    list.push(row);
    groups.set(row.categoryId, list);
  }

  const startDate = ev.startDate ? new Date(ev.startDate).toLocaleDateString() : null;

  return (
    <div className="mx-auto max-w-3xl space-y-8 bg-white p-8 text-black print:p-0">
      <div className="flex items-center justify-between print:hidden">
        <h1 className="text-lg font-semibold">Print preview</h1>
        <Button onClick={() => window.print()}>
          <Printer aria-hidden className="size-4" />
          Print
        </Button>
      </div>

      <header className="space-y-1 border-b border-black/20 pb-4 text-center">
        <h1 className="text-2xl font-bold">{ev.name}</h1>
        {(ev.venue || startDate) && (
          <p className="text-sm">
            {[ev.venue, startDate].filter(Boolean).join(" · ")}
          </p>
        )}
        <p className="text-xs uppercase tracking-wide">Official Final Standings</p>
      </header>

      {results.final.length === 0 ? (
        <EmptyState icon={EyeOff} title="No published results yet" />
      ) : (
        [...groups.entries()].map(([categoryId, rows]) => (
          <section key={categoryId} className="space-y-2">
            <h2 className="text-base font-semibold">{categoryNames.get(categoryId) ?? "Category"}</h2>
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  <th className="border border-black/30 px-2 py-1 text-left">Rank</th>
                  <th className="border border-black/30 px-2 py-1 text-left">No.</th>
                  <th className="border border-black/30 px-2 py-1 text-left">Contestant</th>
                  <th className="border border-black/30 px-2 py-1 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.contestantId}>
                    <td className="border border-black/30 px-2 py-1"><Num value={row.rank} /></td>
                    <td className="border border-black/30 px-2 py-1">—</td>
                    <td className="border border-black/30 px-2 py-1 font-medium">{row.contestantName}</td>
                    <td className="border border-black/30 px-2 py-1 text-right">
                      <Num value={row.totalScore} precision={ev.decimalPrecision} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ))
      )}

      <footer className="grid grid-cols-2 gap-8 pt-12 text-xs">
        <div className="border-t border-black/50 pt-1">Tabulator — signature over printed name</div>
        <div className="border-t border-black/50 pt-1">Head judge — signature over printed name</div>
      </footer>
    </div>
  );
}
