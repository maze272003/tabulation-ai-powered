import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { mutation, query } from "../_generated/server";
import type { QueryCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { requireSuperadminSession } from "../lib/superadmin";
import { writeAudit } from "../lib/audit";
import { appError, ErrorCode } from "../lib/errors";

export const LEAD_STAGES = [
  "lead",
  "qualified",
  "proposal",
  "trial",
  "customer",
  "churned",
] as const;

export const leadStageValidator = v.union(
  v.literal("lead"),
  v.literal("qualified"),
  v.literal("proposal"),
  v.literal("trial"),
  v.literal("customer"),
  v.literal("churned"),
);

const PREFIX_BOUND = "\uffff";

async function requireLead(ctx: QueryCtx, leadId: Id<"crmLeads">) {
  const lead = await ctx.db.get(leadId);
  if (!lead) throw appError(ErrorCode.NOT_FOUND, "Lead not found");
  return lead;
}

export const list = query({
  args: {
    token: v.string(),
    paginationOpts: paginationOptsValidator,
    search: v.optional(v.string()),
    stage: v.optional(leadStageValidator),
  },
  handler: async (ctx, args) => {
    await requireSuperadminSession(ctx, args.token);

    const search = args.search?.trim().toLowerCase() ?? "";
    const base = search
      ? ctx.db
          .query("crmLeads")
          .withIndex("by_company_name", (q) =>
            q.gte("companyName", search).lt("companyName", search + PREFIX_BOUND),
          )
      : ctx.db.query("crmLeads").order("desc");
    const scoped = args.stage
      ? base.filter((q) => q.eq(q.field("stage"), args.stage))
      : base;

    const result = await scoped.paginate(args.paginationOpts);
    const page = await Promise.all(
      result.page.map(async (lead) => {
        const convertedOrg = lead.convertedOrgId ? await ctx.db.get(lead.convertedOrgId) : null;
        return {
          lead,
          convertedOrgName: convertedOrg?.name ?? null,
          convertedOrgSlug: convertedOrg?.slug ?? null,
        };
      }),
    );
    return { ...result, page };
  },
});

/**
 * Recent leads for the pipeline board. Bounded scan of the most recently
 * updated leads; the full record set is reachable through `list`.
 */
export const board = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    await requireSuperadminSession(ctx, args.token);
    const leads = await ctx.db.query("crmLeads").order("desc").take(200);
    return Promise.all(
      leads.map(async (lead) => {
        const convertedOrg = lead.convertedOrgId ? await ctx.db.get(lead.convertedOrgId) : null;
        return {
          lead,
          convertedOrgName: convertedOrg?.name ?? null,
          convertedOrgSlug: convertedOrg?.slug ?? null,
        };
      }),
    );
  },
});

export const detail = query({
  args: { token: v.string(), leadId: v.id("crmLeads") },
  handler: async (ctx, args) => {
    await requireSuperadminSession(ctx, args.token);
    const lead = await requireLead(ctx, args.leadId);

    const notes = await ctx.db
      .query("crmNotes")
      .withIndex("by_lead_id", (q) => q.eq("leadId", lead._id))
      .order("desc")
      .take(50);
    const convertedOrg = lead.convertedOrgId ? await ctx.db.get(lead.convertedOrgId) : null;
    return { lead, notes, convertedOrg: convertedOrg ?? null };
  },
});

export const create = mutation({
  args: {
    token: v.string(),
    companyName: v.string(),
    contactName: v.string(),
    contactEmail: v.string(),
    phone: v.optional(v.string()),
    source: v.string(),
    stage: leadStageValidator,
    valueCents: v.number(),
    nextFollowUpAt: v.optional(v.number()),
    summary: v.string(),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const session = await requireSuperadminSession(ctx, args.token);
    const companyName = args.companyName.trim();
    const contactName = args.contactName.trim();
    if (!companyName || !contactName) {
      throw appError(ErrorCode.VALIDATION_ERROR, "Company and contact name are required");
    }
    if (!args.contactEmail.includes("@")) {
      throw appError(ErrorCode.VALIDATION_ERROR, "A valid contact email is required");
    }
    if (args.valueCents < 0) {
      throw appError(ErrorCode.VALIDATION_ERROR, "Deal value cannot be negative");
    }

    const leadId = await ctx.db.insert("crmLeads", {
      companyName,
      contactName,
      contactEmail: args.contactEmail.trim(),
      phone: args.phone?.trim() || undefined,
      source: args.source.trim() || "manual",
      stage: args.stage,
      valueCents: args.valueCents,
      nextFollowUpAt: args.nextFollowUpAt ?? null,
      summary: args.summary.trim(),
      convertedOrgId: null,
      createdById: null,
      updatedAt: Date.now(),
    });
    await writeAudit(ctx, {
      orgId: null,
      actorId: null,
      action: "crm.lead.created",
      resourceType: "crmLead",
      resourceId: leadId,
      before: null,
      after: { companyName, stage: args.stage },
      reason: `superadmin:${session.label} — ${args.reason.trim() || "new lead"}`,
    });
    return leadId;
  },
});

export const update = mutation({
  args: {
    token: v.string(),
    leadId: v.id("crmLeads"),
    companyName: v.optional(v.string()),
    contactName: v.optional(v.string()),
    contactEmail: v.optional(v.string()),
    phone: v.optional(v.string()),
    source: v.optional(v.string()),
    stage: v.optional(leadStageValidator),
    valueCents: v.optional(v.number()),
    nextFollowUpAt: v.optional(v.union(v.null(), v.number())),
    summary: v.optional(v.string()),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const session = await requireSuperadminSession(ctx, args.token);
    const lead = await requireLead(ctx, args.leadId);
    if (lead.stage === "churned" && args.stage && args.stage !== "churned") {
      throw appError(ErrorCode.CONFLICT, "Reactivate a churned lead by reopening it first");
    }
    if (args.valueCents !== undefined && args.valueCents < 0) {
      throw appError(ErrorCode.VALIDATION_ERROR, "Deal value cannot be negative");
    }

    const before: Record<string, unknown> = { stage: lead.stage };
    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (args.companyName !== undefined) patch.companyName = args.companyName.trim();
    if (args.contactName !== undefined) patch.contactName = args.contactName.trim();
    if (args.contactEmail !== undefined) patch.contactEmail = args.contactEmail.trim();
    if (args.phone !== undefined) patch.phone = args.phone.trim() || undefined;
    if (args.source !== undefined) patch.source = args.source.trim();
    if (args.stage !== undefined) patch.stage = args.stage;
    if (args.valueCents !== undefined) patch.valueCents = args.valueCents;
    if (args.nextFollowUpAt !== undefined) patch.nextFollowUpAt = args.nextFollowUpAt;
    if (args.summary !== undefined) patch.summary = args.summary.trim();

    await ctx.db.patch(lead._id, patch);
    await writeAudit(ctx, {
      orgId: null,
      actorId: null,
      action: "crm.lead.updated",
      resourceType: "crmLead",
      resourceId: lead._id,
      before,
      after: patch,
      reason: `superadmin:${session.label} — ${args.reason.trim() || "updated"}`,
    });
  },
});

export const deleteLead = mutation({
  args: { token: v.string(), leadId: v.id("crmLeads"), reason: v.string() },
  handler: async (ctx, args) => {
    const session = await requireSuperadminSession(ctx, args.token);
    const lead = await requireLead(ctx, args.leadId);
    const notes = await ctx.db
      .query("crmNotes")
      .withIndex("by_lead_id", (q) => q.eq("leadId", lead._id))
      .collect();
    for (const note of notes) {
      await ctx.db.delete("crmNotes", note._id);
    }
    await ctx.db.delete("crmLeads", lead._id);
    await writeAudit(ctx, {
      orgId: null,
      actorId: null,
      action: "crm.lead.deleted",
      resourceType: "crmLead",
      resourceId: lead._id,
      before: { companyName: lead.companyName },
      after: null,
      reason: `superadmin:${session.label} — ${args.reason.trim() || "deleted"}`,
    });
  },
});

export const addNote = mutation({
  args: { token: v.string(), leadId: v.id("crmLeads"), body: v.string() },
  handler: async (ctx, args) => {
    await requireSuperadminSession(ctx, args.token);
    const lead = await requireLead(ctx, args.leadId);
    const body = args.body.trim();
    if (!body) throw appError(ErrorCode.VALIDATION_ERROR, "Note cannot be empty");

    await ctx.db.insert("crmNotes", {
      leadId: lead._id,
      orgId: null,
      body,
      createdById: null,
    });
    await ctx.db.patch(lead._id, { summary: body.slice(0, 280), updatedAt: Date.now() });
  },
});

export const linkOrg = mutation({
  args: { token: v.string(), leadId: v.id("crmLeads"), orgId: v.id("organizations"), reason: v.string() },
  handler: async (ctx, args) => {
    const session = await requireSuperadminSession(ctx, args.token);
    const lead = await requireLead(ctx, args.leadId);
    const org = await ctx.db.get(args.orgId);
    if (!org || org.status === "deleted") {
      throw appError(ErrorCode.NOT_FOUND, "Organization not found");
    }

    await ctx.db.patch(lead._id, {
      convertedOrgId: org._id,
      stage: "customer",
      updatedAt: Date.now(),
    });
    await writeAudit(ctx, {
      orgId: org._id,
      actorId: null,
      action: "crm.lead.converted",
      resourceType: "crmLead",
      resourceId: lead._id,
      before: { convertedOrgId: lead.convertedOrgId, stage: lead.stage },
      after: { convertedOrgId: org._id, stage: "customer" },
      reason: `superadmin:${session.label} — ${args.reason.trim() || "converted to customer"}`,
    });
  },
});