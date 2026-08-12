"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

export default function PlatformPage() {
  const orgs = useQuery(api.platform.listAllOrgs, {});
  return (
    <main className="mx-auto max-w-4xl space-y-4 p-8">
      <h1 className="text-2xl font-semibold">Platform administration</h1>
      <table className="w-full text-sm">
        <thead className="text-left text-muted-foreground"><tr><th className="py-2">Name</th><th>Slug</th><th>Status</th></tr></thead>
        <tbody>
          {orgs?.map((o) => (
            <tr key={o._id} className="border-t"><td className="py-2">{o.name}</td><td>{o.slug}</td><td>{o.status}</td></tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
