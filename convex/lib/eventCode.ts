export const EVENT_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const EVENT_CODE_LENGTH = 8;

export function generateEventCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(EVENT_CODE_LENGTH));
  return Array.from(bytes, (b) => EVENT_CODE_ALPHABET[b % EVENT_CODE_ALPHABET.length]).join("");
}
