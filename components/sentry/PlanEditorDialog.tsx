"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";
import { platformErrorMessage } from "@/components/platform/errors";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type PlanInput = {
  name: string;
  sortOrder: number;
  priceDollars: string;
  currency: string;
  billingInterval: "monthly" | "yearly";
  isActive: boolean;
  features: Doc<"plans">["features"];
  limits: Doc<"plans">["limits"];
};

const FEATURE_OPTIONS: { key: keyof Doc<"plans">["features"]; label: string }[] = [
  { key: "canCreateEvent", label: "Create events" },
  { key: "canExportReports", label: "Export reports" },
  { key: "canUseCustomBranding", label: "Custom branding" },
  { key: "canUseAuditLogs", label: "Audit logs" },
  { key: "canCreateTemplates", label: "Templates" },
  { key: "canUseAdvancedAnalytics", label: "Advanced analytics" },
  { key: "canUseApi", label: "API access" },
];

const LIMIT_OPTIONS: { key: keyof Doc<"plans">["limits"]; label: string }[] = [
  { key: "maxMembers", label: "Max members" },
  { key: "maxEvents", label: "Max events" },
  { key: "maxJudges", label: "Max judges" },
  { key: "maxContestants", label: "Max contestants" },
];

function emptyPlan(): PlanInput {
  return {
    name: "",
    sortOrder: 1,
    priceDollars: "",
    currency: "USD",
    billingInterval: "monthly",
    isActive: true,
    features: {
      canCreateEvent: true,
      canExportReports: false,
      canUseCustomBranding: false,
      canUseAuditLogs: false,
      canCreateTemplates: false,
      canUseAdvancedAnalytics: false,
      canUseApi: false,
    },
    limits: {
      maxMembers: 10,
      maxEvents: 5,
      maxJudges: 20,
      maxContestants: 100,
    },
  };
}

export function PlanEditorDialog({
  open,
  onOpenChange,
  token,
  plan,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string;
  plan: Doc<"plans"> | null;
}) {
  const [form, setForm] = useState<PlanInput>(() =>
    plan
      ? {
          name: plan.name,
          sortOrder: plan.sortOrder,
          priceDollars: plan.priceCents !== undefined ? String(plan.priceCents / 100) : "",
          currency: plan.currency ?? "USD",
          billingInterval: plan.billingInterval ?? "monthly",
          isActive: plan.isActive ?? true,
          features: plan.features,
          limits: plan.limits,
        }
      : emptyPlan(),
  );
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const savePlan = useMutation(api.superadmin.billing.savePlan);

  const handleOpenChange = (next: boolean) => {
    onOpenChange(next);
    if (!next) {
      setReason("");
    }
  };

  const submit = async () => {
    const priceCents = Math.round(parseFloat(form.priceDollars || "0") * 100);
    setBusy(true);
    try {
      await savePlan({
        token,
        planId: plan?._id,
        name: form.name,
        sortOrder: form.sortOrder,
        features: form.features,
        limits: form.limits,
        priceCents: Number.isFinite(priceCents) ? priceCents : 0,
        currency: form.currency,
        billingInterval: form.billingInterval,
        isActive: form.isActive,
        reason,
      });
      handleOpenChange(false);
      toast.success(plan ? "Plan updated" : "Plan created");
    } catch (error) {
      toast.error(platformErrorMessage(error, "The plan could not be saved."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{plan ? `Edit ${plan.name}` : "New plan"}</DialogTitle>
          <DialogDescription>
            Pricing and entitlements. Changes apply to future checks immediately.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="plan-name">Plan name</Label>
              <Input
                id="plan-name"
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="plan-sort">Sort order</Label>
              <Input
                id="plan-sort"
                type="number"
                value={form.sortOrder}
                onChange={(event) =>
                  setForm({ ...form, sortOrder: Math.max(0, Number(event.target.value) || 0) })
                }
              />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="plan-price">Price (USD)</Label>
              <Input
                id="plan-price"
                type="number"
                min="0"
                step="0.01"
                value={form.priceDollars}
                onChange={(event) => setForm({ ...form, priceDollars: event.target.value })}
                placeholder="0"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="plan-currency">Currency</Label>
              <Select
                value={form.currency}
                onValueChange={(value) => setForm({ ...form, currency: value ?? "USD" })}
              >
                <SelectTrigger id="plan-currency" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="USD">USD</SelectItem>
                  <SelectItem value="EUR">EUR</SelectItem>
                  <SelectItem value="PHP">PHP</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="plan-interval">Interval</Label>
              <Select
                value={form.billingInterval}
                onValueChange={(value) =>
                  setForm({ ...form, billingInterval: (value ?? "monthly") as "monthly" | "yearly" })
                }
              >
                <SelectTrigger id="plan-interval" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="yearly">Yearly</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Features</Label>
            <div className="grid gap-2 sm:grid-cols-2">
              {FEATURE_OPTIONS.map((option) => (
                <label
                  key={option.key}
                  className="flex cursor-pointer items-center gap-2 rounded-md border px-2.5 py-1.5 text-sm transition-colors hover:bg-muted/50"
                >
                  <input
                    type="checkbox"
                    checked={form.features[option.key]}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        features: { ...form.features, [option.key]: event.target.checked },
                      })
                    }
                    className="size-3.5 accent-primary"
                  />
                  {option.label}
                </label>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <Label>Limits</Label>
            <div className="grid gap-3 sm:grid-cols-2">
              {LIMIT_OPTIONS.map((option) => (
                <div key={option.key} className="space-y-2">
                  <Label htmlFor={`limit-${option.key}`}>{option.label}</Label>
                  <Input
                    id={`limit-${option.key}`}
                    type="number"
                    min="0"
                    value={form.limits[option.key]}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        limits: {
                          ...form.limits,
                          [option.key]: Math.max(0, Number(event.target.value) || 0),
                        },
                      })
                    }
                  />
                </div>
              ))}
            </div>
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(event) => setForm({ ...form, isActive: event.target.checked })}
              className="size-3.5 accent-primary"
            />
            Plan is active (can be assigned to organizations)
          </label>
          <div className="space-y-2">
            <Label htmlFor="plan-reason">Reason</Label>
            <Input
              id="plan-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Reason (recorded in the audit log)"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button disabled={busy || !form.name.trim() || !reason.trim()} onClick={() => void submit()}>
            {busy ? "Saving…" : plan ? "Save changes" : "Create plan"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}