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

  // When subscription status is loaded and feature is locked
  if (sub !== undefined && sub?.plan?.features?.canUseCustomBranding === false) {
    return (
      <div className="min-h-screen grid place-items-center bg-radial from-background via-muted/30 to-muted/60 p-4">
        <div className="max-w-xl w-full space-y-4">
          <Link href={`/app/${orgSlug}/documents`}>
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 mb-2 text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="size-4" aria-hidden="true" />
              Back to Documents & Certificates
            </Button>
          </Link>
          <div className="relative rounded-2xl border border-border/80 bg-card p-1 shadow-xl">
            <FeaturePaywall
              orgSlug={orgSlug}
              badgeText="PRO STUDIO"
              title="Certificate Studio is Locked"
              description="Visual drag-and-drop certificate designing, custom typography, logo uploads, and automated tabulation token injection require an active Pro subscription or approval from your administrator."
              features={[
                "Full visual drag & drop canvas studio",
                "Decorative certificate borders & signature blocks",
                "Custom logo & graphic asset cloud storage",
                "Dynamic tabulation token replacement & font controls",
                "High-resolution batch certificate PDF generator",
              ]}
              icon={Award}
              actionText="Upgrade to Pro"
            />
          </div>
        </div>
      </div>
    );
  }

  return <EditorShell orgSlug={orgSlug} templateId={templateId as Id<"documentTemplates">} />;
}
