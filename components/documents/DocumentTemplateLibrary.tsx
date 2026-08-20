"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { isDocumentSpec, type DocumentSpec } from "@/convex/documents/spec";
import { toastMutationError } from "@/lib/convex-errors";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/tabulation/StateBlock";
import { ConfirmDialog } from "@/components/tabulation/ConfirmDialog";
import { GenerateCertificatesDialog } from "@/components/documents/GenerateCertificatesDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { Award, Copy, FilePlus2, Loader2, Pencil, Sparkles, Trash2 } from "lucide-react";

const BLANK_CERTIFICATE_SPEC: DocumentSpec = {
  version: 1,
  page: {
    preset: "A4",
    orientation: "portrait",
    margins: { top: 15, right: 15, bottom: 15, left: 15 },
    background: "#FFFFFF",
  },
  elements: [
    {
      type: "text",
      id: "title",
      name: "Heading",
      xMm: 15,
      yMm: 60,
      widthMm: 180,
      heightMm: 16,
      rotationDeg: 0,
      opacity: 1,
      locked: false,
      showOnAllPages: false,
      content: "CERTIFICATE",
      fontFamily: "Crimson Text",
      fontSizePt: 32,
      bold: true,
      italic: false,
      underline: false,
      align: "center",
      color: "#1F3A5F",
      lineHeight: 1.3,
      letterSpacingMm: 2,
    },
  ],
};

export function DocumentTemplateLibrary({ orgSlug }: { orgSlug: string }) {
  const router = useRouter();
  const templates = useQuery(api.documents.templates.list, { orgSlug, kind: "certificate" });
  const duplicate = useMutation(api.documents.templates.duplicate);
  const create = useMutation(api.documents.templates.create);
  const remove = useMutation(api.documents.templates.remove);
  const [busyId, setBusyId] = useState<Id<"documentTemplates"> | null>(null);
  const [creatingBlank, setCreatingBlank] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: Id<"documentTemplates">; name: string } | null>(null);
  const [generateTarget, setGenerateTarget] = useState<{
    _id: Id<"documentTemplates">;
    name: string;
    spec: DocumentSpec;
  } | null>(null);

  async function customize(templateId: Id<"documentTemplates">, name: string) {
    setBusyId(templateId);
    try {
      const result = await duplicate({ orgSlug, templateId, name: `${name} (copy)` });
      router.push(`/studio/${orgSlug}/${result.templateId}`);
    } catch (error) {
      toastMutationError(error, { fallback: "Could not create your copy." });
    } finally {
      setBusyId(null);
    }
  }

  async function createBlank() {
    setCreatingBlank(true);
    try {
      const result = await create({
        orgSlug,
        name: "Untitled certificate",
        kind: "certificate",
        spec: BLANK_CERTIFICATE_SPEC,
      });
      router.push(`/studio/${orgSlug}/${result.templateId}`);
    } catch (error) {
      toastMutationError(error, { fallback: "Could not create the template." });
      setCreatingBlank(false);
    }
  }

  function openGenerateDialog(template: Doc<"documentTemplates">) {
    if (!isDocumentSpec(template.spec)) return;
    setGenerateTarget({ _id: template._id, name: template.name, spec: template.spec });
  }

  async function removeTemplate(templateId: Id<"documentTemplates">) {
    setDeleting(true);
    try {
      await remove({ orgSlug, templateId });
      setDeleteTarget(null);
      toast.success("Template deleted.");
    } catch (error) {
      // Keep the dialog open so the failure is visible and retry is possible.
      toastMutationError(error, { fallback: "Delete failed." });
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Award}
        title="Documents & Certificates"
        description="Design reusable certificate templates with a drag-and-drop editor, then generate personalized PDFs."
        actions={
          <Button disabled={creatingBlank} onClick={() => void createBlank()}>
            {creatingBlank ? <Loader2 aria-hidden className="animate-spin" /> : <FilePlus2 aria-hidden />}
            New blank certificate
          </Button>
        }
      />

      {templates === undefined ? (
        <Card className="animate-pulse" aria-hidden>
          <CardContent className="space-y-2 py-6">
            <div className="h-5 w-1/3 rounded bg-muted" />
            <div className="h-4 w-2/3 rounded bg-muted" />
          </CardContent>
        </Card>
      ) : templates.length === 0 ? (
        <EmptyState
          icon={Award}
          title="No certificate templates"
          hint="Create a blank template or duplicate a system design."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {templates.map((template) => (
            <Card key={template._id} className="h-full">
              <CardContent className="flex h-full flex-col gap-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 font-medium">{template.name}</div>
                  {template.isSystem ? (
                    <Badge variant="secondary" className="shrink-0">
                      System
                    </Badge>
                  ) : null}
                </div>
                <p className="min-h-8 text-sm text-muted-foreground">
                  {template.description || "Custom certificate template"}
                </p>
                <div className="mt-auto flex flex-wrap gap-1">
                  {template.isSystem ? (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={busyId === template._id}
                        onClick={() => void customize(template._id, template.name)}
                      >
                        {busyId === template._id ? (
                          <Loader2 aria-hidden className="animate-spin" />
                        ) : (
                          <Pencil aria-hidden />
                        )}
                        Customize
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={!isDocumentSpec(template.spec)}
                        onClick={() => openGenerateDialog(template)}
                      >
                        <Sparkles aria-hidden />
                        Generate
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => router.push(`/studio/${orgSlug}/${template._id}`)}
                      >
                        <Pencil aria-hidden />
                        Edit
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={!isDocumentSpec(template.spec)}
                        onClick={() => openGenerateDialog(template)}
                      >
                        <Sparkles aria-hidden />
                        Generate
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={busyId === template._id}
                        onClick={() => void customize(template._id, template.name)}
                      >
                        {busyId === template._id ? (
                          <Loader2 aria-hidden className="animate-spin" />
                        ) : (
                          <Copy aria-hidden />
                        )}
                        Duplicate
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-muted-foreground hover:text-destructive"
                        onClick={() => setDeleteTarget({ id: template._id, name: template.name })}
                      >
                        <Trash2 aria-hidden />
                        <span className="sr-only">Delete</span>
                      </Button>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {deleteTarget ? (
        <ConfirmDialog
          open
          onOpenChange={(open) => {
            if (!open) setDeleteTarget(null);
          }}
          title={`Delete “${deleteTarget.name}”?`}
          description="This cannot be undone. Events already using generated PDFs are unaffected."
          confirmLabel="Delete"
          destructive
          busy={deleting}
          onConfirm={() => void removeTemplate(deleteTarget.id)}
        />
      ) : null}

      {generateTarget ? (
        <GenerateCertificatesDialog
          orgSlug={orgSlug}
          open
          onOpenChange={(nextOpen) => {
            if (!nextOpen) setGenerateTarget(null);
          }}
          template={generateTarget}
        />
      ) : null}
    </div>
  );
}
