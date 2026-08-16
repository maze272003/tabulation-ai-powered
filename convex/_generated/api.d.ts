/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as accounts from "../accounts.js";
import type * as audit from "../audit.js";
import type * as auth from "../auth.js";
import type * as categories from "../categories.js";
import type * as contestants from "../contestants.js";
import type * as criteria from "../criteria.js";
import type * as enter_results from "../enter/results.js";
import type * as enter_rounds from "../enter/rounds.js";
import type * as enter_scoring from "../enter/scoring.js";
import type * as eventAuth from "../eventAuth.js";
import type * as eventLifecycle from "../eventLifecycle.js";
import type * as events from "../events.js";
import type * as http from "../http.js";
import type * as lib_audit from "../lib/audit.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_authz from "../lib/authz.js";
import type * as lib_constants from "../lib/constants.js";
import type * as lib_entitlements from "../lib/entitlements.js";
import type * as lib_errors from "../lib/errors.js";
import type * as lib_eventAuthz from "../lib/eventAuthz.js";
import type * as lib_eventCode from "../lib/eventCode.js";
import type * as lib_eventResults from "../lib/eventResults.js";
import type * as lib_eventSession from "../lib/eventSession.js";
import type * as lib_password from "../lib/password.js";
import type * as lib_roundCompute from "../lib/roundCompute.js";
import type * as lib_serializers from "../lib/serializers.js";
import type * as lib_sheetValidation from "../lib/sheetValidation.js";
import type * as lib_tabulation from "../lib/tabulation.js";
import type * as lib_usage from "../lib/usage.js";
import type * as organizations from "../organizations.js";
import type * as plans from "../plans.js";
import type * as platform_audit from "../platform/audit.js";
import type * as platform_bootstrap from "../platform/bootstrap.js";
import type * as platform_dashboard from "../platform/dashboard.js";
import type * as platform_orgs from "../platform/orgs.js";
import type * as platform_subscriptions from "../platform/subscriptions.js";
import type * as platform_users from "../platform/users.js";
import type * as reset from "../reset.js";
import type * as results from "../results.js";
import type * as roles from "../roles.js";
import type * as roundAdmin from "../roundAdmin.js";
import type * as rounds from "../rounds.js";
import type * as seed from "../seed.js";
import type * as subscriptions from "../subscriptions.js";
import type * as templates from "../templates.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  accounts: typeof accounts;
  audit: typeof audit;
  auth: typeof auth;
  categories: typeof categories;
  contestants: typeof contestants;
  criteria: typeof criteria;
  "enter/results": typeof enter_results;
  "enter/rounds": typeof enter_rounds;
  "enter/scoring": typeof enter_scoring;
  eventAuth: typeof eventAuth;
  eventLifecycle: typeof eventLifecycle;
  events: typeof events;
  http: typeof http;
  "lib/audit": typeof lib_audit;
  "lib/auth": typeof lib_auth;
  "lib/authz": typeof lib_authz;
  "lib/constants": typeof lib_constants;
  "lib/entitlements": typeof lib_entitlements;
  "lib/errors": typeof lib_errors;
  "lib/eventAuthz": typeof lib_eventAuthz;
  "lib/eventCode": typeof lib_eventCode;
  "lib/eventResults": typeof lib_eventResults;
  "lib/eventSession": typeof lib_eventSession;
  "lib/password": typeof lib_password;
  "lib/roundCompute": typeof lib_roundCompute;
  "lib/serializers": typeof lib_serializers;
  "lib/sheetValidation": typeof lib_sheetValidation;
  "lib/tabulation": typeof lib_tabulation;
  "lib/usage": typeof lib_usage;
  organizations: typeof organizations;
  plans: typeof plans;
  "platform/audit": typeof platform_audit;
  "platform/bootstrap": typeof platform_bootstrap;
  "platform/dashboard": typeof platform_dashboard;
  "platform/orgs": typeof platform_orgs;
  "platform/subscriptions": typeof platform_subscriptions;
  "platform/users": typeof platform_users;
  reset: typeof reset;
  results: typeof results;
  roles: typeof roles;
  roundAdmin: typeof roundAdmin;
  rounds: typeof rounds;
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
