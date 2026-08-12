import { query } from "./_generated/server";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("plans").collect();
    return rows.sort((a, b) => a.sortOrder - b.sortOrder);
  },
});
