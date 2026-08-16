import type { Tone } from "@/components/tabulation/status";

export type OrgStatus = "active" | "suspended" | "deleted";
export type UserStatus = "active" | "inactive" | "suspended";
export type SubscriptionStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "expired"
  | "paused";

export const orgStatusLabel: Record<OrgStatus, string> = {
  active: "Active",
  suspended: "Suspended",
  deleted: "Deleted",
};

export const orgStatusTone: Record<OrgStatus, Tone> = {
  active: "success",
  suspended: "warning",
  deleted: "muted",
};

export const userStatusLabel: Record<UserStatus, string> = {
  active: "Active",
  inactive: "Inactive",
  suspended: "Suspended",
};

export const userStatusTone: Record<UserStatus, Tone> = {
  active: "success",
  inactive: "muted",
  suspended: "warning",
};

export const subscriptionStatusLabel: Record<SubscriptionStatus, string> = {
  trialing: "Trialing",
  active: "Active",
  past_due: "Past due",
  canceled: "Canceled",
  expired: "Expired",
  paused: "Paused",
};

export const subscriptionStatusTone: Record<SubscriptionStatus, Tone> = {
  trialing: "info",
  active: "success",
  past_due: "warning",
  canceled: "muted",
  expired: "muted",
  paused: "muted",
};
