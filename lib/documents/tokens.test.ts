import { describe, expect, it } from "vitest";
import { TOKEN_CATALOG, listTokens, resolveTokens, sampleTokenMap } from "./tokens";

describe("tokens", () => {
  it("lists unique tokens in order of appearance", () => {
    expect(listTokens("{{recipient.name}} of {{event.name}} — {{recipient.name}}")).toEqual([
      "recipient.name",
      "event.name",
    ]);
    expect(listTokens("no tokens here")).toEqual([]);
    expect(listTokens("{{Invalid}} {{recipient}}")).toEqual(["recipient"]);
  });

  it("resolves known tokens and falls back to bracketed names for unknown/missing", () => {
    const data = { "recipient.name": "Maria", "event.name": "Grand Gala" };
    expect(resolveTokens("{{recipient.name}} wins {{event.name}}", data)).toBe("Maria wins Grand Gala");
    expect(resolveTokens("{{recipient.rank}} — {{org.name}}", data)).toBe("[recipient.rank] — [org.name]");
  });

  it("exposes the full catalog with a complete sample map", () => {
    const names = TOKEN_CATALOG.map((t) => t.token);
    expect(names).toContain("recipient.name");
    expect(names).toContain("issued.date");
    const sample = sampleTokenMap();
    for (const def of TOKEN_CATALOG) {
      expect(typeof sample[def.token]).toBe("string");
      expect(sample[def.token].length).toBeGreaterThan(0);
    }
  });
});
