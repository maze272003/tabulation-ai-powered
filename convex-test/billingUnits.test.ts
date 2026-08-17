import { afterEach, describe, expect, it, vi } from "vitest";
import {
  computeRenewalWindow,
  MONTHLY_PERIOD_MS,
  YEARLY_PERIOD_MS,
} from "../convex/lib/billing";
import { createCheckoutSession, verifyPaymongoSignature } from "../convex/lib/paymongo";

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

  it("accepts a timestamped signature delivered under the sig1 key", async () => {
    const now = Date.now();
    const timestampSeconds = Math.floor(now / 1000);
    const sig = await hmacHex(SECRET, `${timestampSeconds}.${body}`);
    await expect(
      verifyPaymongoSignature(body, `t=${timestampSeconds},sig1=${sig}`, SECRET, now),
    ).resolves.toBe(true);
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

describe("paymongo checkout session", () => {
  it("maps a network-level fetch failure to a PAYMENT_PROVIDER error", async () => {
    vi.stubEnv("PAYMONGO_SECRET_KEY", "sk_test_secret");
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new TypeError("fetch failed"))));
    await expect(
      createCheckoutSession({
        lineItemName: "Pro monthly",
        amountCents: 49900,
        currency: "PHP",
        referenceNumber: "ref_test_1",
        successUrl: "https://example.com/success",
        cancelUrl: "https://example.com/cancel",
        metadata: { userId: "user_1" },
      }),
    ).rejects.toMatchObject({ data: { code: "PAYMENT_PROVIDER" } });
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
    const window = computeRenewalWindow({ status: "active", currentPeriodEndAt: end }, "monthly", now);
    expect(window.periodStartAt).toBe(end);
    expect(window.periodEndAt).toBe(end + MONTHLY_PERIOD_MS);
  });

  it("stacks a yearly renewal for a full year on an active period", () => {
    const now = 1_000_000_000_000;
    const end = now + 10 * 24 * 60 * 60 * 1000;
    const window = computeRenewalWindow({ status: "active", currentPeriodEndAt: end }, "yearly", now);
    expect(window.periodStartAt).toBe(end);
    expect(window.periodEndAt).toBe(end + YEARLY_PERIOD_MS);
  });

  it("starts at now when the period already lapsed or status does not stack", () => {
    const now = 1_000_000_000_000;
    const lapsed = now - 1000;
    expect(computeRenewalWindow({ status: "past_due", currentPeriodEndAt: lapsed }, "monthly", now).periodStartAt).toBe(now);
    expect(computeRenewalWindow({ status: "canceled", currentPeriodEndAt: now + 5000 }, "monthly", now).periodStartAt).toBe(now);
    expect(computeRenewalWindow({ status: "active", currentPeriodEndAt: null }, "monthly", now).periodStartAt).toBe(now);
  });
});
