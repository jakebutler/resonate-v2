#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const destinationError = "Import destination must be a canonical HTTPS Convex cloud/site origin or exact HTTP loopback origin, without credentials, query, hash or path.";
const safeMessages = new Set([destinationError, "Seed source bytes differ from the fixed approved manifest", "Explicit destination URL and authenticated application JWT are required", "Article 7 requires an explicit post ID and its exact manifest title"]);
const stages = new Set(["argument preparation", "destination validation", "source byte verification", "authenticated reference upload", "seed archive import", "article-7 exception binding"]);

/** Fail before reading the JWT or creating a client for any untrusted destination. */
export function validateImportDestination(value) {
  if (typeof value !== "string") throw new Error(destinationError);
  const cloud = /^https:\/\/[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.convex\.(?:cloud|site)\/?$/u;
  const loopback = /^http:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::([0-9]{1,5}))?\/?$/u;
  const local = value.match(loopback);
  if (!cloud.test(value) && (!local || (local[1] !== undefined && (Number(local[1]) < 1 || Number(local[1]) > 65535)))) throw new Error(destinationError);
  let destination;
  try { destination = new URL(value); } catch { throw new Error(destinationError); }
  if (destination.username || destination.password || destination.search || destination.hash || destination.pathname !== "/") throw new Error(destinationError);
  return destination.origin;
}

/** Never echo an untrusted exception, URL, authorization header, or JWT. */
export function formatImportFailure(error, stage) {
  const message = error instanceof Error && safeMessages.has(error.message) ? error.message : "The operation failed or did not return a confirmed result.";
  const safeStage = stages.has(stage) ? stage : "argument preparation";
  return `Seed preparation or import failed during ${safeStage}. ${message} No automatic retry was attempted; inspect the authenticated app's saved seed status before retrying an import.`;
}

async function runImport() {
  const args = process.argv.slice(2);
  let stage = "argument preparation";
  try {
    const value = name => {
      const index = args.indexOf(name);
      if (index === -1) return undefined;
      if (!args[index + 1] || args[index + 1].startsWith("--")) throw new Error("Missing required argument value");
      return args[index + 1];
    };
    stage = "destination validation";
    const rawUrl = value("--url");
    const url = rawUrl === undefined ? undefined : validateImportDestination(rawUrl);
    const manifest = JSON.parse(await readFile(join(root, "lib/visualSeed/manifest.json"), "utf8"));
    const postId = value("--article-7-post-id");
    const article7Title = value("--article-7-title");
    const canonicalTitle = manifest.approved_heroes.find(hero => hero.article === 7).title;
    if ((postId || article7Title) && (!postId || article7Title !== canonicalTitle)) throw new Error("Article 7 requires an explicit post ID and its exact manifest title");
    const sourceDirectory = value("--source-directory");
    const assets = [{ ...manifest.mascot_reference, key: "raven-character-sheet" }, ...manifest.approved_heroes.map(asset => ({ ...asset, key: `article-${String(asset.article).padStart(2, "0")}` }))];
    stage = "source byte verification";
    const prepared = [];
    for (const asset of assets) {
      const path = sourceDirectory ? join(resolve(sourceDirectory), basename(asset.path)) : asset.path;
      const bytes = await readFile(path);
      if (bytes.length > 5 * 1024 * 1024 || createHash("sha256").update(bytes).digest("hex") !== asset.sha256) throw new Error("Seed source bytes differ from the fixed approved manifest");
      prepared.push({ key: asset.key, bytes });
    }
    console.log(`Verified ${prepared.length} approved local images (${prepared.reduce((sum, asset) => sum + asset.bytes.length, 0)} bytes). Source files are read only.`);
    if (!args.includes("--apply")) {
      console.log("Dry run complete. Import requires --apply, --url, and RESONATE_VISUAL_IMPORT_TOKEN containing an authenticated application JWT.");
      return;
    }
    stage = "authenticated reference upload";
    const token = process.env.RESONATE_VISUAL_IMPORT_TOKEN;
    if (!url || !token) throw new Error("Explicit destination URL and authenticated application JWT are required");
    // The destination was independently allowlisted above; disable server logs that could echo headers.
    const client = new ConvexHttpClient(url, { skipConvexDeploymentUrlCheck: true, logger: false });
    client.setAuth(token);
    for (const asset of prepared) await client.action(makeFunctionReference("visualProfiles:uploadSeedAsset"), { brandId: "corvo", assetKey: asset.key, bytes: Uint8Array.from(asset.bytes).buffer });
    stage = "seed archive import";
    const result = await client.mutation(makeFunctionReference("visualProfiles:importCorvoSeed"), { brandId: "corvo" });
    if (!Number.isSafeInteger(result.referenceCount) || !Number.isSafeInteger(result.lessonCount)) throw new Error("Unconfirmed import receipt");
    console.log(`Imported ${result.referenceCount} reference records and ${result.lessonCount} observations. No default budget or qualified model was inferred.`);
    if (postId) {
      stage = "article-7 exception binding";
      await client.mutation(makeFunctionReference("visualProfiles:applyCorvoArticle7Exception"), { postId, expectedExceptionId: null, expectedPostContext: { title: article7Title, blogSlug: "what-corvo-labs-learned-building-an-ai-editorial-workflow", channelId: "corvo-blog" } });
      console.log("Recorded the photographic hand on the explicitly supplied exact article 7 post.");
    }
  } catch (error) {
    console.error(formatImportFailure(error, stage));
    process.exitCode = 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await runImport();
