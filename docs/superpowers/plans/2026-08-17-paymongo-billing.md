# PayMongo Billing Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Org owners buy/renew subscription periods (Starter ₱499 / Pro ₱1,499 per 30 days) via PayMongo Hosted Checkout; payments apply only through a signature-verified webhook; a cron maintains the subscription lifecycle (active → past_due → expired + auto-downgrade to Free).

**Architecture:** Convex action creates a pending `billingPayments` row then a PayMongo Checkout Session (secret key server-side only). The `checkout_session.payment.paid` webhook is verified (HMAC-SHA256 over raw body), deduped by event id, and applied in one internal mutation that extends `currentPeriodEndAt` (fixed 30/365-day periods, stacking). A daily cron expires stale pending checkouts and walks the subscription ladder. The billing page is rebuilt to sell plans and show status/history.

**Tech Stack:** Convex (actions, internal mutations, httpAction, scheduler, cronJobs), Web Crypto (HMAC), Next.js 16 client components, existing shadcn-style UI, vitest (edge-runtime env) + convex-test, Playwright.

**Spec:** `docs/superpowers/specs/2026-08-17-paymongo-billing-design.md`

## Global Constraints

- Follow `convex/_generated/ai/guidelines.md` and `AGENTS.md` (SonarQube-grade standards: no `any`, no `@ts-ignore`, meaningful error handling, early returns).
- Use existing helpers exactly as defined: `requirePermission` (convex/lib/authz.ts), `appError`/`ErrorCode` (convex/lib/errors.ts), `writeAudit` (convex/lib/audit.ts), `serialize` behavior is internal to writeAudit.
- Error assertions in tests use the codebase pattern: `.rejects.toMatchObject({ data: { code: "..." } })`.
- Test files live in `convex-test/*.test.ts`, use `setupTest`, `seedAndProvision`, `aliceIdentity`, `bobIdentity` from `convex-test/setup.ts`. Run tests with `npx vitest run <file>`.
- After any task that adds/renames convex function files, run `npx convex codegen` so `convex/_generated/api` includes the new modules, then continue (commit generated changes with the task).
- Money unit: PHP centavos stored as integer `amountCents` (plans keep their existing `priceCents` field name — same unit).
- Period durations are fixed: monthly = 30 days, yearly = 365 days (`MONTHLY_PERIOD_MS`, `YEARLY_PERIOD_MS`).
- Secrets only via Convex env vars: `PAYMONGO_SECRET_KEY`, `PAYMONGO_WEBHOOK_SECRET`, `PAYMONGO_LIVEMODE` (`"true"`/`"false"`), plus existing `SITE_URL`. Never commit values.
- Windows PowerShell 5.1 environment: chain commands with `;` and `if ($?) { }`, quote paths.
- Commit after every green step. Never commit unless a step says so (this plan's steps say so).
- Validation gates before any task commit: `npx vitest run <task's test file>` passes. Final task runs `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build`.

---

### Task 1: Schema additions + plan pricing

**Files:**
- Modify: `convex/schema.ts` (add `billingPayments`, `processedWebhookEvents` tables; add 2 indexes)
- Modify: `convex/lib/constants.ts:32-63` (SYSTEM_PLANS pricing)
- Test: `convex-test/billing.test.ts` (create)

**Interfaces:**
- Produces: tables `billingPayments`, `processedWebhookEvents`; `subscriptions` index `by_status_and_period_end`; `billingPayments` indexes `by_org_id`, `by_checkout_session_id`, `by_reference_number`, `by_status`. Plans seeded with `priceCents` (Free 0, Starter 49900, Pro 149900), `currency: "PHP"`, `billingInterval: "monthly"`, `isActive: true`. Later tasks rely on these exact field names.

- [ ] **Step 1: Write the failing test**

Create `convex-test/billing.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { api } from "../convex/_generated/api";
import { aliceIdentity, seedAndProvision, setupTest } from "./setup";

describe("billing plans", () => {
  it("seeds plans with PHP pricing", async () => {
    const t = setupTest();
    await seedAndProvision(t, aliceIdentity);
    const plans = await t.query(api.plans.list, {});
    const byName = new Map(plans.map((p) => [p.name, p]));
    expect(byName.get("Free")?.priceCents).toBe(0);
    expect(byName.get("Starter")?.priceCents).toBe(49900);
    expect(byName.get("Pro")?.priceCents).toBe(149900);
    for (const plan of plans) {
      expect(plan.currency).toBe("PHP");
      expect(plan.billingInterval).toBe("monthly");
      expect(plan.isActive).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run convex-test/billing.test.ts`
Expected: FAIL — `priceCents` undefined (plans have no pricing yet).

- [ ] **Step 3: Implement schema + pricing**

In `convex/schema.ts`, add these two tables after the `subscriptions` table definition:

```ts
  billingPayments: defineTable({
    orgId: v.id("organizations"),
    planId: v.id("plans"),
    createdById: v.id("userProfiles"),
    checkoutSessionId: v.union(v.null(), v.string()),
    checkoutUrl: v.union(v.null(), v.string()),
    referenceNumber: v.string(),
    amountCents: v.number(),
    currency: v.string(),
    billingInterval: v.union(v.literal("monthly"), v.literal("yearly")),
    status: v.union(
      v.literal("pending"),
      v.literal("paid"),
      v.literal("failed"),
      v.literal("expired"),
      v.literal("cancelled"),
      v.literal("flagged"),
    ),
    periodStartAt: v.union(v.null(), v.number()),
    periodEndAt: v.union(v.null(), v.number()),
    paidAt: v.union(v.null(), v.number()),
    failureReason: v.union(v.null(), v.string()),
  })
    .index("by_org_id", ["orgId"])
    .index("by_status", ["status"])
    .index("by_checkout_session_id", ["checkoutSessionId"])
    .index("by_reference_number", ["referenceNumber"]),

  processedWebhookEvents: defineTable({
    eventId: v.string(),
    eventType: v.string(),
    receivedAt: v.number(),
  })
    .index("by_event_id", ["eventId"]),
```

Change the `subscriptions` table's index block from:

```ts
    .index("by_org_id", ["orgId"]),
```

to:

```ts
    .index("by_org_id", ["orgId"])
    .index("by_status_and_period_end", ["status", "currentPeriodEndAt"]),
```

In `convex/lib/constants.ts`, add pricing to each entry of `SYSTEM_PLANS` (inside each object literal, after `isSystem: true,` — keep arrays/objects identical otherwise):

```ts
    // Free:
    priceCents: 0,
    currency: "PHP",
    billingInterval: "monthly",
    isActive: true,
    // Starter:
    priceCents: 49900,
    currency: "PHP",
    billingInterval: "monthly",
    isActive: true,
    // Pro:
    priceCents: 149900,
    currency: "PHP",
    billingInterval: "monthly",
    isActive: true,
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run convex-test/billing.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Codegen + typecheck + commit**

```powershell
npx convex codegen; if ($?) { npx tsc --noEmit }
```

Expected: both succeed.

```powershell
git add convex/schema.ts convex/lib/constants.ts convex-test/billing.test.ts convex/_generated
git commit -m "feat(billing): add billingPayments/processedWebhookEvents schema and PHP plan pricing"
```

---

### Task 2: PayMongo lib (signature, client) + billing period math + unit tests

**Files:**
- Modify: `convex/lib/errors.ts` (add `PAYMENT_PROVIDER` code)
- Create: `convex/lib/paymongo.ts`
- Create: `convex/lib/billing.ts`
- Modify: `.env.example` (document PayMongo env vars)
- Test: `convex-test/billingUnits.test.ts` (create)

**Interfaces:**
- Produces (used by Tasks 4–6):
  - `lib/billing.ts`: `DAY_MS`, `MONTHLY_PERIOD_MS` (30d), `YEARLY_PERIOD_MS` (365d), `PAST_DUE_GRACE_MS` (7d), `STALE_PENDING_MS` (24h), `periodDurationMs(interval: "monthly" | "yearly"): number`, `computeRenewalWindow(subscription: { status: string; currentPeriodEndAt: number | null }, now: number): { periodStartAt: number; periodEndAt: number }`, `randomHex(chars: number): string`
  - `lib/paymongo.ts`: `paymongoSecretKey(): string`, `expectedLivemode(): boolean`, `siteUrl(): string`, `verifyPaymongoSignature(rawBody: string, signatureHeader: string | null, secret: string, now?: number): Promise<boolean>`, `createCheckoutSession(input: { lineItemName: string; amountCents: number; currency: string; referenceNumber: string; successUrl: string; cancelUrl: string; metadata: Record<string, string> }): Promise<{ checkoutSessionId: string; checkoutUrl: string }>`
  - `ErrorCode.PAYMENT_PROVIDER = "PAYMENT_PROVIDER"`

- [ ] **Step 1: Write the failing tests**

Create `convex-test/billingUnits.test.ts` (static imports; verified: `vi.stubEnv`/`crypto.subtle` work in this repo's edge-runtime vitest env):

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  computeRenewalWindow,
  MONTHLY_PERIOD_MS,
  YEARLY_PERIOD_MS,
} from "../convex/lib/billing";
import { verifyPaymongoSignature } from "../convex/lib/paymongo";

async function hmacHex(secret: string, payload: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

const SECRET = "whsec_test";

async function signedHeader(body: string, timestampSeconds: number): Promise<string> {
  const sig = await hmacHex(SECRET, `${timestampSeconds}.${body}`);
  return `t=${timestampSeconds},sig=${sig}`;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("paymongo signature verification", () => {
  const body = JSON.stringify({ data: { id: "evt_1", attributes: { type: "checkout_session.payment.paid" } } });

  it("accepts a valid timestamped signature", async () => {
    const now = Date.now();
    const header = await signedHeader(body, Math.floor(now / 1000));
    await expect(verifyPaymongoSignature(body, header, SECRET, now)).resolves.toBe(true);
  });

  it("accepts a valid raw-body-only signature (no timestamp)", async () => {
    const sig = await hmacHex(SECRET, body);
    await expect(verifyPaymongoSignature(body, `sig=${sig}`, SECRET)).resolves.toBe(true);
  });

  it("rejects a tampered body", async () => {
    const now = Date.now();
    const header = await signedHeader(body, Math.floor(now / 1000));
    await expect(verifyPaymongoSignature(body + "x", header, SECRET, now)).resolves.toBe(false);
  });

  it("rejects a stale timestamp", async () => {
    const now = Date.now();
    const header = await signedHeader(body, Math.floor(now / 1000) - 60 * 10);
    await expect(verifyPaymongoSignature(body, header, SECRET, now)).resolves.toBe(false);
  });

  it("rejects a wrong secret and a missing header", async () => {
    const now = Date.now();
    const header = await signedHeader(body, Math.floor(now / 1000));
    await expect(verifyPaymongoSignature(body, header, "other-secret", now)).resolves.toBe(false);
    await expect(verifyPaymongoSignature(body, null, SECRET, now)).resolves.toBe(false);
  });
});

describe("billing period math", () => {
  it("uses fixed durations", () => {
    expect(MONTHLY_PERIOD_MS).toBe(30 * 24 * 60 * 60 * 1000);
    expect(YEARLY_PERIOD_MS).toBe(365 * 24 * 60 * 60 * 1000);
  });

  it("stacks a renewal on an active period", () => {
    const now = 1_000_000_000_000;
    const end = now + 10 * 24 * 60 * 60 * 1000;
    const window = computeRenewalWindow({ status: "active", currentPeriodEndAt: end }, now);
    expect(window.periodStartAt).toBe(end);
    expect(window.periodEndAt).toBe(end + MONTHLY_PERIOD_MS);
  });

  it("starts at now when the period already lapsed or status does not stack", () => {
    const now = 1_000_000_000_000;
    const lapsed = now - 1000;
    expect(computeRenewalWindow({ status: "past_due", currentPeriodEndAt: lapsed }, now).periodStartAt).toBe(now);
    expect(computeRenewalWindow({ status: "canceled", currentPeriodEndAt: now + 5000 }, now).periodStartAt).toBe(now);
    expect(computeRenewalWindow({ status: "active", currentPeriodEndAt: null }, now).periodStartAt).toBe(now);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run convex-test/billingUnits.test.ts`
Expected: FAIL — modules `../convex/lib/billing` and `../convex/lib/paymongo` not found.

- [ ] **Step 3: Implement the libraries**

In `convex/lib/errors.ts`, add to the `ErrorCode` object (after `TIES_UNRESOLVED`):

```ts
  PAYMENT_PROVIDER: "PAYMENT_PROVIDER",
```

Create `convex/lib/billing.ts`:

```ts
import type { Doc } from "../_generated/dataModel";

export const DAY_MS = 24 * 60 * 60 * 1000;
export const MONTHLY_PERIOD_MS = 30 * DAY_MS;
export const YEARLY_PERIOD_MS = 365 * DAY_MS;
export const PAST_DUE_GRACE_MS = 7 * DAY_MS;
export const STALE_PENDING_MS = DAY_MS;

export function periodDurationMs(interval: "monthly" | "yearly"): number {
  return interval === "yearly" ? YEARLY_PERIOD_MS : MONTHLY_PERIOD_MS;
}

type RenewalSubscription = Pick<Doc<"subscriptions">, "status" | "currentPeriodEndAt">;

/**
 * Fixed-duration prepaid periods. A renewal while a period is still running
 * stacks on its end (the customer keeps paid time); otherwise the new period
 * starts now. `past_due` periods have already lapsed, so stacking is a no-op.
 */
export function computeRenewalWindow(
  subscription: RenewalSubscription,
  now: number,
): { periodStartAt: number; periodEndAt: number } {
  const stackable =
    subscription.status === "active" ||
    subscription.status === "trialing" ||
    subscription.status === "past_due";
  const periodStartAt = stackable
    ? Math.max(now, subscription.currentPeriodEndAt ?? 0)
    : now;
  // Billing interval is always monthly today; yearly arrives with yearly plans.
  return { periodStartAt, periodEndAt: periodStartAt + MONTHLY_PERIOD_MS };
}

export function randomHex(charCount: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(Math.ceil(charCount / 2)));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, charCount);
}
```

Create `convex/lib/paymongo.ts`:

```ts
import { appError, ErrorCode } from "./errors";

const PAYMONGO_API_BASE = "https://api.paymongo.com/v2";
const SIGNATURE_TOLERANCE_MS = 5 * 60 * 1000;

export function paymongoSecretKey(): string {
  const key = process.env.PAYMONGO_SECRET_KEY;
  if (!key) {
    throw appError(ErrorCode.PAYMENT_PROVIDER, "PAYMONGO_SECRET_KEY is not configured");
  }
  return key;
}

export function expectedLivemode(): boolean {
  return process.env.PAYMONGO_LIVEMODE === "true";
}

export function siteUrl(): string {
  return (process.env.SITE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseSignatureHeader(
  header: string,
): { timestamp: number | null; signature: string | null } {
  let timestamp: number | null = null;
  let signature: string | null = null;
  for (const part of header.split(",")) {
    const separatorIndex = part.indexOf("=");
    if (separatorIndex === -1) continue;
    const key = part.slice(0, separatorIndex).trim();
    const value = part.slice(separatorIndex + 1).trim();
    if (key === "t" && value !== "" && !Number.isNaN(Number(value))) {
      timestamp = Number(value);
    } else if (key === "sig" && value !== "") {
      signature = value;
    }
  }
  return { timestamp, signature };
}

async function hmacSha256Hex(secret: string, payload: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i++) {
    difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return difference === 0;
}

/**
 * PayMongo signs webhooks with HMAC-SHA256. Current payloads sign the raw
 * body; classic payloads sign `{t}.{body}` with the timestamp in the header.
 * Both are accepted. Verification must run against the raw body before any
 * JSON parsing (byte-exact requirement).
 */
export async function verifyPaymongoSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string,
  now: number = Date.now(),
): Promise<boolean> {
  if (!signatureHeader) return false;
  const { timestamp, signature } = parseSignatureHeader(signatureHeader);
  if (!signature) return false;
  if (timestamp !== null && Math.abs(now - timestamp * 1000) > SIGNATURE_TOLERANCE_MS) {
    return false;
  }
  const payload = timestamp !== null ? `${timestamp}.${rawBody}` : rawBody;
  const expected = await hmacSha256Hex(secret, payload);
  return timingSafeEqualHex(expected, signature.toLowerCase());
}

export type PaymongoCheckoutSession = { checkoutSessionId: string; checkoutUrl: string };

export type CheckoutSessionInput = {
  lineItemName: string;
  amountCents: number;
  currency: string;
  referenceNumber: string;
  successUrl: string;
  cancelUrl: string;
  metadata: Record<string, string>;
};

function extractErrorMessage(json: unknown): string {
  if (!isRecord(json) || !Array.isArray(json.errors)) return "";
  const first = json.errors[0];
  if (isRecord(first) && typeof first.detail === "string") return first.detail;
  return "";
}

function extractSessionId(json: unknown): string | null {
  if (isRecord(json) && isRecord(json.data) && typeof json.data.id === "string") {
    return json.data.id;
  }
  return null;
}

function extractCheckoutUrl(json: unknown): string | null {
  if (
    isRecord(json) &&
    isRecord(json.data) &&
    isRecord(json.data.attributes) &&
    typeof json.data.attributes.checkout_url === "string"
  ) {
    return json.data.attributes.checkout_url;
  }
  return null;
}

/** Creates a Hosted Checkout session. Never call with the public key. */
export async function createCheckoutSession(
  input: CheckoutSessionInput,
): Promise<PaymongoCheckoutSession> {
  const response = await fetch(`${PAYMONGO_API_BASE}/checkout_sessions`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${paymongoSecretKey()}:`).toString("base64")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      data: {
        attributes: {
          line_items: [
            {
              name: input.lineItemName,
              amount: input.amountCents,
              currency: input.currency,
              quantity: 1,
            },
          ],
          success_url: input.successUrl,
          cancel_url: input.cancelUrl,
          reference_number: input.referenceNumber,
          metadata: input.metadata,
        },
      },
    }),
  });
  const json: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = extractErrorMessage(json);
    throw appError(
      ErrorCode.PAYMENT_PROVIDER,
      `PayMongo checkout session creation failed${detail ? `: ${detail}` : ""}`,
    );
  }
  const checkoutSessionId = extractSessionId(json);
  const checkoutUrl = extractCheckoutUrl(json);
  if (!checkoutSessionId || !checkoutUrl) {
    throw appError(ErrorCode.PAYMENT_PROVIDER, "PayMongo returned an incomplete checkout session");
  }
  return { checkoutSessionId, checkoutUrl };
}
```

Append to `.env.example`:

```
# PayMongo (set Convex-side with `npx convex env set`, never commit values):
# PAYMONGO_SECRET_KEY=sk_test_xxx  - secret API key (test: sk_test_, live: sk_live_)
# PAYMONGO_WEBHOOK_SECRET=whsec_xxx - signing secret shown when creating the webhook endpoint
# PAYMONGO_LIVEMODE=false          - must match the keys: "true" or "false"
# Webhook endpoint to register in the PayMongo dashboard: {SITE_URL}/paymongo/webhook
# Subscribe to: checkout_session.payment.paid, checkout_session.payment.failed,
# checkout_session.payment.expired (and canceled if offered).
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run convex-test/billingUnits.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Typecheck + commit**

```powershell
npx convex codegen; if ($?) { npx tsc --noEmit }
```

```powershell
git add convex/lib/errors.ts convex/lib/paymongo.ts convex/lib/billing.ts convex-test/billingUnits.test.ts .env.example convex/_generated
git commit -m "feat(billing): add PayMongo client, webhook signature verification, and period math"
```

---

### Task 3: Payment queries (`billing/payments.ts`)

**Files:**
- Create: `convex/billing/payments.ts`
- Test: `convex-test/billingPayments.test.ts` (create)

**Interfaces:**
- Consumes: `billingPayments` table (Task 1), `requirePermission` with permissions `subscription.view` / `subscription.manage`.
- Produces: `api.billing.payments.listForOrg({ orgSlug })` → array of `billingPayments` docs (+ `planName: string | null`), newest first, max 50; `api.billing.payments.getActiveCheckout({ orgSlug })` → `{ paymentId, checkoutUrl, planName, amountCents, currency, billingInterval, createdAt } | null`.

- [ ] **Step 1: Write the failing tests**

Create `convex-test/billingPayments.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { api } from "../convex/_generated/api";
import { aliceIdentity, bobIdentity, createOrgAndEvent, seedAndProvision, setupTest } from "./setup";

describe("billing payments queries", () => {
  it("returns an empty history and no active checkout for a new org", async () => {
    const t = setupTest();
    await createOrgAndEvent(t, aliceIdentity, { orgSlug: "acme", eventSlug: "gala" });
    const history = await t
      .withIdentity(aliceIdentity)
      .query(api.billing.payments.listForOrg, { orgSlug: "acme" });
    expect(history).toEqual([]);
    const active = await t
      .withIdentity(aliceIdentity)
      .query(api.billing.payments.getActiveCheckout, { orgSlug: "acme" });
    expect(active).toBeNull();
  });

  it("rejects non-members with FORBIDDEN", async () => {
    const t = setupTest();
    await createOrgAndEvent(t, aliceIdentity, { orgSlug: "acme", eventSlug: "gala" });
    await seedAndProvision(t, bobIdentity);
    await expect(
      t.withIdentity(bobIdentity).query(api.billing.payments.listForOrg, { orgSlug: "acme" }),
    ).rejects.toMatchObject({ data: { code: "FORBIDDEN" } });
    await expect(
      t.withIdentity(bobIdentity).query(api.billing.payments.getActiveCheckout, { orgSlug: "acme" }),
    ).rejects.toMatchObject({ data: { code: "FORBIDDEN" } });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run convex-test/billingPayments.test.ts`
Expected: FAIL — `api.billing.payments` does not exist (undefined function).

- [ ] **Step 3: Implement**

Create `convex/billing/payments.ts`:

```ts
import { v } from "convex/values";
import { query } from "../_generated/server";
import { requirePermission } from "../lib/authz";

const HISTORY_LIMIT = 50;

export const listForOrg = query({
  args: { orgSlug: v.string() },
  handler: async (ctx, args) => {
    const actx = await requirePermission(ctx, {
      orgSlug: args.orgSlug,
      permission: "subscription.view",
    });
    const payments = await ctx.db
      .query("billingPayments")
      .withIndex("by_org_id", (q) => q.eq("orgId", actx.org._id))
      .order("desc")
      .take(HISTORY_LIMIT);
    const planNames = new Map(
      await Promise.all(
        [...new Set(payments.map((p) => p.planId))].map(
          async (planId) => {
            const plan = await ctx.db.get(planId);
            return [planId, plan?.name ?? null] as const;
          },
        ),
      ),
    );
    return payments.map((payment) => ({
      ...payment,
      planName: planNames.get(payment.planId) ?? null,
    }));
  },
});

export const getActiveCheckout = query({
  args: { orgSlug: v.string() },
  handler: async (ctx, args) => {
    const actx = await requirePermission(ctx, {
      orgSlug: args.orgSlug,
      permission: "subscription.manage",
    });
    const pending = await ctx.db
      .query("billingPayments")
      .withIndex("by_org_id", (q) => q.eq("orgId", actx.org._id))
      .filter((q) => q.eq(q.field("status"), "pending"))
      .first();
    if (!pending) return null;
    const plan = await ctx.db.get(pending.planId);
    return {
      paymentId: pending._id,
      checkoutUrl: pending.checkoutUrl,
      planName: plan?.name ?? null,
      amountCents: pending.amountCents,
      currency: pending.currency,
      billingInterval: pending.billingInterval,
      createdAt: pending._creationTime,
    };
  },
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run convex-test/billingPayments.test.ts; npx vitest run convex-test/billing.test.ts`
Expected: both PASS.

- [ ] **Step 5: Codegen + commit**

```powershell
npx convex codegen; if ($?) { npx tsc --noEmit }
```

```powershell
git add convex/billing/payments.ts convex-test/billingPayments.test.ts convex/_generated
git commit -m "feat(billing): add payment history and active checkout queries"
```

---

### Task 4: Checkout flow (`billing/checkout.ts`)

**Files:**
- Create: `convex/billing/checkout.ts`
- Modify: `convex-test/setup.ts` (add `createOrgWithPendingCheckout` helper)
- Test: `convex-test/billingCheckout.test.ts` (create)

**Interfaces:**
- Consumes: `lib/paymongo.createCheckoutSession`, `lib/billing.randomHex`, `ErrorCode.PAYMENT_PROVIDER`, `billingPayments` table, `plans` table, `subscription.manage` permission.
- Produces:
  - `api.billing.checkout.createCheckout` (action, `{ orgSlug: string, planName: string }` → `Promise<string>` checkout URL; redirects happen client-side)
  - `api.billing.checkout.cancelCheckout` (mutation, `{ orgSlug: string }` → void)
  - internal: `internal.billing.checkout.createPendingPayment`, `internal.billing.checkout.attachCheckoutSession`, `internal.billing.checkout.failPayment` (Task 5's httpAction does not use these directly)
  - Test helper `createOrgWithPendingCheckout(t, opts?: { planName?: string; sessionSuffix?: string })` returns `{ orgSlug, paymentId, checkoutSessionId, amountCents, referenceNumber }` — used by Tasks 5 and 6.

- [ ] **Step 1: Add the shared test helper**

In `convex-test/setup.ts`, add these imports at the top (merge with existing):

```ts
import { vi } from "vitest";
import { internal } from "../convex/_generated/api";
```

Append at the end of the file:

```ts
let checkoutCounter = 0;

export async function createOrgWithPendingCheckout(
  t: ReturnType<typeof setupTest>,
  opts: { planName?: string; sessionSuffix?: string } = {},
): Promise<{
  orgSlug: string;
  paymentId: string;
  checkoutSessionId: string;
  amountCents: number;
}> {
  const orgSlug = "acme";
  // Safe to call multiple times per test (e.g. renewals): only bootstrap once.
  const existing = await t
    .withIdentity(aliceIdentity)
    .query(api.organizations.get, { orgSlug });
  if (existing === null) {
    await createOrgAndEvent(t, aliceIdentity, { orgSlug, eventSlug: "gala" });
  }
  checkoutCounter += 1;
  const suffix = opts.sessionSuffix ?? `auto${checkoutCounter}`;
  vi.stubGlobal(
    "fetch",
    async () =>
      new Response(
        JSON.stringify({
          data: {
            id: `cs_test_${suffix}`,
            attributes: { checkout_url: `https://checkout.paymongo.com/test/${suffix}` },
          },
        }),
        { status: 200 },
      ),
  );
  vi.stubEnv("PAYMONGO_SECRET_KEY", `sk_test_${suffix}`);
  try {
    await t
      .withIdentity(aliceIdentity)
      .action(api.billing.checkout.createCheckout, {
        orgSlug,
        planName: opts.planName ?? "Starter",
      });
  } finally {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  }
  const active = await t
    .withIdentity(aliceIdentity)
    .query(api.billing.payments.getActiveCheckout, { orgSlug });
  if (!active) throw new Error("pending checkout not found after createCheckout");
  return {
    orgSlug,
    paymentId: active.paymentId,
    checkoutSessionId: `cs_test_${suffix}`,
    amountCents: active.amountCents,
  };
}

/**
 * Grants a paid plan through the REAL path (checkout + paid webhook) so tests
 * exercise the same state production reaches. Replaces the old
 * `subscriptions.changePlan`-based setup.
 */
export async function grantPaidPlan(
  t: ReturnType<typeof setupTest>,
  planName: "Starter" | "Pro",
): Promise<{ orgSlug: string; checkoutSessionId: string; amountCents: number }> {
  const ctx = await createOrgWithPendingCheckout(t, { planName });
  const outcome = await t.mutation(internal.billing.webhook.processWebhookEvent, {
    eventId: `evt_grant_${planName}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    eventType: "checkout_session.payment.paid",
    checkoutSessionId: ctx.checkoutSessionId,
    referenceNumber: null,
    paidAmount: ctx.amountCents,
  });
  if (outcome !== "applied") throw new Error(`grantPaidPlan failed: ${outcome}`);
  return ctx;
}
```

Note: `grantPaidPlan` depends on Task 5's `processWebhookEvent`; it is introduced with Task 5 (step 1) but lives here so all later tasks share it. Add it to setup.ts during **Task 5**, together with the `internal` import; Task 4 only adds `createOrgWithPendingCheckout` + the `vi` import.

- [ ] **Step 2: Write the failing tests**

Create `convex-test/billingCheckout.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "../convex/_generated/api";
import { aliceIdentity, bobIdentity, createOrgAndEvent, seedAndProvision, setupTest } from "./setup";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function stubCheckoutSuccess(suffix = "1") {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      new Response(
        JSON.stringify({
          data: {
            id: `cs_test_${suffix}`,
            attributes: { checkout_url: `https://checkout.paymongo.com/test/${suffix}` },
          },
        }),
        { status: 200 },
      ),
    ),
  );
  vi.stubEnv("PAYMONGO_SECRET_KEY", "sk_test_key");
}

describe("billing checkout", () => {
  it("creates a pending payment with a checkout URL", async () => {
    const t = setupTest();
    await createOrgAndEvent(t, aliceIdentity, { orgSlug: "acme", eventSlug: "gala" });
    stubCheckoutSuccess();
    const url = await t
      .withIdentity(aliceIdentity)
      .action(api.billing.checkout.createCheckout, { orgSlug: "acme", planName: "Starter" });
    expect(url).toBe("https://checkout.paymongo.com/test/1");
    const active = await t
      .withIdentity(aliceIdentity)
      .query(api.billing.payments.getActiveCheckout, { orgSlug: "acme" });
    expect(active).not.toBeNull();
    expect(active?.planName).toBe("Starter");
    expect(active?.amountCents).toBe(49900);
    expect(active?.billingInterval).toBe("monthly");
  });

  it("rejects the Free plan and unknown plans", async () => {
    const t = setupTest();
    await createOrgAndEvent(t, aliceIdentity, { orgSlug: "acme", eventSlug: "gala" });
    await expect(
      t.withIdentity(aliceIdentity).action(api.billing.checkout.createCheckout, {
        orgSlug: "acme",
        planName: "Free",
      }),
    ).rejects.toMatchObject({ data: { code: "VALIDATION_ERROR" } });
    await expect(
      t.withIdentity(aliceIdentity).action(api.billing.checkout.createCheckout, {
        orgSlug: "acme",
        planName: "Platinum",
      }),
    ).rejects.toMatchObject({ data: { code: "NOT_FOUND" } });
  });

  it("enforces the one-live-checkout rule with CONFLICT", async () => {
    const t = setupTest();
    await createOrgAndEvent(t, aliceIdentity, { orgSlug: "acme", eventSlug: "gala" });
    stubCheckoutSuccess();
    await t
      .withIdentity(aliceIdentity)
      .action(api.billing.checkout.createCheckout, { orgSlug: "acme", planName: "Starter" });
    stubCheckoutSuccess("2");
    await expect(
      t.withIdentity(aliceIdentity).action(api.billing.checkout.createCheckout, {
        orgSlug: "acme",
        planName: "Pro",
      }),
    ).rejects.toMatchObject({ data: { code: "CONFLICT" } });
  });

  it("requires subscription.manage permission", async () => {
    const t = setupTest();
    await createOrgAndEvent(t, aliceIdentity, { orgSlug: "acme", eventSlug: "gala" });
    await seedAndProvision(t, bobIdentity);
    stubCheckoutSuccess();
    await expect(
      t.withIdentity(bobIdentity).action(api.billing.checkout.createCheckout, {
        orgSlug: "acme",
        planName: "Starter",
      }),
    ).rejects.toMatchObject({ data: { code: "FORBIDDEN" } });
  });

  it("marks the payment failed when PayMongo rejects the request", async () => {
    const t = setupTest();
    await createOrgAndEvent(t, aliceIdentity, { orgSlug: "acme", eventSlug: "gala" });
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({ errors: [{ detail: "Invalid amount" }] }),
            { status: 422 },
          ),
      ),
    );
    vi.stubEnv("PAYMONGO_SECRET_KEY", "sk_test_key");
    await expect(
      t.withIdentity(aliceIdentity).action(api.billing.checkout.createCheckout, {
        orgSlug: "acme",
        planName: "Starter",
      }),
    ).rejects.toMatchObject({ data: { code: "PAYMENT_PROVIDER" } });
    const active = await t
      .withIdentity(aliceIdentity)
      .query(api.billing.payments.getActiveCheckout, { orgSlug: "acme" });
    expect(active).toBeNull();
    const history = await t
      .withIdentity(aliceIdentity)
      .query(api.billing.payments.listForOrg, { orgSlug: "acme" });
    expect(history.length).toBe(1);
    expect(history[0].status).toBe("failed");
    expect(history[0].failureReason).toContain("Invalid amount");
  });

  it("cancels an active checkout and CONFLICTs when none is active", async () => {
    const t = setupTest();
    await createOrgAndEvent(t, aliceIdentity, { orgSlug: "acme", eventSlug: "gala" });
    stubCheckoutSuccess();
    await t
      .withIdentity(aliceIdentity)
      .action(api.billing.checkout.createCheckout, { orgSlug: "acme", planName: "Starter" });
    await t
      .withIdentity(aliceIdentity)
      .mutation(api.billing.checkout.cancelCheckout, { orgSlug: "acme" });
    const active = await t
      .withIdentity(aliceIdentity)
      .query(api.billing.payments.getActiveCheckout, { orgSlug: "acme" });
    expect(active).toBeNull();
    await expect(
      t.withIdentity(aliceIdentity).mutation(api.billing.checkout.cancelCheckout, { orgSlug: "acme" }),
    ).rejects.toMatchObject({ data: { code: "CONFLICT" } });
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run convex-test/billingCheckout.test.ts`
Expected: FAIL — `api.billing.checkout` undefined.

- [ ] **Step 4: Implement**

Create `convex/billing/checkout.ts`:

```ts
import { v } from "convex/values";
import { action, internalMutation, mutation } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { appError, ErrorCode } from "../lib/errors";
import { requirePermission } from "../lib/authz";
import { writeAudit } from "../lib/audit";
import { randomHex } from "../lib/billing";
import { createCheckoutSession, siteUrl } from "../lib/paymongo";

const REFERENCE_SUFFIX_LENGTH = 6;

export const createPendingPayment = internalMutation({
  args: { orgSlug: v.string(), planName: v.string() },
  handler: async (ctx, args) => {
    const actx = await requirePermission(ctx, {
      orgSlug: args.orgSlug,
      permission: "subscription.manage",
    });
    const plan = await ctx.db
      .query("plans")
      .withIndex("by_name", (q) => q.eq("name", args.planName))
      .unique();
    if (!plan) throw appError(ErrorCode.NOT_FOUND, "Plan not found");
    if (plan.isActive === false) {
      throw appError(ErrorCode.VALIDATION_ERROR, `Plan ${plan.name} is not available`);
    }
    const amountCents = plan.priceCents ?? 0;
    if (amountCents <= 0 || !plan.currency || !plan.billingInterval) {
      throw appError(
        ErrorCode.VALIDATION_ERROR,
        `Plan ${plan.name} cannot be purchased. Only priced plans support checkout.`,
      );
    }

    const pending = await ctx.db
      .query("billingPayments")
      .withIndex("by_org_id", (q) => q.eq("orgId", actx.org._id))
      .filter((q) => q.eq(q.field("status"), "pending"))
      .first();
    if (pending) {
      throw appError(
        ErrorCode.CONFLICT,
        "A checkout is already in progress. Complete or cancel it before starting another.",
      );
    }

    const paymentId = await ctx.db.insert("billingPayments", {
      orgId: actx.org._id,
      planId: plan._id,
      createdById: actx.user._id,
      checkoutSessionId: null,
      checkoutUrl: null,
      referenceNumber: "",
      amountCents,
      currency: plan.currency,
      billingInterval: plan.billingInterval,
      status: "pending",
      periodStartAt: null,
      periodEndAt: null,
      paidAt: null,
      failureReason: null,
    });
    const referenceNumber = `${paymentId}.${randomHex(REFERENCE_SUFFIX_LENGTH)}`;
    await ctx.db.patch(paymentId, { referenceNumber });
    await writeAudit(ctx, {
      orgId: actx.org._id,
      actorId: actx.user._id,
      action: "billing.checkout.created",
      resourceType: "billingPayment",
      resourceId: paymentId,
      after: { planName: plan.name, amountCents, referenceNumber },
    });
    return {
      paymentId,
      orgId: actx.org._id,
      planName: plan.name,
      amountCents,
      currency: plan.currency,
      billingInterval: plan.billingInterval,
      referenceNumber,
    };
  },
});

export const attachCheckoutSession = internalMutation({
  args: {
    paymentId: v.id("billingPayments"),
    checkoutSessionId: v.string(),
    checkoutUrl: v.string(),
  },
  handler: async (ctx, args) => {
    const payment = await ctx.db.get(args.paymentId);
    if (!payment) throw appError(ErrorCode.NOT_FOUND, "Payment not found");
    if (payment.status !== "pending") {
      throw appError(ErrorCode.CONFLICT, "Payment is no longer pending");
    }
    const clash = await ctx.db
      .query("billingPayments")
      .withIndex("by_checkout_session_id", (q) => q.eq("checkoutSessionId", args.checkoutSessionId))
      .first();
    if (clash && clash._id !== payment._id) {
      throw appError(ErrorCode.CONFLICT, "Checkout session is already linked to another payment");
    }
    await ctx.db.patch(payment._id, {
      checkoutSessionId: args.checkoutSessionId,
      checkoutUrl: args.checkoutUrl,
    });
  },
});

export const failPayment = internalMutation({
  args: { paymentId: v.id("billingPayments"), reason: v.string() },
  handler: async (ctx, args) => {
    const payment = await ctx.db.get(args.paymentId);
    if (!payment || payment.status !== "pending") return;
    await ctx.db.patch(payment._id, { status: "failed", failureReason: args.reason });
    await writeAudit(ctx, {
      orgId: payment.orgId,
      actorId: null,
      action: "billing.checkout.failed",
      resourceType: "billingPayment",
      resourceId: payment._id,
      after: { reason: args.reason },
    });
  },
});

export const createCheckout = action({
  args: { orgSlug: v.string(), planName: v.string() },
  handler: async (ctx, args): Promise<string> => {
    const pending = await ctx.runMutation(internal.billing.checkout.createPendingPayment, {
      orgSlug: args.orgSlug,
      planName: args.planName,
    });
    try {
      const session = await createCheckoutSession({
        lineItemName: `${pending.planName} plan (${pending.billingInterval})`,
        amountCents: pending.amountCents,
        currency: pending.currency,
        referenceNumber: pending.referenceNumber,
        successUrl: `${siteUrl()}/app/${args.orgSlug}/billing?billing=success`,
        cancelUrl: `${siteUrl()}/app/${args.orgSlug}/billing?billing=cancelled`,
        metadata: { orgId: pending.orgId, paymentId: pending.paymentId },
      });
      await ctx.runMutation(internal.billing.checkout.attachCheckoutSession, {
        paymentId: pending.paymentId,
        checkoutSessionId: session.checkoutSessionId,
        checkoutUrl: session.checkoutUrl,
      });
      return session.checkoutUrl;
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Unknown PayMongo error";
      await ctx.runMutation(internal.billing.checkout.failPayment, {
        paymentId: pending.paymentId,
        reason,
      });
      throw error;
    }
  },
});

export const cancelCheckout = mutation({
  args: { orgSlug: v.string() },
  handler: async (ctx, args): Promise<void> => {
    const actx = await requirePermission(ctx, {
      orgSlug: args.orgSlug,
      permission: "subscription.manage",
    });
    const pending = await ctx.db
      .query("billingPayments")
      .withIndex("by_org_id", (q) => q.eq("orgId", actx.org._id))
      .filter((q) => q.eq(q.field("status"), "pending"))
      .first();
    if (!pending) throw appError(ErrorCode.CONFLICT, "No active checkout to cancel");
    await ctx.db.patch(pending._id, { status: "cancelled" });
    await writeAudit(ctx, {
      orgId: actx.org._id,
      actorId: actx.user._id,
      action: "billing.checkout.cancelled",
      resourceType: "billingPayment",
      resourceId: pending._id,
    });
  },
});
```

Note: `Id` import is unused — remove it from the import list (only `v`, `action`, `internalMutation`, `mutation`, `internal`, helpers). Final import block:

```ts
import { v } from "convex/values";
import { action, internalMutation, mutation } from "../_generated/server";
import { internal } from "../_generated/api";
import { appError, ErrorCode } from "../lib/errors";
import { requirePermission } from "../lib/authz";
import { writeAudit } from "../lib/audit";
import { randomHex } from "../lib/billing";
import { createCheckoutSession, siteUrl } from "../lib/paymongo";
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run convex-test/billingCheckout.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 6: Codegen + commit**

```powershell
npx convex codegen; if ($?) { npx tsc --noEmit }
```

```powershell
git add convex/billing/checkout.ts convex-test/setup.ts convex-test/billingCheckout.test.ts convex/_generated
git commit -m "feat(billing): implement PayMongo checkout flow with one-live-checkout guard"
```

---

### Task 5: Webhook handler + HTTP route

**Files:**
- Create: `convex/billing/webhook.ts`
- Modify: `convex/http.ts` (register route)
- Test: `convex-test/billingWebhook.test.ts` (create)

**Interfaces:**
- Consumes: `verifyPaymongoSignature`, `expectedLivemode` (Task 2), `computeRenewalWindow` (Task 2), `processedWebhookEvents` + `billingPayments` (Task 1), `createOrgWithPendingCheckout` (Task 4), `internal.billing.webhook.processWebhookEvent`.
- Produces: `POST /paymongo/webhook` route (registered in `convex/http.ts`); `internal.billing.webhook.processWebhookEvent({ eventId, eventType, checkoutSessionId, referenceNumber, paidAmount })` → `Promise<"duplicate" | "applied" | "flagged" | "ignored">`.

- [ ] **Step 1: Write the failing tests**

Create `convex-test/billingWebhook.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { api, internal } from "../convex/_generated/api";
import { aliceIdentity, createOrgWithPendingCheckout, setupTest } from "./setup";

const PAID_EVENT = "checkout_session.payment.paid";

function paidEvent(payment: { checkoutSessionId: string; amountCents: number }, eventId: string) {
  return {
    eventId,
    eventType: PAID_EVENT,
    checkoutSessionId: payment.checkoutSessionId,
    referenceNumber: null,
    paidAmount: payment.amountCents,
  };
}

describe("paymongo webhook processing", () => {
  it("applies a paid event: payment paid, subscription active with a 30-day period", async () => {
    const t = setupTest();
    const ctx = await createOrgWithPendingCheckout(t);
    const outcome = await t.mutation(internal.billing.webhook.processWebhookEvent, {
      ...paidEvent(ctx, "evt_1"),
    });
    expect(outcome).toBe("applied");
    const sub = await t
      .withIdentity(aliceIdentity)
      .query(api.subscriptions.getForOrg, { orgSlug: ctx.orgSlug });
    expect(sub?.subscription.status).toBe("active");
    expect(sub?.subscription.planId).not.toBeNull();
    expect(sub?.subscription.currentPeriodEndAt).toBeGreaterThan(Date.now());
    const history = await t
      .withIdentity(aliceIdentity)
      .query(api.billing.payments.listForOrg, { orgSlug: ctx.orgSlug });
    expect(history[0].status).toBe("paid");
    expect(history[0].periodStartAt).not.toBeNull();
    expect(history[0].periodEndAt).not.toBeNull();
  });

  it("is idempotent under duplicate delivery (no double period extension)", async () => {
    const t = setupTest();
    const ctx = await createOrgWithPendingCheckout(t);
    await t.mutation(internal.billing.webhook.processWebhookEvent, paidEvent(ctx, "evt_dup"));
    const first = await t
      .withIdentity(aliceIdentity)
      .query(api.subscriptions.getForOrg, { orgSlug: ctx.orgSlug });
    const outcome = await t.mutation(internal.billing.webhook.processWebhookEvent, {
      ...paidEvent(ctx, "evt_dup"),
    });
    expect(outcome).toBe("duplicate");
    const second = await t
      .withIdentity(aliceIdentity)
      .query(api.subscriptions.getForOrg, { orgSlug: ctx.orgSlug });
    expect(second?.subscription.currentPeriodEndAt).toBe(first?.subscription.currentPeriodEndAt);
  });

  it("flags a paid event whose amount does not match the payment row", async () => {
    const t = setupTest();
    const ctx = await createOrgWithPendingCheckout(t);
    const outcome = await t.mutation(internal.billing.webhook.processWebhookEvent, {
      eventId: "evt_amt",
      eventType: PAID_EVENT,
      checkoutSessionId: ctx.checkoutSessionId,
      referenceNumber: null,
      paidAmount: ctx.amountCents - 1,
    });
    expect(outcome).toBe("flagged");
    const sub = await t
      .withIdentity(aliceIdentity)
      .query(api.subscriptions.getForOrg, { orgSlug: ctx.orgSlug });
    expect(sub?.subscription.currentPeriodEndAt).toBeNull();
    const history = await t
      .withIdentity(aliceIdentity)
      .query(api.billing.payments.listForOrg, { orgSlug: ctx.orgSlug });
    expect(history[0].status).toBe("flagged");
  });

  it("ignores replays against non-pending payments and unknown sessions", async () => {
    const t = setupTest();
    const ctx = await createOrgWithPendingCheckout(t);
    await t.mutation(internal.billing.webhook.processWebhookEvent, paidEvent(ctx, "evt_r1"));
    const replay = await t.mutation(internal.billing.webhook.processWebhookEvent, {
      ...paidEvent(ctx, "evt_r2"),
    });
    expect(replay).toBe("ignored");
    const unknown = await t.mutation(internal.billing.webhook.processWebhookEvent, {
      eventId: "evt_r3",
      eventType: PAID_EVENT,
      checkoutSessionId: "cs_test_unknown",
      referenceNumber: null,
      paidAmount: 49900,
    });
    expect(unknown).toBe("ignored");
  });

  it("marks payments failed on failure events and records unknown types", async () => {
    const t = setupTest();
    const ctx = await createOrgWithPendingCheckout(t);
    await t.mutation(internal.billing.webhook.processWebhookEvent, {
      eventId: "evt_f1",
      eventType: "checkout_session.payment.failed",
      checkoutSessionId: ctx.checkoutSessionId,
      referenceNumber: null,
      paidAmount: null,
    });
    const history = await t
      .withIdentity(aliceIdentity)
      .query(api.billing.payments.listForOrg, { orgSlug: ctx.orgSlug });
    expect(history[0].status).toBe("failed");
    const unknown = await t.mutation(internal.billing.webhook.processWebhookEvent, {
      eventId: "evt_u1",
      eventType: "source.chargeable",
      checkoutSessionId: null,
      referenceNumber: null,
      paidAmount: null,
    });
    expect(unknown).toBe("ignored");
  });

  it("stacks a second paid period on top of the active one", async () => {
    const t = setupTest();
    const first = await createOrgWithPendingCheckout(t, { sessionSuffix: "1" });
    await t.mutation(internal.billing.webhook.processWebhookEvent, paidEvent(first, "evt_s1"));
    const sub1 = await t
      .withIdentity(aliceIdentity)
      .query(api.subscriptions.getForOrg, { orgSlug: first.orgSlug });
    // Renewal requires the first checkout to be settled (paid), so create another.
    const second = await createOrgWithPendingCheckout(t, {
      planName: "Pro",
      sessionSuffix: "2",
    });
    expect(second.orgSlug).toBe("acme");
    await t.mutation(internal.billing.webhook.processWebhookEvent, paidEvent(second, "evt_s2"));
    const sub2 = await t
      .withIdentity(aliceIdentity)
      .query(api.subscriptions.getForOrg, { orgSlug: second.orgSlug });
    expect(sub2?.subscription.currentPeriodEndAt).toBeGreaterThan(
      sub1?.subscription.currentPeriodEndAt ?? 0,
    );
  });
});
```

Note: the helper is safe to call twice in one test (it skips org creation when "acme" already exists and auto-increments session suffixes), which is exactly what the stacking test does. After the test file passes, add `grantPaidPlan` (defined in Task 4's setup.ts block above) plus the `internal` import to `convex-test/setup.ts` now — it is consumed by Tasks 6, 7, and the legacy-test migration.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run convex-test/billingWebhook.test.ts`
Expected: FAIL — `internal.billing.webhook` undefined.

- [ ] **Step 3: Implement**

Create `convex/billing/webhook.ts` (final version — no intermediate refactors):

```ts
import { v } from "convex/values";
import { httpAction, internalMutation } from "../_generated/server";
import type { MutationCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Doc } from "../_generated/dataModel";
import { writeAudit } from "../lib/audit";
import { computeRenewalWindow } from "../lib/billing";
import { expectedLivemode, verifyPaymongoSignature } from "../lib/paymongo";

const EVENT_PAID = "checkout_session.payment.paid";
const EVENT_FAILED = "checkout_session.payment.failed";
const EXPIRY_EVENTS = new Set([
  "checkout_session.payment.expired",
  "checkout_session.payment.canceled",
  "checkout_session.payment.cancelled",
]);

type ProcessedEvent = {
  eventId: string;
  eventType: string;
  checkoutSessionId: string | null;
  referenceNumber: string | null;
  paidAmount: number | null;
};

type WebhookOutcome = "duplicate" | "applied" | "flagged" | "ignored";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Extracts the fields the processor needs from a PayMongo event envelope:
 * `{ data: { id, attributes: { type, livemode, data: <resource> } } }`.
 * Returns null for anything that does not match the documented shape.
 */
function extractEvent(rawBody: string): { event: ProcessedEvent; livemode: boolean } | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return null;
  }
  if (!isRecord(parsed) || !isRecord(parsed.data)) return null;
  const { id: eventId, attributes } = parsed.data;
  if (typeof eventId !== "string" || !isRecord(attributes)) return null;
  const { type: eventType, livemode, data: resource } = attributes;
  if (typeof eventType !== "string" || typeof livemode !== "boolean") return null;
  const resourceAttributes =
    isRecord(resource) && isRecord(resource.attributes) ? resource.attributes : {};
  const sessionId = isRecord(resource) ? resource.id : undefined;
  const checkoutSessionId = typeof sessionId === "string" ? sessionId : null;
  const referenceNumber =
    typeof resourceAttributes.reference_number === "string"
      ? resourceAttributes.reference_number
      : null;
  let paidAmount: number | null = null;
  if (Array.isArray(resourceAttributes.payments) && resourceAttributes.payments.length > 0) {
    const first = resourceAttributes.payments[0];
    if (
      isRecord(first) &&
      isRecord(first.attributes) &&
      typeof first.attributes.amount === "number"
    ) {
      paidAmount = first.attributes.amount;
    }
  }
  return {
    event: { eventId, eventType, checkoutSessionId, referenceNumber, paidAmount },
    livemode,
  };
}

async function findPendingPayment(
  ctx: MutationCtx,
  event: ProcessedEvent,
): Promise<Doc<"billingPayments"> | null> {
  let payment: Doc<"billingPayments"> | null = null;
  if (event.checkoutSessionId !== null) {
    payment = await ctx.db
      .query("billingPayments")
      .withIndex("by_checkout_session_id", (q) =>
        q.eq("checkoutSessionId", event.checkoutSessionId),
      )
      .unique();
  }
  if (!payment && event.referenceNumber !== null) {
    payment = await ctx.db
      .query("billingPayments")
      .withIndex("by_reference_number", (q) => q.eq("referenceNumber", event.referenceNumber))
      .unique();
  }
  if (!payment || payment.status !== "pending") return null;
  return payment;
}

async function flagPayment(
  ctx: MutationCtx,
  payment: Doc<"billingPayments">,
  reason: string,
): Promise<WebhookOutcome> {
  await ctx.db.patch(payment._id, { status: "flagged", failureReason: reason });
  await writeAudit(ctx, {
    orgId: payment.orgId,
    actorId: null,
    action: "billing.payment.flagged",
    resourceType: "billingPayment",
    resourceId: payment._id,
    after: { reason },
  });
  return "flagged";
}

async function applyPaidEvent(ctx: MutationCtx, event: ProcessedEvent): Promise<WebhookOutcome> {
  const payment = await findPendingPayment(ctx, event);
  if (!payment) return "ignored";
  if (event.paidAmount !== null && event.paidAmount !== payment.amountCents) {
    return flagPayment(
      ctx,
      payment,
      `Amount mismatch: expected ${payment.amountCents}, webhook reported ${event.paidAmount}`,
    );
  }
  const subscription = await ctx.db
    .query("subscriptions")
    .withIndex("by_org_id", (q) => q.eq("orgId", payment.orgId))
    .unique();
  if (!subscription) {
    return flagPayment(ctx, payment, "No subscription found for organization");
  }
  const now = Date.now();
  const window = computeRenewalWindow(subscription, now);
  await ctx.db.patch(payment._id, {
    status: "paid",
    paidAt: now,
    periodStartAt: window.periodStartAt,
    periodEndAt: window.periodEndAt,
  });
  await ctx.db.patch(subscription._id, {
    planId: payment.planId,
    status: "active",
    currentPeriodEndAt: window.periodEndAt,
    cancelAtPeriodEnd: false,
  });
  await writeAudit(ctx, {
    orgId: payment.orgId,
    actorId: payment.createdById,
    action: "billing.payment.paid",
    resourceType: "billingPayment",
    resourceId: payment._id,
    after: { amountCents: payment.amountCents, periodEndAt: window.periodEndAt },
  });
  return "applied";
}

async function applyTerminalEvent(
  ctx: MutationCtx,
  event: ProcessedEvent,
  status: "failed" | "expired",
  reason: string,
  auditAction: string,
): Promise<WebhookOutcome> {
  const payment = await findPendingPayment(ctx, event);
  if (!payment) return "ignored";
  await ctx.db.patch(payment._id, { status, failureReason: reason });
  await writeAudit(ctx, {
    orgId: payment.orgId,
    actorId: null,
    action: auditAction,
    resourceType: "billingPayment",
    resourceId: payment._id,
  });
  return "applied";
}

export const processWebhookEvent = internalMutation({
  args: {
    eventId: v.string(),
    eventType: v.string(),
    checkoutSessionId: v.union(v.null(), v.string()),
    referenceNumber: v.union(v.null(), v.string()),
    paidAmount: v.union(v.null(), v.number()),
  },
  handler: async (ctx, args): Promise<WebhookOutcome> => {
    // Dedupe first: PayMongo retries up to 12 times, so replays are expected.
    const existing = await ctx.db
      .query("processedWebhookEvents")
      .withIndex("by_event_id", (q) => q.eq("eventId", args.eventId))
      .unique();
    if (existing) return "duplicate";
    await ctx.db.insert("processedWebhookEvents", {
      eventId: args.eventId,
      eventType: args.eventType,
      receivedAt: Date.now(),
    });

    const event: ProcessedEvent = { ...args };
    if (event.eventType === EVENT_PAID) return applyPaidEvent(ctx, event);
    if (event.eventType === EVENT_FAILED) {
      return applyTerminalEvent(ctx, event, "failed", "Payment failed at PayMongo", "billing.payment.failed");
    }
    if (EXPIRY_EVENTS.has(event.eventType)) {
      return applyTerminalEvent(ctx, event, "expired", "Checkout session expired", "billing.payment.expired");
    }
    // Unknown types are recorded above and acknowledged — never error, that
    // would push the event into PayMongo's retry queue forever.
    return "ignored";
  },
});

export const paymongoWebhook = httpAction(async (ctx, request) => {
  const secret = process.env.PAYMONGO_WEBHOOK_SECRET;
  if (!secret) {
    console.error("PAYMONGO_WEBHOOK_SECRET is not configured");
    return new Response(null, { status: 500 });
  }
  const rawBody = await request.text();
  const signature = request.headers.get("paymongo-signature");
  if (!(await verifyPaymongoSignature(rawBody, signature, secret))) {
    return new Response(null, { status: 401 });
  }
  const extracted = extractEvent(rawBody);
  if (!extracted) {
    console.error("paymongo webhook: unparseable payload after valid signature");
    return new Response(null, { status: 200 });
  }
  if (extracted.livemode !== expectedLivemode()) {
    return new Response(null, { status: 200 });
  }
  try {
    // Acknowledge immediately, process asynchronously — PayMongo requires a
    // 2xx within 30 seconds. A failed scheduled run is visible in Convex logs.
    await ctx.scheduler.runAfter(0, internal.billing.webhook.processWebhookEvent, extracted.event);
    return new Response(null, { status: 200 });
  } catch (error) {
    console.error("paymongo webhook: failed to schedule processing", error);
    return new Response(null, { status: 500 });
  }
});
```

In `convex/http.ts`, add the route:

```ts
import { httpRouter } from "convex/server";
import { authComponent, createAuth } from "./betterAuth/auth";
import { paymongoWebhook } from "./billing/webhook";

const http = httpRouter();

authComponent.registerRoutes(http, createAuth);
http.route({
  path: "/paymongo/webhook",
  method: "POST",
  handler: paymongoWebhook,
});

export default http;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run convex-test/billingWebhook.test.ts; npx vitest run convex-test/billingCheckout.test.ts`
Expected: both PASS (6 + 6).

- [ ] **Step 5: Codegen + commit**

```powershell
npx convex codegen; if ($?) { npx tsc --noEmit }
```

```powershell
git add convex/billing/webhook.ts convex/http.ts convex-test/billingWebhook.test.ts convex-test/setup.ts convex/_generated
git commit -m "feat(billing): verify and process PayMongo webhooks idempotently"
```

---

### Task 6: Subscription lifecycle cron (`billing/lifecycle.ts`)

**Files:**
- Create: `convex/billing/lifecycle.ts`
- Modify: `convex/crons.ts` (register daily cron)
- Test: `convex-test/billingLifecycle.test.ts` (create)

**Interfaces:**
- Consumes: `STALE_PENDING_MS`, `PAST_DUE_GRACE_MS` (Task 2), `billingPayments.by_status` + `subscriptions.by_status_and_period_end` indexes (Task 1), `createOrgWithPendingCheckout` + `internal.billing.webhook.processWebhookEvent` (Tasks 4–5).
- Produces: `internal.billing.lifecycle.expireSubscriptions({ now?: number })` — time is injectable because the mutation is internal-only (scheduler callers omit it); this is the deliberate test seam.

- [ ] **Step 1: Write the failing tests**

Create `convex-test/billingLifecycle.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { api, internal } from "../convex/_generated/api";
import { aliceIdentity, createOrgWithPendingCheckout, setupTest } from "./setup";

const DAY = 24 * 60 * 60 * 1000;

describe("billing lifecycle", () => {
  it("expires stale pending checkouts after 24h", async () => {
    const t = setupTest();
    const ctx = await createOrgWithPendingCheckout(t);
    const createdAt = Date.now();
    await t.mutation(internal.billing.lifecycle.expireSubscriptions, {});
    // Within 24h the checkout is still pending.
    let active = await t
      .withIdentity(aliceIdentity)
      .query(api.billing.payments.getActiveCheckout, { orgSlug: ctx.orgSlug });
    expect(active).not.toBeNull();

    await t.mutation(internal.billing.lifecycle.expireSubscriptions, { now: createdAt + 25 * DAY });
    active = await t
      .withIdentity(aliceIdentity)
      .query(api.billing.payments.getActiveCheckout, { orgSlug: ctx.orgSlug });
    expect(active).toBeNull();
    const history = await t
      .withIdentity(aliceIdentity)
      .query(api.billing.payments.listForOrg, { orgSlug: ctx.orgSlug });
    expect(history[0].status).toBe("expired");
  });

  it("moves active → past_due at period end, then expired + Free after grace", async () => {
    const t = setupTest();
    const ctx = await createOrgWithPendingCheckout(t);
    await t.mutation(internal.billing.webhook.processWebhookEvent, {
      eventId: "evt_life_1",
      eventType: "checkout_session.payment.paid",
      checkoutSessionId: ctx.checkoutSessionId,
      referenceNumber: null,
      paidAmount: ctx.amountCents,
    });
    const paidAt = Date.now();

    // Just after period end (30 days): past_due.
    await t.mutation(internal.billing.lifecycle.expireSubscriptions, { now: paidAt + 31 * DAY });
    let sub = await t
      .withIdentity(aliceIdentity)
      .query(api.subscriptions.getForOrg, { orgSlug: ctx.orgSlug });
    expect(sub?.subscription.status).toBe("past_due");

    // Within grace: still past_due.
    await t.mutation(internal.billing.lifecycle.expireSubscriptions, { now: paidAt + 37 * DAY });
    sub = await t
      .withIdentity(aliceIdentity)
      .query(api.subscriptions.getForOrg, { orgSlug: ctx.orgSlug });
    expect(sub?.subscription.status).toBe("past_due");

    // After 7-day grace: expired and downgraded to Free.
    await t.mutation(internal.billing.lifecycle.expireSubscriptions, { now: paidAt + 38 * DAY });
    sub = await t
      .withIdentity(aliceIdentity)
      .query(api.subscriptions.getForOrg, { orgSlug: ctx.orgSlug });
    expect(sub?.subscription.status).toBe("expired");
    expect(sub?.plan?.name).toBe("Free");
  });

  it("never touches active subscriptions with no period (Free orgs)", async () => {
    const t = setupTest();
    await createOrgWithPendingCheckout(t);
    // The org above has a pending payment, not an applied one — create a pure Free org.
    // Use a second org via the public API.
    await t.withIdentity(aliceIdentity).mutation(api.organizations.create, {
      name: "Free Org",
      slug: "free-org",
    });
    const before = await t
      .withIdentity(aliceIdentity)
      .query(api.subscriptions.getForOrg, { orgSlug: "free-org" });
    expect(before?.subscription.status).toBe("active");
    await t.mutation(internal.billing.lifecycle.expireSubscriptions, { now: Date.now() + 365 * DAY });
    const after = await t
      .withIdentity(aliceIdentity)
      .query(api.subscriptions.getForOrg, { orgSlug: "free-org" });
    expect(after?.subscription.status).toBe("active");
    expect(after?.plan?.name).toBe("Free");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run convex-test/billingLifecycle.test.ts`
Expected: FAIL — `internal.billing.lifecycle` undefined.

- [ ] **Step 3: Implement**

Create `convex/billing/lifecycle.ts`:

```ts
import { v } from "convex/values";
import { internalMutation } from "../_generated/server";
import { writeAudit } from "../lib/audit";
import { PAST_DUE_GRACE_MS, STALE_PENDING_MS } from "../lib/billing";

const BATCH_SIZE = 100;

/**
 * Daily maintenance ladder:
 * 1. Pending checkouts older than 24h are marked expired (sessions die at
 *    PayMongo on their own; this keeps the one-live-checkout rule honest).
 * 2. active + lapsed period → past_due (service keeps working during grace).
 * 3. past_due + 7-day grace exhausted → expired + downgrade to Free.
 *
 * `now` is injectable because this is an internal mutation used only by the
 * scheduler and tests; production callers omit it.
 */
export const expireSubscriptions = internalMutation({
  args: { now: v.optional(v.number()) },
  handler: async (ctx, args): Promise<void> => {
    const now = args.now ?? Date.now();

    const stalePending = await ctx.db
      .query("billingPayments")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .take(BATCH_SIZE);
    for (const payment of stalePending) {
      if (payment._creationTime > now - STALE_PENDING_MS) continue;
      await ctx.db.patch(payment._id, { status: "expired" });
      await writeAudit(ctx, {
        orgId: payment.orgId,
        actorId: null,
        action: "billing.payment.expired",
        resourceType: "billingPayment",
        resourceId: payment._id,
        after: { reason: "Checkout not completed within 24h" },
      });
    }

    const lapsed = await ctx.db
      .query("subscriptions")
      .withIndex("by_status_and_period_end", (q) =>
        q.eq("status", "active").lt("currentPeriodEndAt", now),
      )
      .take(BATCH_SIZE);
    for (const subscription of lapsed) {
      // Free-tier orgs have status "active" with a null period — never expire them.
      if (subscription.currentPeriodEndAt === null) continue;
      await ctx.db.patch(subscription._id, { status: "past_due" });
      await writeAudit(ctx, {
        orgId: subscription.orgId,
        actorId: null,
        action: "subscription.past_due",
        resourceType: "subscription",
        resourceId: subscription._id,
        after: { currentPeriodEndAt: subscription.currentPeriodEndAt },
      });
    }

    const graceDeadline = now - PAST_DUE_GRACE_MS;
    const beyondGrace = await ctx.db
      .query("subscriptions")
      .withIndex("by_status_and_period_end", (q) =>
        q.eq("status", "past_due").lt("currentPeriodEndAt", graceDeadline),
      )
      .take(BATCH_SIZE);
    if (beyondGrace.length === 0) return;
    const freePlan = await ctx.db
      .query("plans")
      .withIndex("by_name", (q) => q.eq("name", "Free"))
      .unique();
    if (!freePlan) {
      console.error("billing lifecycle: Free plan missing — run seed; skipping downgrades");
      return;
    }
    for (const subscription of beyondGrace) {
      if (subscription.currentPeriodEndAt === null) continue;
      await ctx.db.patch(subscription._id, {
        status: "expired",
        planId: freePlan._id,
        cancelAtPeriodEnd: false,
      });
      await writeAudit(ctx, {
        orgId: subscription.orgId,
        actorId: null,
        action: "subscription.expired",
        resourceType: "subscription",
        resourceId: subscription._id,
        before: { planId: subscription.planId },
        after: { planId: freePlan._id },
      });
    }
  },
});
```

In `convex/crons.ts`, add the import and registration:

```ts
import { internal } from "./_generated/api";
// (already imported) — extend the crons section:

crons.interval(
  "expire subscriptions and stale checkouts",
  { hours: 24 },
  internal.billing.lifecycle.expireSubscriptions,
  {},
);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run convex-test/billingLifecycle.test.ts; npx vitest run convex-test/billingWebhook.test.ts`
Expected: both PASS.

- [ ] **Step 5: Codegen + commit**

```powershell
npx convex codegen; if ($?) { npx tsc --noEmit }
```

```powershell
git add convex/billing/lifecycle.ts convex/crons.ts convex-test/billingLifecycle.test.ts convex/_generated
git commit -m "feat(billing): add subscription expiry ladder and stale checkout cleanup cron"
```

---

### Task 7: Replace `subscriptions.changePlan` stub + `resume`

**Files:**
- Modify: `convex/subscriptions.ts:18-43` (replace `changePlan`, add `resume`)
- Test: `convex-test/billingSubscriptions.test.ts` (create)

**Interfaces:**
- Consumes: `requirePermission` with `subscription.manage`, plans table.
- Produces: `api.subscriptions.changePlan({ orgSlug, planName })` — only Free (cancel-at-period-end) is accepted; paid plan names throw `VALIDATION_ERROR` directing callers to `billing.createCheckout`. `api.subscriptions.resume({ orgSlug })` clears `cancelAtPeriodEnd`. Both audit. (UI in Task 8 calls exactly these.)

- [ ] **Step 1: Write the failing tests**

Create `convex-test/billingSubscriptions.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { api } from "../convex/_generated/api";
import {
  aliceIdentity,
  bobIdentity,
  grantPaidPlan,
  seedAndProvision,
  setupTest,
} from "./setup";

async function paidOrg() {
  const t = setupTest();
  const ctx = await grantPaidPlan(t, "Starter");
  return { t, orgSlug: ctx.orgSlug };
}

describe("subscriptions changePlan/resume", () => {
  it("schedules cancellation to Free via changePlan", async () => {
    const { t, orgSlug } = await paidOrg();
    await t
      .withIdentity(aliceIdentity)
      .mutation(api.subscriptions.changePlan, { orgSlug, planName: "Free" });
    const sub = await t
      .withIdentity(aliceIdentity)
      .query(api.subscriptions.getForOrg, { orgSlug });
    expect(sub?.subscription.cancelAtPeriodEnd).toBe(true);
    expect(sub?.subscription.planId).not.toBeNull();
  });

  it("rejects paid plans (must use checkout) and no-op switches", async () => {
    const { t, orgSlug } = await paidOrg();
    await expect(
      t.withIdentity(aliceIdentity).mutation(api.subscriptions.changePlan, {
        orgSlug,
        planName: "Pro",
      }),
    ).rejects.toMatchObject({ data: { code: "VALIDATION_ERROR" } });
    await expect(
      t.withIdentity(aliceIdentity).mutation(api.subscriptions.changePlan, {
        orgSlug,
        planName: "Starter",
      }),
    ).rejects.toMatchObject({ data: { code: "CONFLICT" } });
  });

  it("resume clears cancelAtPeriodEnd and CONFLICTs when nothing to resume", async () => {
    const { t, orgSlug } = await paidOrg();
    await expect(
      t.withIdentity(aliceIdentity).mutation(api.subscriptions.resume, { orgSlug }),
    ).rejects.toMatchObject({ data: { code: "CONFLICT" } });
    await t
      .withIdentity(aliceIdentity)
      .mutation(api.subscriptions.changePlan, { orgSlug, planName: "Free" });
    await t.withIdentity(aliceIdentity).mutation(api.subscriptions.resume, { orgSlug });
    const sub = await t
      .withIdentity(aliceIdentity)
      .query(api.subscriptions.getForOrg, { orgSlug });
    expect(sub?.subscription.cancelAtPeriodEnd).toBe(false);
  });

  it("requires subscription.manage permission", async () => {
    const { t, orgSlug } = await paidOrg();
    await seedAndProvision(t, bobIdentity);
    await expect(
      t.withIdentity(bobIdentity).mutation(api.subscriptions.changePlan, { orgSlug, planName: "Free" }),
    ).rejects.toMatchObject({ data: { code: "FORBIDDEN" } });
    await expect(
      t.withIdentity(bobIdentity).mutation(api.subscriptions.resume, { orgSlug }),
    ).rejects.toMatchObject({ data: { code: "FORBIDDEN" } });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run convex-test/billingSubscriptions.test.ts`
Expected: FAIL — first test: `changePlan` currently patches planId immediately and does not set `cancelAtPeriodEnd` (assertion `cancelAtPeriodEnd === true` fails). Also `resume` undefined.

- [ ] **Step 3: Implement**

In `convex/subscriptions.ts`, replace the whole `changePlan` mutation (lines 18–43, the "Phase 1 stub") with:

```ts
/**
 * Downgrade path only: choosing Free schedules cancellation at period end.
 * Paid plans must go through PayMongo checkout (`billing.createCheckout`).
 * Immediate plan switches remain a superadmin override.
 */
export const changePlan = mutation({
  args: { orgSlug: v.string(), planName: v.string() },
  handler: async (ctx, args) => {
    const actx = await requirePermission(ctx, {
      orgSlug: args.orgSlug,
      permission: "subscription.manage",
    });
    const plan = await ctx.db
      .query("plans")
      .withIndex("by_name", (q) => q.eq("name", args.planName))
      .unique();
    if (!plan) throw appError(ErrorCode.NOT_FOUND, "Plan not found");
    if ((plan.priceCents ?? 0) > 0) {
      throw appError(
        ErrorCode.VALIDATION_ERROR,
        `Plan ${plan.name} requires payment — start a checkout instead`,
      );
    }
    if (actx.subscription.planId === plan._id) {
      throw appError(ErrorCode.CONFLICT, `Already on ${plan.name}`);
    }
    if (actx.subscription.cancelAtPeriodEnd) {
      throw appError(ErrorCode.CONFLICT, "Cancellation is already scheduled");
    }
    await ctx.db.patch(actx.subscription._id, { cancelAtPeriodEnd: true });
    await writeAudit(ctx, {
      orgId: actx.org._id,
      actorId: actx.user._id,
      action: "subscription.cancel_scheduled",
      resourceType: "subscription",
      resourceId: actx.subscription._id,
      before: { cancelAtPeriodEnd: actx.subscription.cancelAtPeriodEnd },
      after: { cancelAtPeriodEnd: true },
    });
  },
});

export const resume = mutation({
  args: { orgSlug: v.string() },
  handler: async (ctx, args) => {
    const actx = await requirePermission(ctx, {
      orgSlug: args.orgSlug,
      permission: "subscription.manage",
    });
    if (!actx.subscription.cancelAtPeriodEnd) {
      throw appError(ErrorCode.CONFLICT, "No scheduled cancellation to resume");
    }
    await ctx.db.patch(actx.subscription._id, { cancelAtPeriodEnd: false });
    await writeAudit(ctx, {
      orgId: actx.org._id,
      actorId: actx.user._id,
      action: "subscription.resumed",
      resourceType: "subscription",
      resourceId: actx.subscription._id,
      before: { cancelAtPeriodEnd: true },
      after: { cancelAtPeriodEnd: false },
    });
  },
});
```

Also add to the file's imports (merge with existing):

```ts
import { appError, ErrorCode } from "./lib/errors";
```

(`v`, `mutation`, `query`, `requirePermission`, `writeAudit` are already imported.)

- [ ] **Step 3b: Migrate legacy tests off the old `changePlan` semantics**

The semantic change breaks existing setup calls that used `changePlan` to jump onto a paid plan. Replace each occurrence of:

```ts
await t.withIdentity(aliceIdentity).mutation(api.subscriptions.changePlan, { orgSlug: "acme", planName: "Pro" });
```

with:

```ts
await grantPaidPlan(t, "Pro");
```

in these files (add `grantPaidPlan` to their setup import):

- `convex-test/templates.test.ts` (lines ~16 and ~37)
- `convex-test/phase3Schema.test.ts` (line ~90)
- `convex-test/eventCodes.test.ts` (line ~21)
- `convex-test/config.test.ts` (line ~58)

This puts legacy feature-gate tests on the REAL payment path (checkout + webhook), which is strictly better coverage than the old stub hop.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run convex-test/billingSubscriptions.test.ts convex-test/entitlements.test.ts convex-test/templates.test.ts convex-test/phase3Schema.test.ts convex-test/eventCodes.test.ts convex-test/config.test.ts`
Expected: all PASS (the migrated legacy suites guard against regressions in existing subscription consumers).

- [ ] **Step 5: Commit**

```powershell
npx tsc --noEmit
git add convex/subscriptions.ts convex-test/billingSubscriptions.test.ts convex-test/templates.test.ts convex-test/phase3Schema.test.ts convex-test/eventCodes.test.ts convex-test/config.test.ts
git commit -m "feat(billing): replace plan stub with cancel-at-period-end downgrade; migrate tests to real payment path"
```

---

### Task 8: Billing page UI + route protection e2e

**Files:**
- Modify: `app/app/[orgSlug]/billing/page.tsx` (full rebuild)
- Modify: `e2e/05-organizer-workspace.spec.ts` (append billing route test)

**Interfaces:**
- Consumes: `api.plans.list`, `api.subscriptions.getForOrg`, `api.billing.payments.listForOrg`, `api.billing.payments.getActiveCheckout`, `api.billing.checkout.createCheckout`, `api.billing.checkout.cancelCheckout`, `api.subscriptions.changePlan`, `api.subscriptions.resume`; UI components `Button`, `Card*`, `Badge`, `Table*`, `PageHeader`; `sonner` toast.
- Produces: the complete billing surface (`/app/[orgSlug]/billing`).

- [ ] **Step 1: Rebuild the billing page**

Replace the entire contents of `app/app/[orgSlug]/billing/page.tsx` with:

```tsx
"use client";

import { Suspense, use, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PageHeader } from "@/components/PageHeader";
import { CheckCircle2, ExternalLink, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

const pesoFormat = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  minimumFractionDigits: 0,
});

function formatPeso(cents: number): string {
  return pesoFormat.format(cents / 100);
}

function formatDate(ms: number | null): string {
  if (ms === null) return "—";
  return new Date(ms).toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function errorMessage(error: unknown): string {
  if (error instanceof ConvexError) {
    const data = error.data as { message?: string };
    if (typeof data.message === "string") return data.message;
  }
  return "Something went wrong. Please try again.";
}

const PAYMENT_STATUS_TONE: Record<string, string> = {
  paid: "bg-success-muted text-success",
  pending: "bg-warning-muted text-warning",
  flagged: "bg-destructive/15 text-destructive",
  failed: "bg-muted text-muted-foreground",
  expired: "bg-muted text-muted-foreground",
  cancelled: "bg-muted text-muted-foreground",
};

const PLAN_FEATURE_LABELS: { key: string; label: string }[] = [
  { key: "canExportReports", label: "Report exports" },
  { key: "canUseCustomBranding", label: "Custom branding" },
  { key: "canUseAuditLogs", label: "Audit logs" },
  { key: "canCreateTemplates", label: "Event templates" },
  { key: "canUseAdvancedAnalytics", label: "Advanced analytics" },
];

function BillingContent({ orgSlug }: { orgSlug: string }) {
  const searchParams = useSearchParams();
  const billingResult = searchParams.get("billing");

  const subscription = useQuery(api.subscriptions.getForOrg, { orgSlug });
  const plans = useQuery(api.plans.list, {});
  const payments = useQuery(api.billing.payments.listForOrg, { orgSlug });
  const activeCheckout = useQuery(api.billing.payments.getActiveCheckout, { orgSlug });

  const startCheckout = useMutation(api.billing.checkout.createCheckout);
  const cancelCheckout = useMutation(api.billing.checkout.cancelCheckout);
  const changePlan = useMutation(api.subscriptions.changePlan);
  const resume = useMutation(api.subscriptions.resume);

  const [busyPlan, setBusyPlan] = useState<string | null>(null);

  const currentPlanId = subscription?.subscription.planId ?? null;
  const status = subscription?.subscription.status ?? null;
  const cancelAtPeriodEnd = subscription?.subscription.cancelAtPeriodEnd ?? false;
  const periodEndAt = subscription?.subscription.currentPeriodEndAt ?? null;

  const handleCheckout = async (planName: string) => {
    setBusyPlan(planName);
    try {
      const url = await startCheckout({ orgSlug, planName });
      window.location.href = url;
    } catch (error) {
      toast.error(errorMessage(error));
      setBusyPlan(null);
    }
  };

  const handleSwitchToFree = async () => {
    setBusyPlan("Free");
    try {
      await changePlan({ orgSlug, planName: "Free" });
      toast.success("Your plan will cancel at the end of the paid period.");
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusyPlan(null);
    }
  };

  const handleResume = async () => {
    try {
      await resume({ orgSlug });
      toast.success("Subscription resumed.");
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const handleCancelCheckout = async () => {
    try {
      await cancelCheckout({ orgSlug });
      toast.info("Checkout cancelled.");
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  if (subscription === undefined || plans === undefined) {
    return (
      <div className="grid gap-4 md:grid-cols-3" aria-busy>
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-72 animate-pulse rounded-xl bg-muted" />
        ))}
      </div>
    );
  }

  const visiblePlans = plans.filter((plan) => plan.isActive !== false);
  const pendingCheckoutUrl = activeCheckout?.checkoutUrl ?? null;

  return (
    <div className="space-y-6">
      {billingResult === "success" ? (
        <div className="rounded-lg border border-success/30 bg-success-muted px-4 py-3 text-sm text-success">
          Payment received — your plan updates as soon as PayMongo confirms it (usually within a
          minute).
        </div>
      ) : null}
      {billingResult === "cancelled" ? (
        <div className="rounded-lg border bg-muted px-4 py-3 text-sm text-muted-foreground">
          Checkout cancelled — nothing was charged.
        </div>
      ) : null}

      {status === "past_due" ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-warning/40 bg-warning-muted px-4 py-3 text-sm text-warning">
          <span>
            Your subscription expired on {formatDate(periodEndAt)}. Renew within the 7-day grace
            period to keep your paid features.
          </span>
        </div>
      ) : null}
      {cancelAtPeriodEnd && status === "active" ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-info/40 bg-info-muted px-4 py-3 text-sm text-info">
          <span>Your subscription cancels on {formatDate(periodEndAt)}.</span>
          <Button size="sm" variant="outline" onClick={handleResume}>
            Resume subscription
          </Button>
        </div>
      ) : null}

      {activeCheckout ? (
        <Card>
          <CardHeader>
            <CardTitle className="font-heading text-lg">Checkout in progress</CardTitle>
            <CardDescription>
              A {activeCheckout.planName} payment of {formatPeso(activeCheckout.amountCents)} is
              waiting to be completed.
            </CardDescription>
          </CardHeader>
          <CardFooter className="gap-2">
            {pendingCheckoutUrl ? (
              <Button onClick={() => (window.location.href = pendingCheckoutUrl)}>
                Complete payment <ExternalLink aria-hidden className="size-4" />
              </Button>
            ) : null}            <Button variant="outline" onClick={handleCancelCheckout}>
              Cancel checkout
            </Button>
          </CardFooter>
        </Card>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        {visiblePlans.map((plan) => {
          const isCurrent = plan._id === currentPlanId;
          const isFree = (plan.priceCents ?? 0) === 0;
          const busy = busyPlan === plan.name;
          return (
            <Card
              key={plan._id}
              className={cn("flex flex-col", isCurrent && "border-primary ring-1 ring-primary")}
            >
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="font-heading text-xl">{plan.name}</CardTitle>
                  {isCurrent ? <Badge>Current</Badge> : null}
                </div>
                <CardDescription>
                  {isFree ? "Free forever" : `${formatPeso(plan.priceCents ?? 0)} / month`}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex-1 space-y-3 text-sm">
                <p className="text-muted-foreground">
                  Up to {plan.limits.maxEvents} event{plan.limits.maxEvents === 1 ? "" : "s"} ·{" "}
                  {plan.limits.maxJudges} judges · {plan.limits.maxContestants} contestants
                </p>
                <ul className="space-y-1.5">
                  {PLAN_FEATURE_LABELS.map(({ key, label }) => {
                    const enabled = plan.features[key as keyof typeof plan.features] === true;
                    return (
                      <li
                        key={key}
                        className={cn(
                          "flex items-center gap-2",
                          enabled ? "text-foreground" : "text-muted-foreground/60",
                        )}
                      >
                        {enabled ? (
                          <CheckCircle2 aria-hidden className="size-4 text-success" />
                        ) : (
                          <XCircle aria-hidden className="size-4" />
                        )}
                        {label}
                      </li>
                    );
                  })}
                </ul>
              </CardContent>
              <CardFooter className="flex flex-col gap-2">
                {isCurrent && !isFree ? (
                  <>
                    <Button
                      className="w-full"
                      disabled={busy || activeCheckout !== null}
                      onClick={() => void handleCheckout(plan.name)}
                    >
                      {busy ? "Redirecting…" : "Renew"}
                    </Button>
                    {cancelAtPeriodEnd ? null : (
                      <Button
                        variant="outline"
                        className="w-full"
                        disabled={busy || activeCheckout !== null}
                        onClick={handleSwitchToFree}
                      >
                        Switch to Free at period end
                      </Button>
                    )}
                  </>
                ) : !isCurrent && isFree ? (
                  <Button
                    variant="outline"
                    className="w-full"
                    disabled={busy || activeCheckout !== null}
                    onClick={handleSwitchToFree}
                  >
                    Switch to Free at period end
                  </Button>
                ) : !isCurrent ? (
                  <Button
                    className="w-full"
                    disabled={busy || activeCheckout !== null}
                    onClick={() => void handleCheckout(plan.name)}
                  >
                    {busy ? "Redirecting…" : `Get ${plan.name}`}
                  </Button>
                ) : null}
              </CardFooter>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-lg">Payment history</CardTitle>
          <CardDescription>Recent payments for this organization.</CardDescription>
        </CardHeader>
        <CardContent>
          {payments === undefined ? (
            <div className="h-24 animate-pulse rounded-lg bg-muted" aria-busy />
          ) : payments.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No payments yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Interval</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments.map((payment) => (
                  <TableRow key={payment._id}>
                    <TableCell>{formatDate(payment._creationTime)}</TableCell>
                    <TableCell>{payment.planName ?? "—"}</TableCell>
                    <TableCell>{formatPeso(payment.amountCents)}</TableCell>
                    <TableCell className="capitalize">{payment.billingInterval}</TableCell>
                    <TableCell>
                      {payment.periodStartAt === null
                        ? "—"
                        : `${formatDate(payment.periodStartAt)} → ${formatDate(payment.periodEndAt)}`}
                    </TableCell>
                    <TableCell>
                      <Badge
                        className={cn(
                          "border-transparent capitalize",
                          PAYMENT_STATUS_TONE[payment.status] ?? "bg-muted text-muted-foreground",
                        )}
                      >
                        {payment.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function BillingPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = use(params);
  return (
    <div className="space-y-6">
      <PageHeader
        title="Billing"
        description="Your subscription plan, payments, and checkout for this organization."
      />
      <Suspense fallback={<div className="h-72 animate-pulse rounded-xl bg-muted" />}>
        <BillingContent orgSlug={orgSlug} />
      </Suspense>
    </div>
  );
}
```

The `CreditCard` icon is intentionally not imported (the old page used it; the new page does not). Keep only `CheckCircle2`, `ExternalLink`, `XCircle` from lucide.

- [ ] **Step 2: Append the e2e route-protection test**

In `e2e/05-organizer-workspace.spec.ts`, append inside the describe block:

```ts
  test("should enforce unauthenticated route protection on billing page", async ({ page }) => {
    await page.goto("/app/e2e-org/billing");
    await expect(page).toHaveURL(/.*\/sign-in\?next=%2Fapp%2Fe2e-org%2Fbilling/);
  });
```

- [ ] **Step 3: Validate**

```powershell
npm run lint; if ($?) { npm run typecheck }
```

Expected: both pass. If lint flags unused imports, remove them and re-run.

Then run the production build:

```powershell
npm run build
```

Expected: build succeeds (Next 16 may warn about the dynamic page — warnings are fine, errors are not).

- [ ] **Step 4: Commit**

```powershell
git add "app/app/[orgSlug]/billing/page.tsx" e2e/05-organizer-workspace.spec.ts
git commit -m "feat(billing): rebuild billing page with plans, checkout, and payment history"
```

---

### Task 9: Full validation + Graphify refresh

**Files:**
- No new files. Runs all gates.

- [ ] **Step 1: Run the complete test suite**

```powershell
npm run test
```

Expected: all tests pass, including all pre-existing suites (no regressions from the `changePlan` semantic change or schema additions).

- [ ] **Step 2: Lint, typecheck, build**

```powershell
npm run lint; if ($?) { npm run typecheck }; if ($?) { npm run build }
```

Expected: all three pass.

- [ ] **Step 3: Refresh Graphify context**

```powershell
npm run graphify:build
```

Expected: completes without errors.

- [ ] **Step 4: Commit generated context**

```powershell
git add .graphify
git commit -m "chore: refresh graphify context for billing module"
```

(If `.graphify` is fully gitignored, `git add` reports nothing to commit — skip the commit.)

- [ ] **Step 5: Manual smoke checklist (documented for the operator — do not block)**

The implementer cannot complete a real PayMongo payment. Leave the repo with this checklist printed in the task report:
1. `npx convex env set PAYMONGO_SECRET_KEY=sk_test_...`, `PAYMONGO_WEBHOOK_SECRET=...`, `PAYMONGO_LIVEMODE=false`, `SITE_URL=http://localhost:3000`
2. Register webhook `http://localhost:3000/paymongo/webhook` (or a tunnel URL) in the PayMongo dashboard with the checkout_session events.
3. Buy Starter with the test GCash/card flows from PayMongo's testing docs; verify the subscription flips to active and history shows paid.

---

## Post-Plan Notes for Reviewers

- `convex/_generated` files change via `npx convex codegen`; commit them with the task that caused the change (they are tracked in this repo).
- The `changePlan` semantic change (immediate switch → cancel-at-period-end) intentionally removes the old behavior; the only in-repo consumer was the Phase 1 stub itself and the superadmin override path (`superadmin/billing.setPlan`), which is untouched.
- Money is always integer centavos; `formatPeso` is the only place division by 100 happens.
