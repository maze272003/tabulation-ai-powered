import { v } from "convex/values";
import { query } from "./_generated/server";
import { latestVersion } from "./lib/eventResults";

export const get = query({
  args: { eventCode: v.string() },
  handler: async (ctx, args) => {
    const event = await ctx.db
      .query("events")
      .withIndex("by_event_code", (q) => q.eq("eventCode", args.eventCode))
      .unique();
    // Returning null for missing, non-public, and archived events alike keeps
    // the outcome identical, so the endpoint never leaks the existence of
    // private events.
    if (!event || event.resultVisibility !== "public" || event.status === "archived") {
      return null;
    }

    const categories = (await ctx.db
      .query("categories")
      .withIndex("by_event_id", (q) => q.eq("eventId", event._id))
      .collect()).sort((a, b) => a.order - b.order);

    const contestants = await ctx.db
      .query("contestants")
      .withIndex("by_event_id", (q) => q.eq("eventId", event._id))
      .collect();
    const contestantById = new Map(contestants.map((contestant) => [contestant._id, contestant]));

    const publishedRounds = (await ctx.db
      .query("rounds")
      .withIndex("by_event_id", (q) => q.eq("eventId", event._id))
      .collect())
      .filter((round) => round.status === "published")
      .sort((a, b) => a.order - b.order);

    const rounds = [];
    for (const round of publishedRounds) {
      const version = await latestVersion(ctx, round._id);
      if (!version) continue;
      rounds.push({
        roundId: round._id,
        name: round.name,
        order: round.order,
        categories: version.snapshot.categories.map((category) => ({
          categoryId: category.categoryId,
          standings: category.standings
            .filter((standing) => standing.status === "active")
            .map((standing) => {
              const contestant = contestantById.get(standing.contestantId);
              return {
                number: contestant?.number ?? 0,
                name: contestant?.name ?? "",
                photoUrl: contestant?.photoUrl ?? null,
                rank: standing.rank,
                roundScore: standing.roundScore,
                advanced: standing.advanced,
              };
            })
            .sort((a, b) => (a.rank ?? Number.MAX_SAFE_INTEGER) - (b.rank ?? Number.MAX_SAFE_INTEGER)),
        })),
      });
    }

    return {
      event: { name: event.name, branding: event.branding },
      categories: categories.map((category) => ({ id: category._id, name: category.name })),
      rounds,
    };
  },
});
