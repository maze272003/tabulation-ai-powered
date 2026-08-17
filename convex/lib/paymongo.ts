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
  let response: Response;
  try {
    response = await fetch(`${PAYMONGO_API_BASE}/checkout_sessions`, {
      method: "POST",
      headers: {
        // PayMongo secret keys are ASCII, so btoa (unlike Buffer) is safe in
        // Convex's default V8-isolates runtime where Node globals are absent.
        Authorization: `Basic ${btoa(`${paymongoSecretKey()}:`)}`,
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
  } catch (error) {
    throw appError(
      ErrorCode.PAYMENT_PROVIDER,
      `PayMongo request failed: ${error instanceof Error ? error.message : "network error"}`,
    );
  }
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
