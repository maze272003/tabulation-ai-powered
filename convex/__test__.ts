import { query } from "./_generated/server";
import { requireIdentity } from "./lib/auth";

export const whoAmI = query({
  args: {},
  handler: async (ctx) => {
    return (await requireIdentity(ctx)).tokenIdentifier;
  },
});
