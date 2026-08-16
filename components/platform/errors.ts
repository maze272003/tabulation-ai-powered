/**
 * Maps the platform module's typed error codes to user-facing copy, following
 * the error-code → UX convention used across the app.
 */
export function platformErrorMessage(error: unknown, fallback: string): string {
  const code = (error as { data?: { code?: string } })?.data?.code;
  switch (code) {
    case "FORBIDDEN":
      return "You do not have permission to do that.";
    case "NOT_FOUND":
      return "That record no longer exists.";
    case "CONFLICT":
      return "No change needed — the record is already in that state.";
    case "VALIDATION_ERROR":
      return "Please enter a reason before confirming.";
    default:
      return fallback;
  }
}
