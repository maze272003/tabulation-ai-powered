/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as audit from "../audit.js";
import type * as auth from "../auth.js";
import type * as categories from "../categories.js";
import type * as contestants from "../contestants.js";
import type * as criteria from "../criteria.js";
import type * as eventLifecycle from "../eventLifecycle.js";
import type * as events from "../events.js";
import type * as http from "../http.js";
import type * as invitations from "../invitations.js";
import type * as judges from "../judges.js";
import type * as lib_audit from "../lib/audit.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_authz from "../lib/authz.js";
import type * as lib_constants from "../lib/constants.js";
import type * as lib_entitlements from "../lib/entitlements.js";
import type * as lib_errors from "../lib/errors.js";
import type * as lib_eventAuthz from "../lib/eventAuthz.js";
import type * as lib_roundCompute from "../lib/roundCompute.js";
import type * as lib_serializers from "../lib/serializers.js";
import type * as lib_tabulation from "../lib/tabulation.js";
import type * as lib_usage from "../lib/usage.js";
import type * as members from "../members.js";
import type * as organizations from "../organizations.js";
import type * as plans from "../plans.js";
import type * as platform from "../platform.js";
import type * as results from "../results.js";
import type * as roles from "../roles.js";
import type * as roundAdmin from "../roundAdmin.js";
import type * as rounds from "../rounds.js";
import type * as scoring from "../scoring.js";
import type * as seed from "../seed.js";
import type * as subscriptions from "../subscriptions.js";
import type * as templates from "../templates.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  audit: typeof audit;
  auth: typeof auth;
  categories: typeof categories;
  contestants: typeof contestants;
  criteria: typeof criteria;
  eventLifecycle: typeof eventLifecycle;
  events: typeof events;
  http: typeof http;
  invitations: typeof invitations;
  judges: typeof judges;
  "lib/audit": typeof lib_audit;
  "lib/auth": typeof lib_auth;
  "lib/authz": typeof lib_authz;
  "lib/constants": typeof lib_constants;
  "lib/entitlements": typeof lib_entitlements;
  "lib/errors": typeof lib_errors;
  "lib/eventAuthz": typeof lib_eventAuthz;
  "lib/roundCompute": typeof lib_roundCompute;
  "lib/serializers": typeof lib_serializers;
  "lib/tabulation": typeof lib_tabulation;
  "lib/usage": typeof lib_usage;
  members: typeof members;
  organizations: typeof organizations;
  plans: typeof plans;
  platform: typeof platform;
  results: typeof results;
  roles: typeof roles;
  roundAdmin: typeof roundAdmin;
  rounds: typeof rounds;
  scoring: typeof scoring;
  seed: typeof seed;
  subscriptions: typeof subscriptions;
  templates: typeof templates;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  betterAuth: import("../betterAuth/_generated/component.js").ComponentApi<"betterAuth">;
};
