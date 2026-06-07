#!/usr/bin/env node
/**
 * One-shot codemod: drop transitional v2/V2 prefixes from app code.
 * Skips docs/v1-legacy-data snapshot fixtures and v2Migration artifacts.
 */
import fs from "fs";
import path from "path";

const ROOT = path.resolve(import.meta.dirname, "..");

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "docs/v1-legacy-data",
  "_generated",
]);

const EXT = new Set([".ts", ".tsx", ".js", ".mjs", ".jsx"]);

/** Longest-first type/identifier replacements */
const IDENT_REPLACEMENTS = [
  ["V2CorvoBlogPlatformSettings", "CorvoBlogPlatformSettings"],
  ["V2LinkedInPlatformSettings", "LinkedInPlatformSettings"],
  ["V2RedditPlatformSettings", "RedditPlatformSettings"],
  ["V2ProviderAttemptStatus", "ProviderAttemptStatus"],
  ["V2ProviderStateStatus", "ProviderStateStatus"],
  ["V2SourceQualityRating", "SourceQualityRating"],
  ["V2EditorialOutline", "EditorialOutline"],
  ["V2PublishingIntent", "PublishingIntent"],
  ["V2ClarifyingAnswer", "ClarifyingAnswer"],
  ["V2PlatformSettings", "PlatformSettings"],
  ["V2MockProviderMode", "MockProviderMode"],
  ["V2VariantReviewPanel", "VariantReviewPanel"],
  ["V2SegmentedControl", "SegmentedControl"],
  ["V2WorkspaceLayout", "WorkspaceLayout"],
  ["V2HighlightTitle", "HighlightTitle"],
  ["V2HighlightCard", "HighlightCard"],
  ["V2WorkspaceState", "WorkspaceState"],
  ["V2VariantStatus", "VariantStatus"],
  ["V2ResearchRiskLevel", "ResearchRiskLevel"],
  ["V2ResearchBrief", "ResearchBrief"],
  ["V2ResearchDepth", "ResearchDepth"],
  ["V2ResearchStatus", "ResearchStatus"],
  ["V2ClaimMapStatus", "ClaimMapStatus"],
  ["V2ClaimConfidence", "ClaimConfidence"],
  ["V2OutlineSection", "OutlineSection"],
  ["V2OutlineStatus", "OutlineStatus"],
  ["V2TakeawayRow", "TakeawayRow"],
  ["V2EvidenceLabel", "EvidenceLabel"],
  ["V2ProviderState", "ProviderState"],
  ["V2PublishAttempt", "PublishAttempt"],
  ["V2SourceRecord", "SourceRecord"],
  ["V2SourceStatus", "SourceStatus"],
  ["V2DraftVariant", "DraftVariant"],
  ["V2ApprovalState", "ApprovalState"],
  ["V2BrandSelector", "BrandSelector"],
  ["V2PanelHeading", "PanelHeading"],
  ["V2SidebarCard", "SidebarCard"],
  ["V2FilterGroup", "FilterGroup"],
  ["V2PageHeader", "PageHeader"],
  ["V2MainCard", "MainCard"],
  ["V2ResonateApp", "ResearchApp"],
  ["V2PostStatus", "PostStatus"],
  ["V2ClaimStatus", "ClaimStatus"],
  ["V2ProviderId", "ProviderId"],
  ["V2PlatformId", "PlatformId"],
  ["V2ChannelId", "ChannelId"],
  ["V2IdeaStatus", "IdeaStatus"],
  ["V2GapSeverity", "GapSeverity"],
  ["V2VoicePack", "VoicePack"],
  ["V2ClaimMap", "ClaimMap"],
  ["V2IdeaEntry", "IdeaEntry"],
  ["V2BrandId", "BrandId"],
  ["V2Channel", "Channel"],
  ["V2Brand", "Brand"],
  ["V2Claim", "Claim"],
  ["V2Post", "Post"],
  ["V2Idea", "Idea"],
  ["V2Notice", "Notice"],
  ["V2Surface", "WorkspaceSurface"],
  ["V2Shell", "Shell"],
  ["DEFAULT_V2_STATE", "DEFAULT_WORKSPACE_STATE"],
  ["V2_CHANNEL_LABELS", "CHANNEL_LABELS"],
  ["V2_STATUS_LABELS", "STATUS_LABELS"],
  ["V2_PLATFORMS", "PLATFORMS"],
  ["V2_CHANNELS", "CHANNELS"],
  ["V2_BRANDS", "BRANDS"],
  ["findV2Channel", "findChannel"],
  ["ideaDetailToV2Idea", "ideaDetailToIdea"],
  ["convexPostToV2Post", "convexPostToPost"],
  ["spawnV2Posts", "spawnPosts"],
  ["onSpawnV2Posts", "onSpawnPosts"],
  ["v2PostLinks", "postLinks"],
  ["api.v2Publishing", "api.publishing"],
  ["api.v2Research", "api.research"],
  ["v2Publishing:", "publishing:"],
  ["v2Research:", "research:"],
  ["internal.v2Publishing", "internal.publishing"],
  ["@/lib/v2IdeasAdapter", "@/lib/ideasAdapter"],
  ["@/lib/v2ProviderAdapters", "@/lib/providerAdapters"],
  ["@/lib/v2Migration", "@/lib/v2Migration"],
  ["@/lib/v2", "@/lib/domain"],
  ["from \"@/lib/v2\"", "from \"@/lib/domain\""],
  ["from '@/lib/v2'", "from '@/lib/domain'"],
  ["@/components/V2ResonateApp", "@/components/ResearchApp"],
  ["@/components/v2/V2", "@/components/shell/"],
  ["@/components/v2/v2-tokens", "@/components/shell/tokens"],
  ["@/components/v2/", "@/components/shell/"],
  ["convex/v2Publishing", "convex/publishing"],
  ["convex/v2Research", "convex/research"],
  ["lib/v2ProviderAdapters", "lib/providerAdapters"],
  ["lib/v2IdeasAdapter", "lib/ideasAdapter"],
  ["lib/v2.ts", "lib/domain.ts"],
  ["lib/__tests__/v2ProviderAdapters", "lib/__tests__/providerAdapters"],
  ["lib/__tests__/v2Research", "lib/__tests__/research"],
  ["lib/__tests__/v2ClaimMap", "lib/__tests__/claimMap"],
  ["lib/__tests__/v2Outline", "lib/__tests__/outline"],
  ["lib/__tests__/v2.test", "lib/__tests__/domain.test"],
  ["components/__tests__/V2ResonateApp", "components/__tests__/ResearchApp"],
  ["convex/__tests__/v2Publishing", "convex/__tests__/publishing"],
  ["convex/__tests__/spawnV2Posts", "convex/__tests__/spawnPosts"],
  ["app/v2/research/review", "app/research/review"],
  ["app/v2/research", "app/research"],
  ["app/v2/page", "app/calendar/page"],
  ["/api/v2/", "/api/"],
  ["`/v2/research/review/", "`/research/review/"],
  ["\"/v2/research/review/", "\"/research/review/"],
  ["'/v2/research/review/", "'/research/review/"],
  ["`/v2/research", "`/research"],
  ["\"/v2/research", "\"/research"],
  ["'/v2/research", "'/research"],
  ["href=\"/v2/research", "href=\"/research"],
  ["href='/v2/research", "href='/research"],
  ["href=\"/v2#connections", "href=\"/calendar#connections"],
  ["href='/v2#connections", "href='/calendar#connections"],
  ["router.replace(`/v2?", "router.replace(`/calendar?"],
  ["router.push(`/v2?", "router.push(`/calendar?"],
  ["href=\"/v2\"", "href=\"/calendar\""],
  ["href='/v2'", "href='/calendar'"],
  ["`/v2?postId=", "`/calendar?postId="],
  ["\"/v2?postId=", "\"/calendar?postId="],
  ["'/v2?postId=", "'/calendar?postId="],
  ["activeSurface=\"calendar\"", "activeSurface=\"calendar\""],
  ["Resonate v2", "Resonate"],
  ["v2 surfaces", "workspace surfaces"],
  ["Open v2", "Open workspace"],
  ["Open v2 workspace", "Open workspace"],
  ["new v2 surface", "new workspace"],
  ["Spawn v2 drafts", "Spawn drafts"],
  ["Spawned v2 posts", "Spawned posts"],
  ["export const v2 =", "export const tokens ="],
  ["import { v2 }", "import { tokens }"],
  ["import { v2,", "import { tokens,"],
  [", v2 }", ", tokens }"],
  [" v2.", " tokens."],
  ["(v2.", "(tokens."],
  ["? v2.", "? tokens."],
  [": v2.", ": tokens."],
  ["variant=\"v2\"", "variant=\"accent\""],
  ["variant: \"v2\"", "variant: \"accent\""],
];

function shouldSkipDir(rel) {
  return [...SKIP_DIRS].some((s) => rel === s || rel.startsWith(`${s}/`));
}

function walk(dir, files = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = path.relative(ROOT, path.join(dir, ent.name));
    if (shouldSkipDir(rel)) continue;
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(full, files);
    else if (EXT.has(path.extname(ent.name))) files.push(full);
  }
  return files;
}

let changed = 0;
for (const file of walk(ROOT)) {
  if (file.includes("rename-drop-v2.mjs")) continue;
  if (file.includes("v2Migration")) continue;
  let text = fs.readFileSync(file, "utf8");
  const before = text;
  for (const [from, to] of IDENT_REPLACEMENTS) {
    text = text.split(from).join(to);
  }
  if (text !== before) {
    fs.writeFileSync(file, text);
    changed++;
  }
}

console.log(`Updated ${changed} files.`);
