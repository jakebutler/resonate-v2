"use node";

import { createHash } from "node:crypto";
import { v } from "convex/values";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { requireUserId } from "./campaignAccess";
import type { Doc, Id } from "./_generated/dataModel";
import { prepareVisualProviderRequest, calculateVisualUsageCost, MAX_VISUAL_IMAGE_BYTES, type VisualImageInput, type VisualProviderId, type VisualRouteCapability } from "../lib/visualProviders";
import { dispatchVisualImageRequest, verifyVisualOutput, visualProviderCredential } from "../lib/visualProviderRuntime";

type Result = { status: "completed" | "blocked" | "uncertain"; versionId: Id<"v2VisualVersions"> | null; reason: string | null };
const blocked = (reason: string): Result => ({ status: "blocked", versionId: null, reason });

export const executeImageAttempt = action({
  args: { attemptId: v.id("v2VisualAttempts") },
  returns: v.object({ status: v.union(v.literal("completed"), v.literal("blocked"), v.literal("uncertain")), versionId: v.union(v.null(), v.id("v2VisualVersions")), reason: v.union(v.null(), v.string()) }),
  handler: async (ctx, args): Promise<Result> => {
    const userId = await requireUserId(ctx);
    const attempt: Doc<"v2VisualAttempts"> = await ctx.runQuery(internal.visualWorkflow.getAttemptForDispatch, { userId, attemptId: args.attemptId, expectedStages: ["generation", "edit"] });
    if (attempt.status !== "queued") return blocked(attempt.status === "uncertain" ? "reconciliation-required" : "attempt-not-queued");
    const candidates: Doc<"v2VisualImageRoutes">[] = await ctx.runQuery(internal.visualProviderConfig.getReviewedImageRoutes, { provider: attempt.input.provider, model: attempt.input.model ?? "gpt-image-2" });
    const routes = candidates.filter(route => (route.qualification !== "qualification-probe" || route.probeAttemptId === attempt._id && route.operatorUserId === userId) && route.quality === (attempt.input.quality ?? "medium") && (route.inputFidelity ?? null) === (attempt.input.inputFidelity ?? (["gpt-image-1-mini", "gpt-image-1"].includes(attempt.input.model ?? "") ? "low" : null)) && route.size === attempt.input.size && route.outputFormat === attempt.input.outputFormat && route.operations.includes(attempt.stage === "edit" ? "edit" : "generate") && attempt.input.references.length + Number(Boolean(attempt.input.parentStorageId)) <= route.maxInputImages);
    if (!routes.length) return blocked("no-qualified-route-and-cost-bound");
    const parent: Doc<"v2VisualVersions"> | null = attempt.input.parentVersionId ? await ctx.runQuery(internal.visualWorkflow.getVersionForExport, { userId, versionId: attempt.input.parentVersionId }) : null;
    let totalInputBytes = 0;
    async function retainedImage(storageId: Id<"_storage">, id: string, role: VisualImageInput["role"], sha256: string): Promise<{ image: VisualImageInput; verified: Awaited<ReturnType<typeof verifyVisualOutput>> }> {
      const blob = await ctx.storage.get(storageId);
      if (!blob || blob.size > MAX_VISUAL_IMAGE_BYTES || !["image/png", "image/jpeg", "image/webp"].includes(blob.type)) throw new Error("Pinned image bytes unavailable or invalid");
      totalInputBytes += blob.size;
      if (totalInputBytes > MAX_VISUAL_IMAGE_BYTES) throw new Error("Aggregate pinned input bytes exceed the20MiB runtime bound");
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const verified = await verifyVisualOutput(bytes, blob.type);
      return { image: { storageId, id, role, sha256, mimeType: blob.type as VisualImageInput["mimeType"], bytes }, verified };
    }
    const references: VisualImageInput[] = [];
    for (const reference of attempt.input.references) references.push((await retainedImage(reference.storageId, reference.referenceId, reference.role, reference.sha256)).image);
    let retainedParent: Awaited<ReturnType<typeof retainedImage>> | null = null;
    if (parent) {
      try { retainedParent = await retainedImage(parent.storageId, parent._id, "edit-parent", parent.sha256); }
      catch { return blocked("edit-parent-output-contract-mismatch"); }
    }
    if (parent && retainedParent) {
      const [width, height] = parent.input.size.split("x").map(Number);
      const mimeType = `image/${parent.input.outputFormat}`;
      if (retainedParent.verified.width !== width || retainedParent.verified.height !== height ||
        parent.width !== width || parent.height !== height || retainedParent.verified.contentType !== mimeType || parent.contentType !== mimeType ||
        parent.input.size !== attempt.input.size || parent.input.outputFormat !== attempt.input.outputFormat) return blocked("edit-parent-output-contract-mismatch");
    }
    const parentImage = parent && retainedParent ? { ...retainedParent.image, versionId: parent._id, model: parent.model, provider: parent.provider as VisualProviderId } : undefined;
    const route = routes[0];
    const capabilities: VisualRouteCapability[] = [route].map(route => ({ provider: route.provider, model: route.model, apiModelId: route.apiModelId, qualification: route.qualification === "qualification-probe" ? "authorized-probe" : "live-receipt", receiptIds: route.capabilityReceiptIds, operations: route.operations, referenceInputs: route.referenceInputs, maxInputImages: route.maxInputImages, sizes: [route.size], outputFormats: [route.outputFormat] }));
    const mode = route.qualification === "qualification-probe" ? "qualification-probe" : "live";
    const prepared = await prepareVisualProviderRequest({ mode, attemptId: attempt._id, lineageKey: `${attempt.postId}:${attempt.stage}:${attempt.operationKey}`, operation: attempt.stage === "edit" ? "edit" : "generate", model: attempt.input.model ?? undefined,
      ...(parent && attempt.input.model !== parent.model ? { modelOverride: attempt.input.model ?? undefined } : {}), preferredProvider: attempt.input.provider as VisualProviderId | undefined,
      prompt: attempt.input.prompt, feedback: attempt.input.feedback ?? undefined, revisions: { articleRevision: createHash("sha256").update(attempt.input.article.signature).digest("hex"), profileRevision: attempt.input.pins.profileRevisionId, lessonRevisions: attempt.input.pins.lessonIds }, references, parentImage, size: attempt.input.size, quality: attempt.input.quality ?? "medium", inputFidelity: attempt.input.inputFidelity, outputFormat: attempt.input.outputFormat }, capabilities);
    if (new TextEncoder().encode(prepared.prompt).length > route.maxPromptBytes || prepared.images.some(image => image.bytes.length > route.maxInputBytes)) return blocked("reviewed-input-bound-exceeded");
    const key = visualProviderCredential(route.provider);
    if (!key) return blocked("provider-credential-unavailable");
    const quoteId = await ctx.runMutation(internal.visualProviderConfig.registerImageDispatchQuote, { attemptId: attempt._id, routeId: route._id, requestSha256: prepared.requestSha256 });
    const reservation = await ctx.runMutation(internal.visualWorkflow.reserveAttempt, { attemptId: attempt._id, quoteId });
    if (!reservation.admitted) return blocked(reservation.reason ?? "budget-admission-denied");
    const claim = await ctx.runMutation(internal.visualWorkflow.claimAttempt, { attemptId: attempt._id, expectedRequestSha256: prepared.requestSha256 });
    if (!claim) return blocked("attempt-already-claimed-or-stale");
    let outputStorageId: Id<"_storage"> | undefined;
    let usageReceipt: string | undefined;
    try {
      const result = await dispatchVisualImageRequest(prepared, { claimId: claim.claimKey, attemptId: claim.attemptId, lineageKey: prepared.lineageKey, provider: route.provider, apiModelId: route.apiModelId, requestSha256: claim.requestSha256!, maximumUsd: claim.maximumMicros / 1_000_000, mode: prepared.mode, boundVerified: true }, key);
      if (result.status === "blocked") throw new Error("Dispatch claim rejected after admission");
      if (result.receipt) usageReceipt = JSON.stringify(result.receipt);
      if (result.status === "uncertain") {
        await ctx.runMutation(internal.visualWorkflow.markUncertain, { attemptId: attempt._id, claimKey: claim.claimKey, reason: result.reason, ...(usageReceipt ? { usageReceipt } : {}) });
        return { status: "uncertain", versionId: null, reason: result.reason };
      }
      const image = result.images[0], verified = await verifyVisualOutput(image.bytes, image.mimeType);
      outputStorageId = await ctx.storage.store(new Blob([new Uint8Array(image.bytes).buffer], { type: image.mimeType }));
      // Read back stored bytes before completion; never label an unverified blob as a version.
      const stored = await ctx.storage.get(outputStorageId);
      if (!stored || (await verifyVisualOutput(new Uint8Array(await stored.arrayBuffer()), stored.type)).sha256 !== verified.sha256) throw new Error("Stored output verification failed");
      const [requestedWidth, requestedHeight] = attempt.input.size.split("x").map(Number);
      if (verified.width !== requestedWidth || verified.height !== requestedHeight || verified.contentType !== `image/${attempt.input.outputFormat}`) {
        await ctx.runMutation(internal.visualWorkflow.markUncertain, { attemptId: attempt._id, claimKey: claim.claimKey, reason: "provider-output-contract-mismatch", outputStorageId, usageReceipt: usageReceipt! });
        return { status: "uncertain", versionId: null, reason: "provider-output-contract-mismatch" };
      }
      const cost = result.usage ? calculateVisualUsageCost(route.provider, result.usage, route.model) : null;
      if (cost === null) {
        await ctx.runMutation(internal.visualWorkflow.markUncertain, { attemptId: attempt._id, claimKey: claim.claimKey, reason: "provider-usage-unavailable", outputStorageId, usageReceipt: usageReceipt! });
        return { status: "uncertain", versionId: null, reason: "provider-usage-unavailable" };
      }
      const versionId = await ctx.runMutation(internal.visualWorkflow.completeImage, { attemptId: attempt._id, claimKey: claim.claimKey, storageId: outputStorageId, ...verified, ...(result.revisedPrompt ? { revisedPrompt: result.revisedPrompt } : {}), actualMicros: Math.ceil(cost * 1_000_000), usageKind: "estimated", usageReceipt: usageReceipt! });
      return { status: "completed", versionId, reason: null };
    } catch {
      // Mutation acknowledgments can be lost after commit. Retain bytes; never delete or dispatch again.
      try { await ctx.runMutation(internal.visualWorkflow.markUncertain, { attemptId: attempt._id, claimKey: claim.claimKey, reason: "provider-completion-requires-reconciliation", ...(usageReceipt ? { usageReceipt } : {}), ...(outputStorageId ? { outputStorageId } : {}) }); } catch { /* Existing running lease recovery or committed completion remains authoritative. */ }
      return { status: "uncertain", versionId: null, reason: "provider-completion-requires-reconciliation" };
    }
  },
});
