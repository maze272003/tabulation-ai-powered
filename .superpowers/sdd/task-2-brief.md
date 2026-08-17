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

