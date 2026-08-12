export const SYSTEM_ROLES = [
  { name: "Org Owner", description: "Full control over the organization" },
  { name: "Org Admin", description: "Manage members and configuration" },
  { name: "Event Admin", description: "Create and manage events" },
  { name: "Tabulator", description: "Run tabulation and finalize results" },
  { name: "Judge", description: "Enter scores for assigned contestants" },
  { name: "Staff", description: "Assist with event operations" },
  { name: "Viewer", description: "Read-only access" },
] as const;

export const SYSTEM_PERMISSIONS = [
  { name: "organization.view", category: "organization", description: "View the organization" },
  { name: "organization.update", category: "organization", description: "Update organization settings" },
  { name: "organization.members.manage", category: "organization", description: "Manage members and roles" },
  { name: "organization.delete", category: "organization", description: "Delete the organization" },
  { name: "audit.view", category: "audit", description: "View audit logs" },
  { name: "subscription.view", category: "subscription", description: "View subscription" },
  { name: "subscription.manage", category: "subscription", description: "Change subscription plan" },
] as const;

export const ROLE_PERMISSIONS: Record<string, string[]> = {
  "Org Owner": ["organization.view", "organization.update", "organization.members.manage", "organization.delete", "audit.view", "subscription.view", "subscription.manage"],
  "Org Admin": ["organization.view", "organization.update", "organization.members.manage", "audit.view", "subscription.view"],
  "Event Admin": ["organization.view", "subscription.view"],
  "Tabulator": ["organization.view"],
  "Judge": ["organization.view"],
  "Staff": ["organization.view"],
  "Viewer": ["organization.view"],
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
  },
] as const;
