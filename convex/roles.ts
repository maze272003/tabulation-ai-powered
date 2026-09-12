import { query } from "./_generated/server";
import { requireIdentity } from "./lib/auth";

export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireIdentity(ctx);
    return ctx.db
      .query("roles")
      .withIndex("by_scope", (q) => q.eq("scope", "organization"))
      .collect();
  },
});
