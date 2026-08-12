import { describe, expect, it } from "vitest";
import { api } from "../convex/_generated/api";
import { setupTest } from "./setup";

describe("authz helpers", () => {
  it("requireIdentity throws for anonymous callers", async () => {
    const t = setupTest();
    await expect(t.query(api.__test__.whoAmI, {})).rejects.toThrow();
  });
});
