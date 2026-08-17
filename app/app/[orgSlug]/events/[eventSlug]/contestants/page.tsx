"use client";

import { use, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { FileUp, Loader2, Plus, Trash2, UserRound } from "lucide-react";
import { EmptyState, TableSkeleton } from "@/components/tabulation/StateBlock";
import { toastMutationError } from "@/lib/convex-errors";
import { ImportContestantsDialog } from "@/components/tabulation/ImportContestantsDialog";

const STATUS_TONE: Record<string, string> = {
  active: "bg-success-muted text-success",
  scratched: "bg-warning-muted text-warning",
  disqualified: "bg-destructive/10 text-destructive",
};

export default function ContestantsPage({ params }: { params: Promise<{ orgSlug: string; eventSlug: string }> }) {
  const { orgSlug, eventSlug } = use(params);
  const list = useQuery(api.contestants.list, { orgSlug, eventSlug });
  const cats = useQuery(api.categories.list, { orgSlug, eventSlug });
  const add = useMutation(api.contestants.add);
  const remove = useMutation(api.contestants.remove);
  const [name, setName] = useState("");
  const [number, setNumber] = useState("");
  const [adding, setAdding] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const onError = (err: unknown) =>
    toastMutationError(err, {
      codeMessages: { LIMIT_EXCEEDED: "Contestant limit reached — upgrade your plan." },
    });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1.5">
            <CardTitle>Add a contestant</CardTitle>
            <CardDescription>Contestant numbers must be unique within the event.</CardDescription>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setImportOpen(true)}
          >
            <FileUp aria-hidden className="size-4" />
            Import CSV
          </Button>
        </CardHeader>
        <CardContent>
          <form
            className="flex flex-col gap-2 sm:flex-row"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!name.trim() || !number.trim()) return;
              setAdding(true);
              try {
                await add({ orgSlug, eventSlug, name, number: Number(number) });
                setName("");
                setNumber("");
                toast.success("Contestant added.");
              } catch (err) {
                onError(err);
              } finally {
                setAdding(false);
              }
            }}
          >
            <div className="w-full space-y-1.5 sm:w-24">
              <Label htmlFor="contestant-number" className="sr-only">
                Number
              </Label>
              <Input
                id="contestant-number"
                type="number"
                min={1}
                placeholder="No."
                value={number}
                onChange={(e) => setNumber(e.target.value)}
                disabled={adding}
              />
            </div>
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="contestant-name" className="sr-only">
                Contestant name
              </Label>
              <Input
                id="contestant-name"
                placeholder="Contestant name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={adding}
              />
            </div>
            <Button type="submit" disabled={adding || !name.trim() || !number.trim()} className="sm:w-auto">
              {adding ? <Loader2 aria-hidden className="animate-spin" /> : <Plus aria-hidden />}
              Add
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Contestants</CardTitle>
          <CardDescription>{list?.length ?? 0} contestants registered.</CardDescription>
        </CardHeader>
        <CardContent>
          {list === undefined ? (
            <TableSkeleton rows={5} cols={4} />
          ) : list.length === 0 ? (
            <EmptyState
              icon={UserRound}
              title="No contestants yet"
              hint="Add contestants above — they appear on judge score sheets after publishing."
            />
          ) : (
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50 hover:bg-muted/50">
                    <TableHead className="w-16 pl-4">No.</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="pr-4 text-right">
                      <span className="sr-only">Actions</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {list.map((c) => (
                    <TableRow key={c._id}>
                      <TableCell className="pl-4 font-mono font-medium">{c.number}</TableCell>
                      <TableCell className="font-medium">{c.name}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {cats?.find((x) => x._id === c.categoryId)?.name ?? "—"}
                      </TableCell>
                      <TableCell>
                        <Badge
                          className={`border-transparent capitalize ${STATUS_TONE[c.status] ?? "bg-muted text-muted-foreground"}`}
                        >
                          {c.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="pr-4 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-muted-foreground hover:text-destructive"
                          onClick={async () => {
                            try {
                              await remove({ orgSlug, eventSlug, contestantId: c._id });
                              toast.success("Contestant removed.");
                            } catch (err) {
                              onError(err);
                            }
                          }}
                        >
                          <Trash2 aria-hidden />
                          <span className="sr-only">Remove {c.name}</span>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <ImportContestantsDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        orgSlug={orgSlug}
        eventSlug={eventSlug}
      />
    </div>
  );
}
