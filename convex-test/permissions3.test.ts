import { describe, expect, it } from "vitest";
import { aliceIdentity, seedAndProvision, setupTest } from "./setup";

const EXPECTED: Record<string, string[]> = {
  "Org Owner": ["score.manage", "result.view"],
};

describe("score permissions wiring", () => {
  it("seeds new permissions and role links", async () => {
    const t = setupTest();
    await seedAndProvision(t, aliceIdentity);
    const result = await t.run(async (q) => {
      const perms = await q.db.query("permissions").collect();
      const roles = await q.db.query("roles").collect();
      const out: Record<string, string[]> = {};
      for (const role of roles) {
        const links = await q.db
          .query("rolePermissions")
          .withIndex("by_role_id", (q2) => q2.eq("roleId", role._id))
          .collect();
        out[role.name] = links
          .map((l) => perms.find((p) => p._id === l.permissionId)!.name)
          .filter((n) => n === "score.enter" || n === "score.manage" || n === "result.view")
          .sort();
      }
      return { out, permNames: perms.map((p) => p.name) };
    });
    for (const [role, perms] of Object.entries(EXPECTED)) {
      expect(result.out[role]).toEqual([...perms].sort());
    }
    expect(result.permNames).toContain("score.enter");
    expect(result.permNames).toContain("score.manage");
    expect(result.permNames).toContain("result.view");
  });
});
