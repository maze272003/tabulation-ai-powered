import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { writeAudit } from "./audit";

const COMPLETE_SHEET_STATUSES = new Set(["submitted", "locked"]);

/**
 * Closes a round the moment its judging workload is fully complete.
 *
 * Called from `submitSheet` inside the same transaction as the final sheet
 * submission, so the transition is atomic with it and staff see a reviewable
 * round immediately instead of having to close it by hand. Conservative by
 * design: rounds that are not open, rounds without any sheets, and rounds
 * where any judge still has an outstanding sheet are left untouched, so a
 * disabled judge's pending work blocks auto-close until resolved.
 *
 * Returns true when the round was closed here; false is a no-op, never an error.
 */
export async function maybeAutoCloseRound(
  ctx: MutationCtx,
  args: { roundId: Id<"rounds"> },
): Promise<boolean> {
  const round = await ctx.db.get(args.roundId);
  if (!round || round.status !== "open") return false;

  const sheets = await ctx.db
    .query("scoreSheets")
    .withIndex("by_event_id_and_round_id", (q) =>
      q.eq("eventId", round.eventId).eq("roundId", round._id),
    )
    .collect();
  if (sheets.length === 0) return false;
  if (sheets.some((s) => !COMPLETE_SHEET_STATUSES.has(s.status))) return false;

  const event = await ctx.db.get(round.eventId);
  if (!event) return false;

  await ctx.db.patch(round._id, { status: "closed" });
  await writeAudit(ctx, {
    orgId: event.orgId,
    actorId: null,
    action: "round.auto_closed",
    resourceType: "round",
    resourceId: round._id,
    before: { status: "open" },
    after: { status: "closed", sheetsCompleted: sheets.length },
  });
  return true;
}
