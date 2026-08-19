import { appError, ErrorCode } from "./errors";

const PAYMONGO_API_BASE = "https://api.paymongo.com/v1";
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
    } else if ((key === "sig" || key === "sig1") && value !== "") {
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

export const DEFAULT_PAYMENT_METHOD_TYPES: readonly string[] = [
  "card",
  "gcash",
  "paymaya",
  "grab_pay",
  "dob",
  "billease",
  "qrph",
];

export function configuredPaymentMethodTypes(): string[] {
  const envTypes = process.env.PAYMONGO_PAYMENT_METHOD_TYPES;
  if (envTypes) {
    const parsed = envTypes
      .split(",")
      .map((t) => t.trim().toLowerCase())
      .filter((t) => t.length > 0);
    if (parsed.length > 0) return parsed;
  }
  return [...DEFAULT_PAYMENT_METHOD_TYPES];
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
  paymentMethodTypes?: string[];
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
  const paymentMethodTypes =
    input.paymentMethodTypes && input.paymentMethodTypes.length > 0
      ? input.paymentMethodTypes
      : configuredPaymentMethodTypes();

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
            payment_method_types: paymentMethodTypes,
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

export type RetrievedCheckoutSession = {
  id: string;
  status: string;
  referenceNumber: string | null;
  paymentId: string | null;
  paidAmount: number | null;
  isPaid: boolean;
  paymongoPaymentId: string | null;
};

/**
 * Retrieves a checkout session by ID from PayMongo to verify its current payment status.
 */
export async function retrieveCheckoutSession(
  checkoutSessionId: string,
): Promise<RetrievedCheckoutSession> {
  let response: Response;
  try {
    response = await fetch(`${PAYMONGO_API_BASE}/checkout_sessions/${checkoutSessionId}`, {
      method: "GET",
      headers: {
        Authorization: `Basic ${btoa(`${paymongoSecretKey()}:`)}`,
      },
    });
  } catch (error) {
    throw appError(
      ErrorCode.PAYMENT_PROVIDER,
      `PayMongo request failed: ${error instanceof Error ? error.message : "network error"}`,
    );
  }
  const json: unknown = await response.json().catch(() => null);
  if (!response.ok || !isRecord(json) || !isRecord(json.data)) {
    const detail = extractErrorMessage(json);
    throw appError(
      ErrorCode.PAYMENT_PROVIDER,
      `Failed to retrieve PayMongo checkout session${detail ? `: ${detail}` : ""}`,
    );
  }
  const data = json.data;
  const attributes = isRecord(data.attributes) ? data.attributes : {};
  const status = typeof attributes.status === "string" ? attributes.status : "";
  const referenceNumber =
    typeof attributes.reference_number === "string" ? attributes.reference_number : null;

  const metadata = isRecord(attributes.metadata) ? attributes.metadata : {};
  const paymentId = typeof metadata.paymentId === "string" ? metadata.paymentId : null;

  let paidAmount: number | null = null;
  let isPaid = status === "paid";
  let paymongoPaymentId: string | null = null;

  if (Array.isArray(attributes.payments) && attributes.payments.length > 0) {
    for (const p of attributes.payments) {
      if (isRecord(p)) {
        if (typeof p.id === "string" && !paymongoPaymentId) {
          paymongoPaymentId = p.id;
        }
        if (isRecord(p.attributes)) {
          if (typeof p.attributes.amount === "number" && paidAmount === null) {
            paidAmount = p.attributes.amount;
          }
          if (p.attributes.status === "paid") {
            isPaid = true;
            if (typeof p.id === "string") {
              paymongoPaymentId = p.id;
            }
            if (typeof p.attributes.amount === "number") {
              paidAmount = p.attributes.amount;
            }
            break;
          }
        }
      }
    }
  }

  // Also check payment_intent if present
  if (isRecord(attributes.payment_intent) && isRecord(attributes.payment_intent.attributes)) {
    const piAttr = attributes.payment_intent.attributes;
    if (Array.isArray(piAttr.payments) && piAttr.payments.length > 0) {
      const firstPay = piAttr.payments[0];
      if (isRecord(firstPay) && typeof firstPay.id === "string" && !paymongoPaymentId) {
        paymongoPaymentId = firstPay.id;
      }
    }
    if (!isPaid && (piAttr.status === "succeeded" || piAttr.status === "paid")) {
      isPaid = true;
      if (typeof piAttr.amount === "number" && paidAmount === null) {
        paidAmount = piAttr.amount;
      }
    }
  }

  // Also check if paid_at exists or line_items
  if (!isPaid && typeof attributes.paid_at === "number" && attributes.paid_at > 0) {
    isPaid = true;
  }

  if (paidAmount === null && Array.isArray(attributes.line_items) && attributes.line_items.length > 0) {
    const firstItem = attributes.line_items[0];
    if (isRecord(firstItem) && typeof firstItem.amount === "number") {
      paidAmount = firstItem.amount;
    }
  }

  return {
    id: typeof data.id === "string" ? data.id : checkoutSessionId,
    status,
    referenceNumber,
    paymentId,
    paidAmount,
    isPaid,
    paymongoPaymentId,
  };
}

export type CreateRefundInput = {
  amountCents: number;
  paymongoPaymentId: string;
  reason?: "duplicate" | "fraudulent" | "requested_by_customer" | "others";
  notes?: string;
};

export type PaymongoRefundResult = {
  refundId: string;
  status: string;
  amount: number;
};

/**
 * Creates a refund directly via PayMongo's Refund API (POST /v1/refunds).
 */
export async function createPaymongoRefund(
  input: CreateRefundInput,
): Promise<PaymongoRefundResult> {
  let response: Response;
  try {
    response = await fetch(`${PAYMONGO_API_BASE}/refunds`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${btoa(`${paymongoSecretKey()}:`)}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        data: {
          attributes: {
            amount: input.amountCents,
            payment_id: input.paymongoPaymentId,
            reason: input.reason ?? "requested_by_customer",
            notes: input.notes ?? "Refund approved within 10-hour policy",
          },
        },
      }),
    });
  } catch (error) {
    throw appError(
      ErrorCode.PAYMENT_PROVIDER,
      `PayMongo refund request failed: ${error instanceof Error ? error.message : "network error"}`,
    );
  }

  const json: unknown = await response.json().catch(() => null);
  if (!response.ok || !isRecord(json) || !isRecord(json.data)) {
    const detail = extractErrorMessage(json);
    throw appError(
      ErrorCode.PAYMENT_PROVIDER,
      `PayMongo refund failed${detail ? `: ${detail}` : ""}`,
    );
  }

  const data = json.data;
  const attributes = isRecord(data.attributes) ? data.attributes : {};
  const status = typeof attributes.status === "string" ? attributes.status : "succeeded";
  const amount = typeof attributes.amount === "number" ? attributes.amount : input.amountCents;

  return {
    refundId: typeof data.id === "string" ? data.id : "",
    status,
    amount,
  };
}

