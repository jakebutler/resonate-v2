"use node";

import { v } from "convex/values";
import { action } from "./_generated/server";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import dnsPromises from "node:dns/promises";
import { BlockedUrlError, validateRemoteUrl } from "../lib/urlGuard";
import { firecrawlCrawl } from "../lib/providerAdapters";
import { crawlCapturePagesFromFirecrawl } from "../lib/aeoCrawl";
import { brandIdValidator } from "./campaignAccess";

/**
 * In-app crawl capture: snapshots the connected target's site from the AEO
 * intel surface. Node runtime because the SSRF guard needs real DNS
 * resolution (`validateRemoteUrl`) before any outbound fetch.
 *
 * Live-call gate mirrors the discovery cron (convex/competitorSuggestions.ts):
 * there is no request-scoped approval flow in an action, so approval is an
 * explicit server env decision. The capture itself IS the explicit human
 * intent — the user pressed the button — and Firecrawl spend stays bounded by
 * the adapter's per-run page ceiling.
 */
export const captureCrawlSnapshot = action({
  args: { brandId: brandIdValidator },
  returns: v.id("siteCrawls"),
  // Explicit return type: the handler's type must not be inferred through the
  // api object (which includes this module), or inference goes circular.
  handler: async (ctx, args): Promise<Id<"siteCrawls">> => {
    const target = await ctx.runQuery(api.aeoIntel.getTarget, { brandId: args.brandId });
    if (!target) {
      throw new Error("No connected target for this brand — connect a target first.");
    }

    const dnsLookup = (hostname: string) =>
      dnsPromises.lookup(hostname, { all: true, verbatim: true });

    let validatedUrl: string;
    try {
      const check = await validateRemoteUrl(target.siteUrl, dnsLookup);
      validatedUrl = check.url;
    } catch (error) {
      throw new Error(
        error instanceof BlockedUrlError
          ? error.message
          : "Target URL failed SSRF validation."
      );
    }

    const crawlRows = await ctx.runQuery(api.aeoIntel.listCrawls, {
      brandId: args.brandId,
    });
    // Snapshot versions are immutable and per-target: always one past the
    // highest recorded version, so a concurrent capture is refused loudly by
    // recordCrawlSnapshot instead of silently overwriting a version.
    const nextVersion =
      crawlRows.reduce((max, row) => Math.max(max, row.version), 0) + 1;

    const result = await firecrawlCrawl(
      {
        env: process.env,
        liveProviderValidationApproved:
          process.env.AEO_DISCOVERY_LIVE_APPROVED === "approved",
        lookup: dnsLookup,
      },
      { url: validatedUrl }
    );
    if (!result.ok) {
      throw new Error(result.reason ?? "Firecrawl crawl failed.");
    }

    return await ctx.runMutation(api.aeoIntel.recordCrawlSnapshot, {
      brandId: args.brandId,
      targetId: target._id,
      siteUrl: target.siteUrl,
      version: nextVersion,
      status: "complete",
      pages: crawlCapturePagesFromFirecrawl(result.pages ?? []),
    });
  },
});
