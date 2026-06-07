/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as __tests___helpers_mockMutationCtx from "../__tests__/helpers/mockMutationCtx.js";
import type * as backfill from "../backfill.js";
import type * as githubPrSync from "../githubPrSync.js";
import type * as ideas from "../ideas.js";
import type * as posts from "../posts.js";
import type * as publishing from "../publishing.js";
import type * as research from "../research.js";
import type * as settings from "../settings.js";
import type * as v2Migration from "../v2Migration.js";
import type * as workflow from "../workflow.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  "__tests__/helpers/mockMutationCtx": typeof __tests___helpers_mockMutationCtx;
  backfill: typeof backfill;
  githubPrSync: typeof githubPrSync;
  ideas: typeof ideas;
  posts: typeof posts;
  publishing: typeof publishing;
  research: typeof research;
  settings: typeof settings;
  v2Migration: typeof v2Migration;
  workflow: typeof workflow;
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

export declare const components: {};
