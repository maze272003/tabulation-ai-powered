import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { appError, ErrorCode } from "./lib/errors";
import { requireEventSession, touchSession } from "./lib/eventSession";
import { writeAudit } from "./lib/audit";

const SVG_PATH_REGEX = /^[MmLlHhVvCcSsQqTtAaZz0-9, .\-]+$/;

function validateSvgPath(svgPath: string): void {
  if (!svgPath || !SVG_PATH_REGEX.test(svgPath.trim())) {
    throw appError(ErrorCode.VALIDATION_ERROR, "Invalid SVG vector signature format");
  }
}

/**
 * Deterministically computes a SHA-256 digest of scores.
 */
async function computeScoresHash(
  roundId: Id<"rounds">,
  judgeId: string,
  scores: Array<{ contestantId: string; criterionId: string; value: number }>,
): Promise<string> {
  const sorted = [...scores].sort((a, b) => {
    const contestantCmp = a.contestantId.localeCompare(b.contestantId);
    if (contestantCmp !== 0) return contestantCmp;
    return a.criterionId.localeCompare(b.criterionId);
  });
  const serialized = sorted.map((s) => `${s.contestantId}:${s.criterionId}:${s.value}`).join(";");
  const payload = `${roundId}|${judgeId}|${serialized}`;
  const buffer = new TextEncoder().encode(payload);
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export const registerSignatureSpecimen = mutation({
  args: {
    sessionToken: v.string(),
    svgPath: v.string(),
    signatureType: v.union(v.literal("drawn"), v.literal("typed"), v.literal("uploaded")),
    titleOrAffiliation: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    validateSvgPath(args.svgPath);
    const sctx = await requireEventSession(ctx, {
      sessionToken: args.sessionToken,
    });

    const now = Date.now();
    await ctx.db.patch(sctx.account._id, {
      signatureSpecimen: args.svgPath.trim(),
      signatureType: args.signatureType,
      signatureRegisteredAt: now,
      titleOrAffiliation: args.titleOrAffiliation?.trim() || undefined,
    });

    await touchSession(ctx, sctx.session._id);
    await writeAudit(ctx, {
      orgId: sctx.event.orgId,
      actorId: null,
      action: "signature.specimen_registered",
      resourceType: "eventAccount",
      resourceId: sctx.account._id,
      after: {
        type: args.signatureType,
        registeredAt: now,
      },
    });

    return { success: true };
  },
});

export const getSignatureSpecimen = query({
  args: {
    sessionToken: v.string(),
  },
  handler: async (ctx, args) => {
    const sctx = await requireEventSession(ctx, {
      sessionToken: args.sessionToken,
    });

    return {
      signatureSpecimen: sctx.account.signatureSpecimen ?? null,
      signatureType: sctx.account.signatureType ?? null,
      signatureRegisteredAt: sctx.account.signatureRegisteredAt ?? null,
      titleOrAffiliation: sctx.account.titleOrAffiliation ?? null,
      displayName: sctx.account.displayName,
    };
  },
});

export const authorizeRound = mutation({
  args: {
    sessionToken: v.string(),
    roundId: v.id("rounds"),
    svgPath: v.string(),
    signatureType: v.union(v.literal("drawn"), v.literal("typed"), v.literal("uploaded")),
    judgeNotes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    validateSvgPath(args.svgPath);
    const sctx = await requireEventSession(ctx, {
      sessionToken: args.sessionToken,
      kind: "judge",
      requireReadyEvent: true,
    });

    const round = await ctx.db.get(args.roundId);
    if (!round || round.eventId !== sctx.event._id) {
      throw appError(ErrorCode.NOT_FOUND, "Round not found");
    }

    // Load sheets for this judge and round
    const sheets = await ctx.db
      .query("scoreSheets")
      .withIndex("by_judge_id_and_round_id", (q) =>
        q.eq("judgeId", sctx.account._id).eq("roundId", round._id),
      )
      .collect();

    if (sheets.length === 0) {
      throw appError(ErrorCode.VALIDATION_ERROR, "No score sheets assigned to judge in this round");
    }

    const unsubmitted = sheets.filter((s) => s.status !== "submitted" && s.status !== "locked");
    if (unsubmitted.length > 0) {
      throw appError(
        ErrorCode.CONFLICT,
        `Cannot authorize round: ${unsubmitted.length} score sheet(s) are still pending submission`,
      );
    }

    // Load all scores for this judge in this round
    const scores = await ctx.db
      .query("scores")
      .withIndex("by_event_id_and_round_id", (q) =>
        q.eq("eventId", sctx.event._id).eq("roundId", round._id),
      )
      .collect();

    const judgeScores = scores
      .filter((s) => s.judgeId === sctx.account._id)
      .map((s) => ({
        contestantId: s.contestantId,
        criterionId: s.criterionId,
        value: s.value,
      }));

    const scoresHash = await computeScoresHash(round._id, sctx.account._id, judgeScores);

    // Supersede any existing valid/stale signatures for this judge and round
    const existingSignatures = await ctx.db
      .query("roundSignatures")
      .withIndex("by_round_and_actor", (q) =>
        q.eq("roundId", round._id).eq("actorId", sctx.account._id),
      )
      .collect();

    for (const sig of existingSignatures) {
      if (sig.status === "valid" || sig.status === "stale") {
        await ctx.db.patch(sig._id, { status: "superseded" });
      }
    }

    const now = Date.now();
    const signatureId = await ctx.db.insert("roundSignatures", {
      eventId: sctx.event._id,
      scope: "round",
      roundId: round._id,
      actorType: "eventAccount",
      actorId: sctx.account._id,
      displayName: sctx.account.displayName,
      titleOrAffiliation: sctx.account.titleOrAffiliation,
      role: "judge",
      svgPath: args.svgPath.trim(),
      signatureType: args.signatureType,
      signedAt: now,
      scoresHash,
      judgeNotes: args.judgeNotes?.trim() || undefined,
      status: "valid",
    });

    await touchSession(ctx, sctx.session._id);
    await writeAudit(ctx, {
      orgId: sctx.event.orgId,
      actorId: null,
      action: "round.signature.authorized",
      resourceType: "roundSignature",
      resourceId: signatureId,
      after: {
        roundId: round._id,
        judgeName: sctx.account.displayName,
        scoresHash,
        signedAt: now,
      },
    });

    return { signatureId, scoresHash };
  },
});

export const getRoundCertificationStatus = query({
  args: {
    sessionToken: v.string(),
    roundId: v.id("rounds"),
  },
  handler: async (ctx, args) => {
    const sctx = await requireEventSession(ctx, {
      sessionToken: args.sessionToken,
    });

    const round = await ctx.db.get(args.roundId);
    if (!round || round.eventId !== sctx.event._id) {
      throw appError(ErrorCode.NOT_FOUND, "Round not found");
    }

    const judges = await ctx.db
      .query("eventAccounts")
      .withIndex("by_event_id_and_kind", (q) =>
        q.eq("eventId", sctx.event._id).eq("kind", "judge"),
      )
      .collect();

    const sheets = await ctx.db
      .query("scoreSheets")
      .withIndex("by_event_id_and_round_id", (q) =>
        q.eq("eventId", sctx.event._id).eq("roundId", round._id),
      )
      .collect();

    const scores = await ctx.db
      .query("scores")
      .withIndex("by_event_id_and_round_id", (q) =>
        q.eq("eventId", sctx.event._id).eq("roundId", round._id),
      )
      .collect();

    const signatures = await ctx.db
      .query("roundSignatures")
      .withIndex("by_round_id", (q) => q.eq("roundId", round._id))
      .collect();

    const judgeStatuses = await Promise.all(
      judges.map(async (judge) => {
        const judgeSheets = sheets.filter((s) => s.judgeId === judge._id);
        const submittedSheets = judgeSheets.filter(
          (s) => s.status === "submitted" || s.status === "locked",
        );
        const isComplete = judgeSheets.length > 0 && submittedSheets.length === judgeSheets.length;

        // Find active signature (valid, stale, or overridden)
        const activeSig = signatures
          .filter((sig) => sig.actorId === judge._id && sig.status !== "superseded")
          .sort((a, b) => b.signedAt - a.signedAt)[0];

        let status: "signed" | "stale" | "pending" | "incomplete" | "overridden" = "incomplete";

        if (activeSig?.status === "overridden") {
          status = "overridden";
        } else if (activeSig && activeSig.status !== "superseded") {
          // Compute live score digest to verify if scores were changed post-signature
          const currentJudgeScores = scores
            .filter((s) => s.judgeId === judge._id)
            .map((s) => ({
              contestantId: s.contestantId,
              criterionId: s.criterionId,
              value: s.value,
            }));

          const liveHash = await computeScoresHash(round._id, judge._id, currentJudgeScores);
          if (liveHash !== activeSig.scoresHash || activeSig.status === "stale") {
            status = "stale";
          } else {
            status = "signed";
          }
        } else if (isComplete) {
          status = "pending";
        } else {
          status = "incomplete";
        }

        return {
          judgeId: judge._id,
          name: judge.displayName,
          titleOrAffiliation: judge.titleOrAffiliation ?? null,
          sheetsSubmitted: submittedSheets.length,
          sheetsTotal: judgeSheets.length,
          status,
          signedAt: activeSig?.signedAt ?? null,
          svgPath: activeSig?.svgPath ?? null,
          signatureType: activeSig?.signatureType ?? null,
          scoresHash: activeSig?.scoresHash ?? null,
          overrideReason: activeSig?.overrideReason ?? null,
          overrideAttachmentStorageId: activeSig?.overrideAttachmentStorageId ?? null,
          judgeNotes: activeSig?.judgeNotes ?? null,
        };
      }),
    );

    const activeJudges = judgeStatuses.filter((j) => j.sheetsTotal > 0);
    const allJudgesCertified =
      activeJudges.length > 0 &&
      activeJudges.every((j) => j.status === "signed" || j.status === "overridden");

    const scrutineerSig = signatures
      .filter((s) => s.role === "scrutineer" && s.status === "valid")
      .sort((a, b) => b.signedAt - a.signedAt)[0];

    return {
      roundId: round._id,
      roundName: round.name,
      roundStatus: round.status,
      judges: judgeStatuses,
      allJudgesCertified,
      scrutineerSignature: scrutineerSig
        ? {
            actorId: scrutineerSig.actorId,
            displayName: scrutineerSig.displayName,
            svgPath: scrutineerSig.svgPath,
            signedAt: scrutineerSig.signedAt,
          }
        : null,
      canPublish: allJudgesCertified && Boolean(scrutineerSig),
    };
  },
});

export const nudgeJudge = mutation({
  args: {
    sessionToken: v.string(),
    roundId: v.id("rounds"),
    judgeId: v.id("eventAccounts"),
    message: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const sctx = await requireEventSession(ctx, {
      sessionToken: args.sessionToken,
      kind: "staff",
      requireReadyEvent: true,
    });

    const judge = await ctx.db.get(args.judgeId);
    if (!judge || judge.eventId !== sctx.event._id) {
      throw appError(ErrorCode.NOT_FOUND, "Judge not found");
    }

    const now = Date.now();
    await ctx.db.patch(judge._id, {
      lastNudgeAt: now,
      lastNudgeMessage: args.message?.trim() || "Staff request: Please review and sign your scorecard.",
    });

    await touchSession(ctx, sctx.session._id);
    await writeAudit(ctx, {
      orgId: sctx.event.orgId,
      actorId: null,
      action: "round.judge.nudged",
      resourceType: "eventAccount",
      resourceId: judge._id,
      after: {
        roundId: args.roundId,
        judgeName: judge.displayName,
        nudgedBy: sctx.account.displayName,
      },
    });

    return { success: true };
  },
});

export const overrideJudgeSignature = mutation({
  args: {
    sessionToken: v.string(),
    roundId: v.id("rounds"),
    judgeId: v.id("eventAccounts"),
    reason: v.string(),
    attachmentStorageId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const sctx = await requireEventSession(ctx, {
      sessionToken: args.sessionToken,
      kind: "staff",
      requireReadyEvent: true,
    });

    if (!args.reason || args.reason.trim().length < 10) {
      throw appError(
        ErrorCode.VALIDATION_ERROR,
        "A detailed reason of at least 10 characters is required for an emergency override.",
      );
    }

    const round = await ctx.db.get(args.roundId);
    if (!round || round.eventId !== sctx.event._id) {
      throw appError(ErrorCode.NOT_FOUND, "Round not found");
    }

    const judge = await ctx.db.get(args.judgeId);
    if (!judge || judge.eventId !== sctx.event._id) {
      throw appError(ErrorCode.NOT_FOUND, "Judge not found");
    }

    // Compute scores hash for judge if any exist
    const scores = await ctx.db
      .query("scores")
      .withIndex("by_event_id_and_round_id", (q) =>
        q.eq("eventId", sctx.event._id).eq("roundId", round._id),
      )
      .collect();

    const judgeScores = scores
      .filter((s) => s.judgeId === judge._id)
      .map((s) => ({
        contestantId: s.contestantId,
        criterionId: s.criterionId,
        value: s.value,
      }));

    const scoresHash = await computeScoresHash(round._id, judge._id, judgeScores);

    // Supersede any existing signatures for this judge and round
    const existingSignatures = await ctx.db
      .query("roundSignatures")
      .withIndex("by_round_and_actor", (q) =>
        q.eq("roundId", round._id).eq("actorId", judge._id),
      )
      .collect();

    for (const sig of existingSignatures) {
      await ctx.db.patch(sig._id, { status: "superseded" });
    }

    const now = Date.now();
    const signatureId = await ctx.db.insert("roundSignatures", {
      eventId: sctx.event._id,
      scope: "round",
      roundId: round._id,
      actorType: "eventAccount",
      actorId: judge._id,
      displayName: judge.displayName,
      titleOrAffiliation: judge.titleOrAffiliation,
      role: "judge",
      svgPath: "M0 0", // Placeholder for overridden paper signatures
      signatureType: "drawn",
      signedAt: now,
      scoresHash,
      status: "overridden",
      overrideReason: args.reason.trim(),
      overrideAttachmentStorageId: args.attachmentStorageId,
      overriddenBy: sctx.account.displayName,
    });

    await touchSession(ctx, sctx.session._id);
    await writeAudit(ctx, {
      orgId: sctx.event.orgId,
      actorId: null,
      action: "round.signature.overridden",
      resourceType: "roundSignature",
      resourceId: signatureId,
      after: {
        roundId: round._id,
        judgeName: judge.displayName,
        overriddenBy: sctx.account.displayName,
        reason: args.reason.trim(),
      },
    });

    return { signatureId };
  },
});

export const scrutineerCountersign = mutation({
  args: {
    sessionToken: v.string(),
    roundId: v.id("rounds"),
    svgPath: v.string(),
    signatureType: v.union(v.literal("drawn"), v.literal("typed"), v.literal("uploaded")),
  },
  handler: async (ctx, args) => {
    validateSvgPath(args.svgPath);
    const sctx = await requireEventSession(ctx, {
      sessionToken: args.sessionToken,
      kind: "staff",
      requireReadyEvent: true,
    });

    const round = await ctx.db.get(args.roundId);
    if (!round || round.eventId !== sctx.event._id) {
      throw appError(ErrorCode.NOT_FOUND, "Round not found");
    }

    // Supersede any existing scrutineer signature for this round
    const existing = await ctx.db
      .query("roundSignatures")
      .withIndex("by_round_and_actor", (q) =>
        q.eq("roundId", round._id).eq("actorId", sctx.account._id),
      )
      .collect();

    for (const sig of existing) {
      if (sig.role === "scrutineer") {
        await ctx.db.patch(sig._id, { status: "superseded" });
      }
    }

    const now = Date.now();
    const signatureId = await ctx.db.insert("roundSignatures", {
      eventId: sctx.event._id,
      scope: "round",
      roundId: round._id,
      actorType: "eventAccount",
      actorId: sctx.account._id,
      displayName: sctx.account.displayName,
      titleOrAffiliation: "Chief Scrutineer",
      role: "scrutineer",
      svgPath: args.svgPath.trim(),
      signatureType: args.signatureType,
      signedAt: now,
      scoresHash: "SCRUTINEER_COUNTERSIGN",
      status: "valid",
    });

    await touchSession(ctx, sctx.session._id);
    await writeAudit(ctx, {
      orgId: sctx.event.orgId,
      actorId: null,
      action: "round.scrutineer.countersigned",
      resourceType: "roundSignature",
      resourceId: signatureId,
      after: {
        roundId: round._id,
        scrutineerName: sctx.account.displayName,
        signedAt: now,
      },
    });

    return { signatureId };
  },
});

export const getPublicVerificationRecord = query({
  args: {
    verificationHash: v.string(),
  },
  handler: async (ctx, args) => {
    if (!args.verificationHash || args.verificationHash.trim().length === 0) {
      return null;
    }

    // Search resultVersions for matching verificationHash
    const versions = await ctx.db.query("resultVersions").collect();
    const match = versions.find((v) => v.snapshot.verificationHash === args.verificationHash);
    if (!match) return null;

    const event = await ctx.db.get(match.eventId);
    const round = await ctx.db.get(match.roundId);
    if (!event || !round) return null;

    const contestants = await ctx.db
      .query("contestants")
      .withIndex("by_event_id", (q) => q.eq("eventId", event._id))
      .collect();

    const nameMap = new Map(contestants.map((k) => [k._id, k.name]));

    const standings = match.snapshot.categories.flatMap((cat) =>
      cat.standings.map((s) => ({
        rank: s.rank,
        contestantName: nameMap.get(s.contestantId) ?? "Unknown",
        roundScore: s.roundScore,
      })),
    );

    const certifications = (match.snapshot.certifications ?? []).map((c) => ({
      displayName: c.displayName,
      titleOrAffiliation: c.titleOrAffiliation ?? null,
      role: c.role,
      signedAt: c.signedAt,
      isOverride: c.isOverride,
      svgPath: c.svgPath,
    }));

    return {
      eventName: event.name,
      roundName: round.name,
      publishedAt: match.createdAt,
      decimalPrecision: match.snapshot.decimalPrecision,
      standings,
      certifications,
      verificationHash: args.verificationHash,
    };
  },
});

export const generateAttachmentUploadUrl = mutation({
  args: {
    sessionToken: v.string(),
  },
  handler: async (ctx, args) => {
    await requireEventSession(ctx, {
      sessionToken: args.sessionToken,
      kind: "staff",
      requireReadyEvent: true,
    });
    return await ctx.storage.generateUploadUrl();
  },
});

export const getAttachmentUrl = query({
  args: {
    sessionToken: v.string(),
    storageId: v.string(),
  },
  handler: async (ctx, args) => {
    await requireEventSession(ctx, {
      sessionToken: args.sessionToken,
    });
    return await ctx.storage.getUrl(args.storageId);
  },
});

export const getRoundAuditSheetData = query({
  args: {
    sessionToken: v.string(),
    roundId: v.id("rounds"),
  },
  handler: async (ctx, args) => {
    const sctx = await requireEventSession(ctx, {
      sessionToken: args.sessionToken,
    });

    const round = await ctx.db.get(args.roundId);
    if (!round || round.eventId !== sctx.event._id) {
      throw appError(ErrorCode.NOT_FOUND, "Round not found");
    }

    const org = await ctx.db.get(sctx.event.orgId);

    // Latest result version if published
    const versions = await ctx.db
      .query("resultVersions")
      .withIndex("by_round_id", (q) => q.eq("roundId", round._id))
      .collect();
    const latestVersion = versions.sort((a, b) => b.version - a.version)[0];

    // Contestants map
    const contestants = await ctx.db
      .query("contestants")
      .withIndex("by_event_id", (q) => q.eq("eventId", sctx.event._id))
      .collect();
    const contestantMap = new Map(contestants.map((c) => [c._id, c]));

    // Round criteria
    const criteria = await ctx.db
      .query("criteria")
      .withIndex("by_round_id", (q) => q.eq("roundId", round._id))
      .collect();

    // Signatures
    const signatures = await ctx.db
      .query("roundSignatures")
      .withIndex("by_round_id", (q) => q.eq("roundId", round._id))
      .collect();

    const judges = await ctx.db
      .query("eventAccounts")
      .withIndex("by_event_id_and_kind", (q) =>
        q.eq("eventId", sctx.event._id).eq("kind", "judge"),
      )
      .collect();

    // Map judge signatures
    const judgeSignatures = judges.map((judge) => {
      const activeSig = signatures
        .filter((s) => s.actorId === judge._id && s.status !== "superseded")
        .sort((a, b) => b.signedAt - a.signedAt)[0];

      return {
        judgeId: judge._id,
        name: judge.displayName,
        titleOrAffiliation: judge.titleOrAffiliation ?? null,
        status: activeSig?.status ?? "pending",
        signedAt: activeSig?.signedAt ?? null,
        svgPath: activeSig?.svgPath ?? null,
        isOverride: activeSig?.status === "overridden",
        overrideReason: activeSig?.overrideReason ?? null,
        scoresHash: activeSig?.scoresHash ?? null,
      };
    });

    const scrutineerSig = signatures
      .filter((s) => s.role === "scrutineer" && s.status === "valid")
      .sort((a, b) => b.signedAt - a.signedAt)[0];

    const categories = await ctx.db
      .query("categories")
      .withIndex("by_event_id", (q) => q.eq("eventId", sctx.event._id))
      .collect();
    const categoryMap = new Map(categories.map((c) => [c._id, c.name]));

    // Standings from published snapshot or fallback
    let standings: Array<{
      rank: number;
      contestantNumber: number;
      contestantName: string;
      categoryName?: string;
      roundScore: number;
    }> = [];

    if (latestVersion?.snapshot) {
      standings = latestVersion.snapshot.categories.flatMap((cat) =>
        cat.standings.map((s) => {
          const c = contestantMap.get(s.contestantId);
          return {
            rank: s.rank ?? 0,
            contestantNumber: c?.number ?? 0,
            contestantName: c?.name ?? "Unknown",
            categoryName: categoryMap.get(cat.categoryId),
            roundScore: s.roundScore ?? 0,
          };
        }),
      );
    } else {
      standings = contestants.map((c, idx) => ({
        rank: idx + 1,
        contestantNumber: c.number,
        contestantName: c.name,
        roundScore: 0,
      }));
    }

    return {
      eventName: sctx.event.name,
      orgName: org?.name ?? "Official Tabulation Committee",
      roundName: round.name,
      roundStatus: round.status,
      decimalPrecision: sctx.event.decimalPrecision,
      publishedAt: latestVersion?.createdAt ?? null,
      verificationHash: latestVersion?.snapshot.verificationHash ?? null,
      standings,
      criteria: criteria.map((crit) => ({
        id: crit._id,
        name: crit.name,
        weight: crit.weight,
        maxScore: crit.maxScore,
      })),
      judges: judgeSignatures,
      scrutineer: scrutineerSig
        ? {
            name: scrutineerSig.displayName,
            titleOrAffiliation: scrutineerSig.titleOrAffiliation ?? "Chief Scrutineer",
            signedAt: scrutineerSig.signedAt,
            svgPath: scrutineerSig.svgPath,
          }
        : null,
    };
  },
});


