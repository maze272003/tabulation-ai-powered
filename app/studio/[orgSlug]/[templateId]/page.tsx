"use client";

import { use } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { EditorShell } from "@/components/documents/editor/EditorShell";
import { FeaturePaywall } from "@/components/billing/FeaturePaywall";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Award } from "lucide-react";

export default function StudioPage({
  params,
}: {
  params: Promise<{ orgSlug: string; templateId: string }>;
}) {
  const { orgSlug, templateId } = use(params);
  const sub = useQuery(api.subscriptions.getForOrg, { orgSlug });

  if (sub !== undefined && sub?.plan?.features?.canUseCustomBranding === false) {
    return (
      <div className="min-h-screen grid place-items-center bg-muted/20 p-4">
        <div className="max-w-xl w-full space-y-4">
          <Link href={`/app/${orgSlug}/documents`}>
            <Button variant="ghost" size="sm" className="gap-1.5 mb-2 text-muted-foreground hover:text-foreground">
              <ArrowLeft className="size-4" aria-hidden="true" />
              Back to Documents & Certificates
            </Button>
          </Link>
          <FeaturePaywall
            orgSlug={orgSlug}
            badgeText="PRO FEATURE"
            title="Custom Certificate Studio is Locked"
            description="Visual drag-and-drop certificate designing, custom fonts, logo uploads, and token replacements require an active Pro subscription or approval from your administrator."
            features={[
              "Full visual canvas layout studio",
              "Custom logo & graphic asset storage",
              "Dynamic token replacement & font controls",
              "Print-ready batch certificate PDF generator",
            ]}
            icon={Award}
            actionText="Upgrade to Pro"
          />
        </div>
      </div>
    );
  }

  return <EditorShell orgSlug={orgSlug} templateId={templateId as Id<"documentTemplates">} />;
}
