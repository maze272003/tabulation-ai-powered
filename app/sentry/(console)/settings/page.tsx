"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Settings, Wrench } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import { useSentrySession } from "@/components/sentry/SentrySession";
import { formatDateTime } from "@/components/platform/format";
import { platformErrorMessage } from "@/components/platform/errors";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/PageHeader";

export default function SentrySettingsPage() {
  const { token } = useSentrySession();
  const settings = useQuery(api.superadmin.settings.get, token ? { token } : "skip");
  const update = useMutation(api.superadmin.settings.update);
  const [busy, setBusy] = useState<"maintenanceMode" | "allowSignups" | null>(null);

  const toggleSetting = async (
    key: "maintenanceMode" | "allowSignups",
    current: boolean,
  ) => {
    if (!token) return;
    setBusy(key);
    try {
      await update({
        token,
        [key]: !current,
      });
      toast.success(
        key === "maintenanceMode"
          ? current
            ? "Maintenance mode disabled"
            : "Maintenance mode enabled"
          : current
            ? "Signups enabled"
            : "Signups disabled",
      );
    } catch (error) {
      toast.error(platformErrorMessage(error, "The setting could not be saved."));
    } finally {
      setBusy(null);
    }
  };

  if (settings === undefined) {
    return <PageHeader title="Settings" description="Loading platform settings…" />;
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Settings" description="Platform-wide operational toggles." />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Wrench aria-hidden className="size-4 text-muted-foreground" />
              Maintenance mode
            </CardTitle>
            <CardDescription>
              While enabled, the platform signals a maintenance state to users. Use it for
              deployments and incident response.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex items-center justify-between gap-4">
            <p className="text-sm">
              {settings.maintenanceMode ? (
                <span className="font-medium text-destructive">Maintenance mode is ON</span>
              ) : (
                <span className="font-medium">Maintenance mode is OFF</span>
              )}
            </p>
            <Button
              variant={settings.maintenanceMode ? "destructive" : "default"}
              size="sm"
              disabled={busy !== null}
              onClick={() => void toggleSetting("maintenanceMode", settings.maintenanceMode)}
            >
              {busy === "maintenanceMode"
                ? "Saving…"
                : settings.maintenanceMode
                  ? "Turn off"
                  : "Turn on"}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Settings aria-hidden className="size-4 text-muted-foreground" />
              New signups
            </CardTitle>
            <CardDescription>
              Control whether new accounts can be created. Disable during a closed launch or a
              signup incident.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex items-center justify-between gap-4">
            <p className="text-sm">
              {settings.allowSignups ? (
                <span className="font-medium">Signups are open</span>
              ) : (
                <span className="font-medium text-destructive">Signups are closed</span>
              )}
            </p>
            <Button
              variant={settings.allowSignups ? "destructive" : "default"}
              size="sm"
              disabled={busy !== null}
              onClick={() => void toggleSetting("allowSignups", settings.allowSignups)}
            >
              {busy === "allowSignups"
                ? "Saving…"
                : settings.allowSignups
                  ? "Close signups"
                  : "Open signups"}
            </Button>
          </CardContent>
        </Card>
      </div>

      {settings.updatedAt !== null && (
        <p className="text-xs text-muted-foreground">
          Last updated {formatDateTime(settings.updatedAt)}
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Console access</CardTitle>
          <CardDescription>
            This console lives at the /sentry path and uses its own credentials, separate from
            user sign-in. Credentials come from SUPERADMIN_USERNAME / SUPERADMIN_PASSWORD
            environment variables, falling back to the hardcoded defaults — change them before a
            production launch. Sessions expire after 7 days.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          <p>
            All actions performed here are recorded in the audit log with the superadmin label.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}