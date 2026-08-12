/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as __test__ from "../__test__.js";
import type * as auth from "../auth.js";
import type * as http from "../http.js";
import type * as lib_audit from "../lib/audit.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_authz from "../lib/authz.js";
import type * as lib_constants from "../lib/constants.js";
import type * as lib_entitlements from "../lib/entitlements.js";
import type * as lib_errors from "../lib/errors.js";
import type * as lib_serializers from "../lib/serializers.js";
import type * as lib_usage from "../lib/usage.js";
import type * as organizations from "../organizations.js";
import type * as seed from "../seed.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  __test__: typeof __test__;
  auth: typeof auth;
  http: typeof http;
  "lib/audit": typeof lib_audit;
  "lib/auth": typeof lib_auth;
  "lib/authz": typeof lib_authz;
  "lib/constants": typeof lib_constants;
  "lib/entitlements": typeof lib_entitlements;
  "lib/errors": typeof lib_errors;
  "lib/serializers": typeof lib_serializers;
  "lib/usage": typeof lib_usage;
  organizations: typeof organizations;
  seed: typeof seed;
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
