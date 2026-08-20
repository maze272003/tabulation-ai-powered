"use client";

import { use } from "react";
import type { Id } from "@/convex/_generated/dataModel";
import { EditorShell } from "@/components/documents/editor/EditorShell";

export default function StudioPage({
  params,
}: {
  params: Promise<{ orgSlug: string; templateId: string }>;
}) {
  const { orgSlug, templateId } = use(params);
  return <EditorShell orgSlug={orgSlug} templateId={templateId as Id<"documentTemplates">} />;
}
