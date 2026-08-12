import { query } from "./_generated/server";

export const list = query({
  args: {},
  handler: async (ctx) => {
    return ctx.db
      .query("roles")
      .withIndex("by_scope", (q) => q.eq("scope", "organization"))
      .collect();
  },
});
