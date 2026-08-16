import { toast } from "sonner";

interface ConvexErrorBody {
  code?: string;
  message?: string;
}

/**
 * Convex mutations reject with errors whose `data` payload carries a typed
 * error code and a user-facing message. Extracts that payload from an unknown
 * rejection without weakening the caller's typing.
 */
function convexErrorBody(error: unknown): ConvexErrorBody {
  return (error as { data?: ConvexErrorBody })?.data ?? {};
}

/**
 * Reports a failed mutation as an error toast. Known error codes are mapped to
 * module-specific copy via `codeMessages`; everything else falls back to the
 * server-provided message, then to `fallback`.
 */
export function toastMutationError(
  error: unknown,
  options: { fallback?: string; codeMessages?: Record<string, string> } = {},
): void {
  const { fallback = "Action failed.", codeMessages = {} } = options;
  const body = convexErrorBody(error);
  const codeMessage = body.code !== undefined ? codeMessages[body.code] : undefined;
  if (codeMessage !== undefined) {
    toast.error(codeMessage);
    return;
  }
  const message = body.message ?? (error instanceof Error ? error.message : undefined);
  toast.error(message ?? fallback);
}
