"use client";

import { use } from "react";
import { DocumentTemplateLibrary } from "@/components/documents/DocumentTemplateLibrary";

export default function DocumentsPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = use(params);
  return <DocumentTemplateLibrary orgSlug={orgSlug} />;
}
