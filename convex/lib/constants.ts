import type { Doc } from "../_generated/dataModel";

export const SYSTEM_ROLES = [
  { name: "Org Owner", description: "Full control over the organization" },
] as const;

export const SYSTEM_PERMISSIONS = [
  { name: "organization.view", category: "organization", description: "View the organization" },
  { name: "organization.update", category: "organization", description: "Update organization settings" },
  { name: "organization.members.manage", category: "organization", description: "Manage members and roles" },
  { name: "organization.delete", category: "organization", description: "Delete the organization" },
  { name: "audit.view", category: "audit", description: "View audit logs" },
  { name: "subscription.view", category: "subscription", description: "View subscription" },
  { name: "subscription.manage", category: "subscription", description: "Change subscription plan" },
  { name: "event.create", category: "event", description: "Create events" },
  { name: "event.view", category: "event", description: "View events" },
  { name: "event.update", category: "event", description: "Update event configuration" },
  { name: "event.delete", category: "event", description: "Delete events" },
  { name: "event.publish", category: "event", description: "Publish and reopen events" },
  { name: "event.archive", category: "event", description: "Archive events" },
  { name: "contestant.manage", category: "contestant", description: "Manage contestants" },
  { name: "judge.manage", category: "judge", description: "Manage judges and assignments" },
  { name: "score.enter", category: "score", description: "Enter and submit own score sheets" },
  { name: "score.manage", category: "score", description: "Run rounds, publish results, finalize events" },
  { name: "result.view", category: "result", description: "View published results" },
  { name: "documents.manage", category: "documents", description: "Create and customize document templates" },
] as const;

export const ROLE_PERMISSIONS: Record<string, string[]> = {
  "Org Owner": ["organization.view", "organization.update", "organization.members.manage", "organization.delete", "audit.view", "subscription.view", "subscription.manage", "event.create", "event.view", "event.update", "event.delete", "event.publish", "event.archive", "contestant.manage", "judge.manage", "score.manage", "result.view", "documents.manage"],
};

export const SYSTEM_PLANS = [
  {
    name: "Free",
    sortOrder: 0,
    features: {
      canCreateEvent: true, canExportReports: false, canUseCustomBranding: false,
      canUseAuditLogs: false, canCreateTemplates: false, canUseAdvancedAnalytics: false, canUseApi: false,
    },
    limits: { maxMembers: 5, maxEvents: 1, maxJudges: 5, maxContestants: 20 },
    isSystem: true,
    priceCents: 0,
    currency: "PHP",
    billingInterval: "monthly",
    isActive: true,
  },
  {
    name: "Starter",
    sortOrder: 1,
    features: {
      canCreateEvent: true, canExportReports: true, canUseCustomBranding: false,
      canUseAuditLogs: false, canCreateTemplates: false, canUseAdvancedAnalytics: false, canUseApi: false,
    },
    limits: { maxMembers: 15, maxEvents: 5, maxJudges: 20, maxContestants: 100 },
    isSystem: true,
    priceCents: 49900,
    currency: "PHP",
    billingInterval: "monthly",
    isActive: true,
  },
  {
    name: "Pro",
    sortOrder: 2,
    features: {
      canCreateEvent: true, canExportReports: true, canUseCustomBranding: true,
      canUseAuditLogs: true, canCreateTemplates: true, canUseAdvancedAnalytics: true, canUseApi: false,
    },
    limits: { maxMembers: 50, maxEvents: 25, maxJudges: 100, maxContestants: 500 },
    isSystem: true,
    priceCents: 149900,
    currency: "PHP",
    billingInterval: "monthly",
    isActive: true,
  },
] as const;

export const SYSTEM_TEMPLATES: { name: string; description: string; configSnapshot: Doc<"eventTemplates">["configSnapshot"] }[] = [
  {
    name: "Pageant",
    description: "Classic beauty pageant with a weighted preliminary round",
    configSnapshot: {
      decimalPrecision: 2,
      resultVisibility: "private",
      rounds: [
        {
          name: "Preliminary",
          order: 0,
          qualifiesToNextRound: false,
          criteria: [
            { name: "Beauty", order: 0, weight: 30, minScore: 0, maxScore: 100, decimalPrecision: 2 },
            { name: "Personality", order: 1, weight: 20, minScore: 0, maxScore: 100, decimalPrecision: 2 },
            { name: "Talent", order: 2, weight: 20, minScore: 0, maxScore: 100, decimalPrecision: 2 },
            { name: "Q&A", order: 3, weight: 30, minScore: 0, maxScore: 100, decimalPrecision: 2 },
          ],
        },
      ],
    },
  },
  {
    name: "Singing",
    description: "Singing competition with a weighted final round",
    configSnapshot: {
      decimalPrecision: 2,
      resultVisibility: "private",
      rounds: [
        {
          name: "Final",
          order: 0,
          qualifiesToNextRound: false,
          criteria: [
            { name: "Vocal Quality", order: 0, weight: 40, minScore: 0, maxScore: 100, decimalPrecision: 2 },
            { name: "Stage Presence", order: 1, weight: 20, minScore: 0, maxScore: 100, decimalPrecision: 2 },
            { name: "Musicality", order: 2, weight: 20, minScore: 0, maxScore: 100, decimalPrecision: 2 },
            { name: "Audience Impact", order: 3, weight: 20, minScore: 0, maxScore: 100, decimalPrecision: 2 },
          ],
        },
      ],
    },
  },
  {
    name: "Quiz",
    description: "Quiz bee with correctness-weighted scoring",
    configSnapshot: {
      decimalPrecision: 0,
      resultVisibility: "private",
      rounds: [
        {
          name: "Quiz Bee",
          order: 0,
          qualifiesToNextRound: false,
          criteria: [
            { name: "Correct Answers", order: 0, weight: 70, minScore: 0, maxScore: 100, decimalPrecision: 0 },
            { name: "Speed", order: 1, weight: 20, minScore: 0, maxScore: 100, decimalPrecision: 0 },
            { name: "Bonus", order: 2, weight: 10, minScore: 0, maxScore: 100, decimalPrecision: 0 },
          ],
        },
      ],
    },
  },
];
