"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CheckCircle2, Lock, Sparkles, Zap, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface FeaturePaywallProps {
  orgSlug: string;
  badgeText?: string;
  title: string;
  description: string;
  features: readonly string[];
  icon?: LucideIcon;
  actionText?: string;
  className?: string;
  compact?: boolean;
}

export function FeaturePaywall({
  orgSlug,
  badgeText = "PRO FEATURE",
  title,
  description,
  features,
  icon: Icon = Sparkles,
  actionText = "Upgrade Subscription",
  className,
  compact = false,
}: FeaturePaywallProps) {
  const billingHref = `/app/${orgSlug}/billing`;

  if (compact) {
    return (
      <div
        className={cn(
          "flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 rounded-xl border border-primary/20 bg-primary/5 p-4 backdrop-blur-xs",
          className,
        )}
      >
        <div className="flex items-center gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary shadow-xs">
            <Icon className="size-5" aria-hidden="true" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <Badge className="bg-primary/20 text-primary border-primary/30 text-[10px] font-bold">
                {badgeText}
              </Badge>
              <h4 className="font-heading text-sm font-semibold text-foreground">{title}</h4>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
          </div>
        </div>
        <Link href={billingHref} className="shrink-0 w-full sm:w-auto">
          <Button size="sm" className="w-full sm:w-auto gap-1.5 shadow-sm">
            <Zap className="size-3.5" aria-hidden="true" />
            {actionText}
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <Card
      className={cn(
        "relative overflow-hidden border-primary/30 bg-gradient-to-br from-card via-card to-primary/5 shadow-md",
        className,
      )}
    >
      <div className="absolute right-0 top-0 -mt-8 -mr-8 size-32 rounded-full bg-primary/10 blur-2xl pointer-events-none" />
      <CardContent className="p-6">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="space-y-3 max-w-xl">
            <div className="flex items-center gap-2">
              <div className="flex size-8 items-center justify-center rounded-lg bg-primary/15 text-primary">
                <Icon className="size-4.5" aria-hidden="true" />
              </div>
              <Badge className="bg-primary text-primary-foreground text-[10px] font-bold tracking-wide">
                {badgeText}
              </Badge>
            </div>

            <div>
              <h3 className="font-heading text-lg font-bold tracking-tight text-foreground">
                {title}
              </h3>
              <p className="text-xs sm:text-sm text-muted-foreground mt-1 leading-relaxed">
                {description}
              </p>
            </div>

            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
              {features.map((item) => (
                <li key={item} className="flex items-center gap-2 text-xs font-medium text-foreground">
                  <CheckCircle2 className="size-3.5 text-primary shrink-0" aria-hidden="true" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="flex flex-col gap-2.5 w-full md:w-auto shrink-0 md:min-w-[200px] pt-2 md:pt-0">
            <Link href={billingHref} className="w-full">
              <Button className="w-full font-semibold shadow-md shadow-primary/20 gap-1.5">
                <Zap className="size-4" aria-hidden="true" />
                {actionText}
              </Button>
            </Link>
            <p className="text-[11px] text-center text-muted-foreground">
              Instant activation via PayMongo
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export interface FeaturePaywallDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgSlug: string;
  badgeText?: string;
  title: string;
  description: string;
  features: readonly string[];
  icon?: LucideIcon;
  actionText?: string;
}

export function FeaturePaywallDialog({
  open,
  onOpenChange,
  orgSlug,
  badgeText = "PRO FEATURE",
  title,
  description,
  features,
  icon: Icon = Sparkles,
  actionText = "Upgrade Subscription",
}: FeaturePaywallDialogProps) {
  const billingHref = `/app/${orgSlug}/billing`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2 mb-1">
            <div className="flex size-7 items-center justify-center rounded-md bg-primary/15 text-primary">
              <Icon className="size-4" aria-hidden="true" />
            </div>
            <Badge className="bg-primary/20 text-primary border-primary/30 text-[10px] font-bold">
              {badgeText}
            </Badge>
          </div>
          <DialogTitle className="font-heading text-lg font-bold">{title}</DialogTitle>
          <DialogDescription className="text-xs leading-relaxed">{description}</DialogDescription>
        </DialogHeader>

        <div className="rounded-lg border bg-muted/40 p-3.5 my-2">
          <p className="text-xs font-semibold text-foreground mb-2">What you'll unlock:</p>
          <ul className="space-y-1.5">
            {features.map((item) => (
              <li key={item} className="flex items-center gap-2 text-xs text-foreground/90">
                <CheckCircle2 className="size-3.5 text-primary shrink-0" aria-hidden="true" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Maybe later
          </Button>
          <Link href={billingHref} className="w-full sm:w-auto">
            <Button size="sm" className="w-full gap-1.5 shadow-sm font-semibold">
              <Zap className="size-3.5" aria-hidden="true" />
              {actionText}
            </Button>
          </Link>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
