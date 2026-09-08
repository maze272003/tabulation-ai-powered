import { Check, Monitor, Smartphone, X } from "lucide-react";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

type BrowserSupportEntry = {
  name: string;
  supported: boolean;
  version: string;
};

type FeatureSupportMatrix = {
  feature: string;
  desktop: BrowserSupportEntry[];
  mobile: BrowserSupportEntry[];
};

const SUPPORTED_FEATURES: FeatureSupportMatrix[] = [
  {
    feature: "scroll-timeline",
    desktop: [
      { name: "Chrome", supported: true, version: "115" },
      { name: "Edge", supported: true, version: "115" },
      { name: "Firefox", supported: false, version: "111" },
      { name: "Opera", supported: true, version: "101" },
      { name: "Safari", supported: false, version: "No" },
    ],
    mobile: [
      { name: "Chrome Android", supported: true, version: "115" },
      { name: "Firefox Android", supported: false, version: "No" },
      { name: "Opera Android", supported: true, version: "77" },
      { name: "Safari iOS", supported: false, version: "No" },
      { name: "Samsung Internet", supported: true, version: "23" },
    ],
  },
  {
    feature: "view-timeline",
    desktop: [
      { name: "Chrome", supported: true, version: "115" },
      { name: "Edge", supported: true, version: "115" },
      { name: "Firefox", supported: false, version: "114" },
      { name: "Opera", supported: true, version: "101" },
      { name: "Safari", supported: false, version: "No" },
    ],
    mobile: [
      { name: "Chrome Android", supported: true, version: "115" },
      { name: "Firefox Android", supported: false, version: "No" },
      { name: "Opera Android", supported: true, version: "77" },
      { name: "Safari iOS", supported: false, version: "No" },
      { name: "Samsung Internet", supported: true, version: "23" },
    ],
  },
  {
    feature: "font-size-adjust",
    desktop: [
      { name: "Chrome", supported: true, version: "127" },
      { name: "Edge", supported: true, version: "127" },
      { name: "Firefox", supported: false, version: "3" },
      { name: "Opera", supported: true, version: "113" },
      { name: "Safari", supported: true, version: "16.4" },
    ],
    mobile: [
      { name: "Chrome Android", supported: true, version: "127" },
      { name: "Firefox Android", supported: true, version: "4" },
      { name: "Opera Android", supported: true, version: "84" },
      { name: "Safari iOS", supported: true, version: "16.4" },
      { name: "Samsung Internet", supported: false, version: "No" },
    ],
  },
];

function SupportCell({ entry }: { entry: BrowserSupportEntry }) {
  const SupportIcon = entry.supported ? Check : X;

  return (
    <TableCell className="space-y-1 text-center">
      <SupportIcon
        aria-hidden
        className={cn(
          "inline-flex size-4",
          entry.supported ? "stroke-emerald-600" : "stroke-red-600",
        )}
      />
      <span className="sr-only">
        {entry.supported ? "Supported" : "Not supported"}
      </span>
      <div className="text-xs font-medium text-muted-foreground">
        {entry.version}
      </div>
    </TableCell>
  );
}

/**
 * Showcase matrix table: grouped desktop/mobile columns with vertically
 * rotated headers and check/cross support indicators per browser.
 */
export function BrowserSupportTable() {
  const [firstFeature] = SUPPORTED_FEATURES;

  return (
    <Table className="bg-background">
      {firstFeature ? (
        <>
          <TableHeader>
            <TableRow className="border-y-0 hover:bg-transparent *:border-border [&>:not(:last-child)]:border-r">
              <TableHead>
                <span className="sr-only">Feature</span>
              </TableHead>
              <TableHead
                className="border-b border-border text-center"
                colSpan={firstFeature.desktop.length}
              >
                <Monitor aria-hidden className="inline-flex size-4" />
                <span className="sr-only">Desktop browsers</span>
              </TableHead>
              <TableHead
                className="border-b border-border text-center"
                colSpan={firstFeature.mobile.length}
              >
                <Smartphone aria-hidden className="inline-flex size-4" />
                <span className="sr-only">Mobile browsers</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableHeader>
            <TableRow className="hover:bg-transparent *:border-border [&>:not(:last-child)]:border-r">
              <TableHead>
                <span className="sr-only">Feature name</span>
              </TableHead>
              {[...firstFeature.desktop, ...firstFeature.mobile].map(
                (browser) => (
                  <TableHead
                    key={browser.name}
                    className="h-auto rotate-180 py-3 [writing-mode:vertical-lr]"
                  >
                    {browser.name}
                  </TableHead>
                ),
              )}
            </TableRow>
          </TableHeader>
        </>
      ) : null}
      <TableBody>
        {SUPPORTED_FEATURES.map((feature) => (
          <TableRow
            key={feature.feature}
            className="*:border-border [&>:not(:last-child)]:border-r"
          >
            <TableHead>{feature.feature}</TableHead>
            {[...feature.desktop, ...feature.mobile].map((browser, index) => (
              <SupportCell key={`${browser.name}-${index}`} entry={browser} />
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
