"use client";

import { use, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, Plus, Tags, Trash2 } from "lucide-react";
import { EmptyState, TableSkeleton } from "@/components/tabulation/StateBlock";
import { toastMutationError } from "@/lib/convex-errors";

export default function CategoriesPage({ params }: { params: Promise<{ orgSlug: string; eventSlug: string }> }) {
  const { orgSlug, eventSlug } = use(params);
  const cats = useQuery(api.categories.list, { orgSlug, eventSlug });
  const add = useMutation(api.categories.add);
  const remove = useMutation(api.categories.remove);
  const [name, setName] = useState("");
  const [adding, setAdding] = useState(false);

  const onError = (err: unknown) => toastMutationError(err);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Add a category</CardTitle>
          <CardDescription>
            Categories group contestants into divisions, e.g. by age or class.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="flex flex-col gap-2 sm:flex-row"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!name.trim()) return;
              setAdding(true);
              try {
                await add({ orgSlug, eventSlug, name });
                setName("");
                toast.success("Category added.");
              } catch (err) {
                onError(err);
              } finally {
                setAdding(false);
              }
            }}
          >
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="category-name" className="sr-only">
                Category name
              </Label>
              <Input
                id="category-name"
                placeholder="e.g. Senior Division"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={adding}
              />
            </div>
            <Button type="submit" disabled={adding || !name.trim()} className="sm:w-auto">
              {adding ? <Loader2 aria-hidden className="animate-spin" /> : <Plus aria-hidden />}
              Add category
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Categories</CardTitle>
          <CardDescription>{cats?.length ?? 0} categories in this event.</CardDescription>
        </CardHeader>
        <CardContent>
          {cats === undefined ? (
            <TableSkeleton rows={3} cols={1} />
          ) : cats.length === 0 ? (
            <EmptyState
              icon={Tags}
              title="No categories yet"
              hint="Add your first category above to organize contestants."
            />
          ) : (
            <ul className="divide-y rounded-lg border">
              {cats.map((c) => (
                <li key={c._id} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <Badge variant="outline" className="shrink-0 font-mono">
                      {c.order + 1}
                    </Badge>
                    <span className="truncate font-medium">{c.name}</span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="shrink-0 text-muted-foreground hover:text-destructive"
                    onClick={async () => {
                      try {
                        await remove({ orgSlug, eventSlug, categoryId: c._id });
                        toast.success("Category removed.");
                      } catch (err) {
                        onError(err);
                      }
                    }}
                  >
                    <Trash2 aria-hidden />
                    Remove
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
