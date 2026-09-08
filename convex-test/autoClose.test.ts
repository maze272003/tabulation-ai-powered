import { describe, expect, it } from "vitest";
import { api } from "../convex/_generated/api";
import { aliceIdentity, prepareScoredEvent, setupTest } from "./setup";

async function getRoundStatus(
  t: ReturnType<typeof setupTest>,
): Promise<"open" | "closed" | "published"> {
  const rounds = await t.withIdentity(aliceIdentity).query(api.rounds.list, {
    orgSlug: "acme",
    eventSlug: "gala",
  });
  return rounds[0].status;
}

describe("round auto-close automation", () => {
  it("keeps the round open while any sheet is outstanding", async () => {
    const t = setupTest();
    const ids = await prepareScoredEvent(t);
    const bobSheets = (
      await t.query(api.enter.scoring.myAssignments, { sessionToken: ids.judgeSessions.bob })
    ).rounds[0].sheets;

    await t.mutation(api.enter.scoring.submitSheet, {
      sessionToken: ids.judgeSessions.bob,
      sheetId: bobSheets[0].sheetId,
      values: { [ids.criterionIds[0]]: 8, [ids.criterionIds[1]]: 7 },
    });

    expect(await getRoundStatus(t)).toBe("open");
  });

  it("auto-closes the round atomically with the final submission", async () => {
    const t = setupTest();
    const ids = await prepareScoredEvent(t);
    const bobSheets = (
      await t.query(api.enter.scoring.myAssignments, { sessionToken: ids.judgeSessions.bob })
    ).rounds[0].sheets;
    const carolSheets = (
      await t.query(api.enter.scoring.myAssignments, { sessionToken: ids.judgeSessions.carol })
    ).rounds[0].sheets;

    for (const sheet of bobSheets) {
      await t.mutation(api.enter.scoring.submitSheet, {
        sessionToken: ids.judgeSessions.bob,
        sheetId: sheet.sheetId,
        values: { [ids.criterionIds[0]]: 8, [ids.criterionIds[1]]: 7 },
      });
    }
    expect(await getRoundStatus(t)).toBe("open");

    await t.mutation(api.enter.scoring.submitSheet, {
      sessionToken: ids.judgeSessions.carol,
      sheetId: carolSheets[0].sheetId,
      values: { [ids.criterionIds[0]]: 9, [ids.criterionIds[1]]: 6 },
    });
    expect(await getRoundStatus(t)).toBe("open");

    await t.mutation(api.enter.scoring.submitSheet, {
      sessionToken: ids.judgeSessions.carol,
      sheetId: carolSheets[1].sheetId,
      values: { [ids.criterionIds[0]]: 7, [ids.criterionIds[1]]: 9 },
    });
    expect(await getRoundStatus(t)).toBe("closed");

    const autoCloseAudits = await t.run(async (ctx) =>
      (await ctx.db.query("auditLogs").collect()).filter(
        (entry) => entry.action === "round.auto_closed",
      ),
    );
    expect(autoCloseAudits).toHaveLength(1);
    expect(autoCloseAudits[0].resourceId).toBe(ids.roundId);
    expect(autoCloseAudits[0].actorId).toBeNull();
  });

  it("lets staff reopen an auto-closed round", async () => {
    const t = setupTest();
    const ids = await prepareScoredEvent(t);
    const bobSheets = (
      await t.query(api.enter.scoring.myAssignments, { sessionToken: ids.judgeSessions.bob })
    ).rounds[0].sheets;
    const carolSheets = (
      await t.query(api.enter.scoring.myAssignments, { sessionToken: ids.judgeSessions.carol })
    ).rounds[0].sheets;

    for (const [sessionKey, sheets] of [
      ["bob", bobSheets],
      ["carol", carolSheets],
    ] as const) {
      for (const sheet of sheets) {
        await t.mutation(api.enter.scoring.submitSheet, {
          sessionToken: ids.judgeSessions[sessionKey],
          sheetId: sheet.sheetId,
          values: { [ids.criterionIds[0]]: 8, [ids.criterionIds[1]]: 7 },
        });
      }
    }
    expect(await getRoundStatus(t)).toBe("closed");

    await t.withIdentity(aliceIdentity).mutation(api.roundAdmin.reopenRound, {
      orgSlug: "acme",
      eventSlug: "gala",
      roundId: ids.roundId,
    });
    expect(await getRoundStatus(t)).toBe("open");
  });

  it("a disabled judge's pending sheets block auto-close", async () => {
    const t = setupTest();
    const ids = await prepareScoredEvent(t);
    await t.withIdentity(aliceIdentity).mutation(api.accounts.disable, {
      orgSlug: "acme",
      eventSlug: "gala",
      accountId: ids.judgeIds.carol,
    });
    const bobSheets = (
      await t.query(api.enter.scoring.myAssignments, { sessionToken: ids.judgeSessions.bob })
    ).rounds[0].sheets;

    for (const sheet of bobSheets) {
      await t.mutation(api.enter.scoring.submitSheet, {
        sessionToken: ids.judgeSessions.bob,
        sheetId: sheet.sheetId,
        values: { [ids.criterionIds[0]]: 8, [ids.criterionIds[1]]: 7 },
      });
    }

    expect(await getRoundStatus(t)).toBe("open");
  });
});
