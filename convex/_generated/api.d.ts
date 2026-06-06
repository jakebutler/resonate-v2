/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";
import type * as backfill from "../backfill.js";
import type * as githubPrSync from "../githubPrSync.js";
import type * as ideas from "../ideas.js";
import type * as posts from "../posts.js";
import type * as settings from "../settings.js";
import type * as v2Publishing from "../v2Publishing.js";
import type * as v2Research from "../v2Research.js";
import type * as workflow from "../workflow.js";

/**
 * A utility for referencing Convex functions in your app's API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
declare const fullApi: ApiFromModules<{
  backfill: typeof backfill;
  githubPrSync: typeof githubPrSync;
  ideas: typeof ideas;
  posts: typeof posts;
  settings: typeof settings;
  v2Publishing: typeof v2Publishing;
  v2Research: typeof v2Research;
  workflow: typeof workflow;
}>;
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;
