import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { requireOrgMember, requirePermission } from "../lib/authz";
import { appError, ErrorCode } from "../lib/errors";
import { writeAudit } from "../lib/audit";
import { isDocumentSpec } from "./spec";
import { deleteUnreferencedOrgAssets } from "./assets";

export const list = query({
  args: {
    orgSlug: v.string(),
    kind: v.optional(v.union(v.literal("certificate"), v.literal("results"), v.literal("judgeSheet"))),
  },
  handler: async (ctx, args) => {
    const actx = await requireOrgMember(ctx, { orgSlug: args.orgSlug });
    const kind = args.kind ?? "certificate";
    const system = await ctx.db
      .query("documentTemplates")
      .withIndex("by_kind", (q) => q.eq("kind", kind))
      .filter((q) => q.eq(q.field("isSystem"), true))
      .collect();
    const orgTemplates = await ctx.db
      .query("documentTemplates")
      .withIndex("by_org_id", (q) => q.eq("orgId", actx.org._id))
      .filter((q) => q.eq(q.field("kind"), kind))
      .collect();
    return [...system, ...orgTemplates];
  },
});

type TemplateDoc = Doc<"documentTemplates">;

// Reads only need org membership; write paths pass "documents.manage" so the
// visibility check and the permission check share one org resolution.
async function requireVisibleTemplate(
  ctx: QueryCtx,
  args: { orgSlug: string; templateId: Id<"documentTemplates"> },
  permission?: string,
): Promise<{ template: TemplateDoc; orgId: Id<"organizations">; userId: Id<"userProfiles"> }> {
  const actx = permission
    ? await requirePermission(ctx, { orgSlug: args.orgSlug, permission })
    : await requireOrgMember(ctx, { orgSlug: args.orgSlug });
  const template = await ctx.db.get(args.templateId);
  if (!template || (!template.isSystem && template.orgId !== actx.org._id)) {
    throw appError(ErrorCode.NOT_FOUND, "Template not found");
  }
  return { template, orgId: actx.org._id, userId: actx.user._id };
}

export const get = query({
  args: { orgSlug: v.string(), templateId: v.id("documentTemplates") },
  handler: async (ctx, args) => {
    const { template } = await requireVisibleTemplate(ctx, args);
    return template;
  },
});

export const create = mutation({
  args: { orgSlug: v.string(), name: v.string(), kind: v.string(), spec: v.any() },
  handler: async (ctx, args) => {
    const actx = await requirePermission(ctx, { orgSlug: args.orgSlug, permission: "documents.manage" });
    const name = args.name.trim();
    if (!name) throw appError(ErrorCode.VALIDATION_ERROR, "Name must not be empty");
    const kind = args.kind === "certificate" || args.kind === "results" || args.kind === "judgeSheet"
      ? args.kind
      : null;
    if (!kind) throw appError(ErrorCode.VALIDATION_ERROR, "Invalid template kind");
    if (!isDocumentSpec(args.spec)) throw appError(ErrorCode.VALIDATION_ERROR, "Invalid document spec");
    const now = Date.now();
    const templateId = await ctx.db.insert("documentTemplates", {
      orgId: actx.org._id,
      kind,
      name,
      description: "",
      spec: args.spec,
      isSystem: false,
      updatedBy: actx.user._id,
      updatedAt: now,
    });
    await writeAudit(ctx, {
      orgId: actx.org._id, actorId: actx.user._id, action: "documentTemplate.created",
      resourceType: "documentTemplate", resourceId: templateId, after: { name },
    });
    return { templateId, updatedAt: now };
  },
});

export const update = mutation({
  args: {
    orgSlug: v.string(),
    templateId: v.id("documentTemplates"),
    name: v.optional(v.string()),
    spec: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const { template, orgId, userId } = await requireVisibleTemplate(ctx, args, "documents.manage");
    if (template.isSystem) throw appError(ErrorCode.FORBIDDEN, "System templates cannot be edited");
    const now = Date.now();
    const patch: Partial<TemplateDoc> = { updatedBy: userId, updatedAt: now };
    if (args.name !== undefined) {
      const name = args.name.trim();
      if (!name) throw appError(ErrorCode.VALIDATION_ERROR, "Name must not be empty");
      patch.name = name;
    }
    if (args.spec !== undefined) {
      if (!isDocumentSpec(args.spec)) throw appError(ErrorCode.VALIDATION_ERROR, "Invalid document spec");
      patch.spec = args.spec;
    }
    await ctx.db.patch(args.templateId, patch);
    await writeAudit(ctx, {
      orgId, actorId: userId, action: "documentTemplate.updated",
      resourceType: "documentTemplate", resourceId: args.templateId,
      after: { name: patch.name ?? template.name },
    });
    return { updatedAt: now };
  },
});

export const duplicate = mutation({
  args: { orgSlug: v.string(), templateId: v.id("documentTemplates"), name: v.string() },
  handler: async (ctx, args) => {
    const actx = await requirePermission(ctx, { orgSlug: args.orgSlug, permission: "documents.manage" });
    const source = await ctx.db.get(args.templateId);
    if (!source || (!source.isSystem && source.orgId !== actx.org._id)) {
      throw appError(ErrorCode.NOT_FOUND, "Template not found");
    }
    const name = args.name.trim();
    if (!name) throw appError(ErrorCode.VALIDATION_ERROR, "Name must not be empty");
    const now = Date.now();
    const newId = await ctx.db.insert("documentTemplates", {
      orgId: actx.org._id,
      kind: source.kind,
      name,
      description: source.description,
      spec: source.spec,
      isSystem: false,
      sourceTemplateId: source._id,
      updatedBy: actx.user._id,
      updatedAt: now,
    });
    await writeAudit(ctx, {
      orgId: actx.org._id, actorId: actx.user._id, action: "documentTemplate.duplicated",
      resourceType: "documentTemplate", resourceId: newId, after: { name, sourceId: source._id },
    });
    return { templateId: newId, updatedAt: now };
  },
});

export const remove = mutation({
  args: { orgSlug: v.string(), templateId: v.id("documentTemplates") },
  handler: async (ctx, args) => {
    const { template, orgId, userId } = await requireVisibleTemplate(ctx, args, "documents.manage");
    if (template.isSystem) throw appError(ErrorCode.FORBIDDEN, "System templates cannot be deleted");
    await ctx.db.delete(args.templateId);
    await deleteUnreferencedOrgAssets(ctx, orgId);
    await writeAudit(ctx, {
      orgId, actorId: userId, action: "documentTemplate.deleted",
      resourceType: "documentTemplate", resourceId: args.templateId, before: { name: template.name },
    });
  },
});
