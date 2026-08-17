import { ConvexError } from "convex/values";
import type { Value } from "convex/values";

export const ErrorCode = {
  UNAUTHENTICATED: "UNAUTHENTICATED",
  PROFILE_NOT_PROVISIONED: "PROFILE_NOT_PROVISIONED",
  FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  VALIDATION_ERROR: "VALIDATION_ERROR",
  LIMIT_EXCEEDED: "LIMIT_EXCEEDED",
  FEATURE_UNAVAILABLE: "FEATURE_UNAVAILABLE",
  CONFLICT: "CONFLICT",
  TIES_UNRESOLVED: "TIES_UNRESOLVED",
  PAYMENT_PROVIDER: "PAYMENT_PROVIDER",
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export type AppErrorData = {
  code: ErrorCode;
  message: string;
  context?: Record<string, Value>;
};

export function appError(
  code: ErrorCode,
  message: string,
  context?: Record<string, Value>,
): ConvexError<AppErrorData> {
  const err = new ConvexError<AppErrorData>({ code, message, context });
  err.message = message;
  return err;
}
