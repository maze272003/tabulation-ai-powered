import { TOKEN_PATTERN } from "../../convex/documents/spec";

export type TokenMap = Record<string, string>;

export interface TokenDef {
  token: string;
  label: string;
}

export const TOKEN_CATALOG: TokenDef[] = [
  { token: "recipient.name", label: "Recipient name" },
  { token: "recipient.number", label: "Contestant number" },
  { token: "recipient.rank", label: "Final rank" },
  { token: "recipient.category", label: "Category" },
  { token: "event.name", label: "Event name" },
  { token: "event.venue", label: "Venue" },
  { token: "event.date", label: "Event date" },
  { token: "org.name", label: "Organization" },
  { token: "issued.date", label: "Issue date" },
];

/** Unique `{{namespace.field}}` tokens in order of appearance; malformed braces are ignored. */
export function listTokens(content: string): string[] {
  const seen = new Set<string>();
  for (const match of content.matchAll(TOKEN_PATTERN)) {
    const token = match[1];
    if (token && !seen.has(token)) seen.add(token);
  }
  return [...seen];
}

/** Replaces tokens with data values; unresolved tokens render as `[token]` (never throw). */
export function resolveTokens(content: string, data: TokenMap): string {
  return content.replace(TOKEN_PATTERN, (_full, token: string) => data[token] ?? `[${token}]`);
}

/** Sample data used by the editor canvas and sample-PDF preview. */
export function sampleTokenMap(): TokenMap {
  return {
    "recipient.name": "Juan Dela Cruz",
    "recipient.number": "7",
    "recipient.rank": "Champion",
    "recipient.category": "Senior Division",
    "event.name": "Grand Gala Night 2026",
    "event.venue": "Grand Hall",
    "event.date": "August 20, 2026",
    "org.name": "Acme Events",
    "issued.date": new Date().toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric",
    }),
  };
}
