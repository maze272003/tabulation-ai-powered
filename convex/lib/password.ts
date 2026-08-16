export const MIN_PASSWORD_LENGTH = 8;
export const USERNAME_PATTERN = /^[a-z0-9_.-]{3,32}$/;

const PBKDF2_ITERATIONS = 100_000;
const SALT_BYTES = 16;
const KEY_BYTES = 32;
// Fixed salt so unknown-username logins burn the same PBKDF2 work as real ones.
const DUMMY_SALT_B64URL = "AAAAAAAAAAAAAAAAAAAAAA";

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  return Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
}

async function deriveBits(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, KEY_BYTES * 8,
  );
  return new Uint8Array(bits);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const hash = await deriveBits(password, salt, PBKDF2_ITERATIONS);
  return `${PBKDF2_ITERATIONS}.${toBase64Url(salt)}.${toBase64Url(hash)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [iterationsRaw, saltB64, hashB64] = stored.split(".");
  const iterations = Number(iterationsRaw);
  if (!Number.isInteger(iterations) || iterations < 1 || !saltB64 || !hashB64) return false;
  const salt = fromBase64Url(saltB64);
  const expected = fromBase64Url(hashB64);
  if (salt.length === 0 || expected.length === 0) return false;
  const actual = await deriveBits(password, salt, iterations);
  if (actual.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < actual.length; i++) diff |= actual[i] ^ expected[i];
  return diff === 0;
}

export async function timingSafeDummyVerify(password: string): Promise<void> {
  await deriveBits(password, fromBase64Url(DUMMY_SALT_B64URL), PBKDF2_ITERATIONS);
}
