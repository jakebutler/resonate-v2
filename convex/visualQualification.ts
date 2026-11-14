"use node";

import { timingSafeEqual } from "node:crypto";
import { v } from "convex/values";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  IMAGE_PACKET_REFERENCES,
  LIVE_SUBMISSION_APPROVAL_ENV,
  LIVE_SUBMISSION_APPROVED_VALUE,
  QUALIFICATION_OPERATOR_TOKEN_ENV,
  QUALIFICATION_PER_ATTEMPT_CAP_MICROS,
  assertQualificationPacketCaps,
  assertQualificationPromptBytes,
  prepareImageQualificationRoute,
  prepareTextQualificationRoute,
  qualificationGate,
} from "../lib/visualQualification";
import {
  VISUAL_PROVIDER_CAPABILITIES,
  calculateVisualUsageCost,
  hashVisualProviderRequest,
  type PreparedVisualProviderRequest,
  type VisualDispatchClaim,
  type VisualImageInput,
} from "../lib/visualProviders";
import {
  dispatchVisualImageRequest,
  verifyVisualOutput,
  visualProviderCredential,
} from "../lib/visualProviderRuntime";
import { visualTextCredential } from "../lib/visualTextRuntime";

/**
 * Operator tooling for route qualification (C3): the first trusted callers of
 * registerReviewedImageRoute / registerReviewedTextRoute outside tests, plus the
 * gated live execution of the ≤ $0.50 functional packet. Every entry point is
 * operator-token gated; the fixture tier stays zero-cost and token-free.
 */

const operatorTokenError =
  "Qualification operator token is not configured on this deployment or does not match; nothing was registered or dispatched.";

async function assertOperatorToken(candidate: string): Promise<void> {
  const expected = process.env[QUALIFICATION_OPERATOR_TOKEN_ENV];
  if (!expected?.trim() || !candidate.trim())
    throw new Error(operatorTokenError);
  const expectedBytes = Buffer.from(expected),
    candidateBytes = Buffer.from(candidate);
  if (
    expectedBytes.length !== candidateBytes.length ||
    !timingSafeEqual(expectedBytes, candidateBytes)
  )
    throw new Error(operatorTokenError);
}

const identityValidator = v.object({
  capabilityReceiptIds: v.array(v.string()),
  boundReceiptId: v.string(),
  reviewedBy: v.string(),
  provenance: v.string(),
  expiresAt: v.number(),
});

/** Persists qualified routes with recorded receipts. The internal register mutations remain the only admission path; this action adds the operator gate. */
export const persistQualifiedRoutes = action({
  args: {
    operatorToken: v.string(),
    imageRoute: v.optional(identityValidator),
    textRoute: v.optional(
      v.object({
        ...identityValidator.fields,
        model: v.string(),
        maxInputBytes: v.number(),
        maxInputTokens: v.number(),
        maxMessageOverheadTokens: v.number(),
        contextWindowTokens: v.number(),
        maxOutputTokens: v.number(),
        inputPriceMicrosPerMillion: v.number(),
        outputPriceMicrosPerMillion: v.number(),
      }),
    ),
  },
  returns: v.object({
    imageRouteId: v.union(v.null(), v.id("v2VisualImageRoutes")),
    textRouteId: v.union(v.null(), v.id("v2VisualTextRoutes")),
  }),
  handler: async (
    ctx,
    args,
  ): Promise<{
    imageRouteId: Id<"v2VisualImageRoutes"> | null;
    textRouteId: Id<"v2VisualTextRoutes"> | null;
  }> => {
    await assertOperatorToken(args.operatorToken);
    const now = Date.now();
    const imageRouteId = args.imageRoute
      ? await ctx.runMutation(
          internal.visualProviderConfig.registerReviewedImageRoute,
          prepareImageQualificationRoute(args.imageRoute, now),
        )
      : null;
    const textRouteId = args.textRoute
      ? await ctx.runMutation(
          internal.visualTextConfig.registerReviewedTextRoute,
          prepareTextQualificationRoute(args.textRoute, now),
        )
      : null;
    return { imageRouteId, textRouteId };
  },
});

const callReceiptValidator = v.object({
  operation: v.union(v.literal("generate"), v.literal("edit")),
  requestSha256: v.string(),
  httpStatus: v.number(),
  requestId: v.optional(v.string()),
  usage: v.union(
    v.null(),
    v.object({
      textInputTokens: v.number(),
      imageInputTokens: v.number(),
      imageOutputTokens: v.number(),
    }),
  ),
  estimatedCostUsd: v.union(v.null(), v.number()),
  outputStorageId: v.id("_storage"),
  outputSha256: v.string(),
  outputBytes: v.number(),
  width: v.number(),
  height: v.number(),
});

const packetResultValidator = v.object({
  status: v.union(
    v.literal("completed"),
    v.literal("absent"),
    v.literal("blocked"),
    v.literal("uncertain"),
  ),
  reason: v.union(v.null(), v.string()),
  missingCredentials: v.array(v.string()),
  prerequisite: v.union(v.null(), v.string()),
  calls: v.array(callReceiptValidator),
});

type CallReceipt = {
  operation: "generate" | "edit";
  requestSha256: string;
  httpStatus: number;
  requestId?: string;
  usage: {
    textInputTokens: number;
    imageInputTokens: number;
    imageOutputTokens: number;
  } | null;
  estimatedCostUsd: number | null;
  outputStorageId: Id<"_storage">;
  outputSha256: string;
  outputBytes: number;
  width: number;
  height: number;
};

type PacketResult = {
  status: "completed" | "absent" | "blocked" | "uncertain";
  reason: string | null;
  missingCredentials: string[];
  prerequisite: string | null;
  calls: CallReceipt[];
};

const referenceValidator = v.object({
  role: v.union(v.literal("identity"), v.literal("style")),
  bytesBase64: v.string(),
});

const packetRequestValidator = v.object({
  operatorToken: v.string(),
  generationPrompt: v.string(),
  editFeedback: v.string(),
  references: v.array(referenceValidator),
});

const EDIT_PROMPT_PREFIX =
  "Image 1 is the selected image to edit. Image 2 supplies raven identity. Image 3 supplies materials and lighting. ";
const packetFields = (prompt: string) => ({
  model: "gpt-image-2-2026-04-21",
  prompt,
  n: 1 as const,
  size: "1536x1024",
  quality: "low" as const,
  output_format: "png" as const,
  background: "opaque" as const,
  stream: false as const,
});

function packetCapability() {
  const capability = VISUAL_PROVIDER_CAPABILITIES.find(
    (route) =>
      route.provider === "openai" &&
      route.model === "gpt-image-2" &&
      route.apiModelId === "gpt-image-2-2026-04-21",
  );
  if (!capability)
    throw new Error(
      "The functional packet model is missing from the documented provider capability matrix",
    );
  return capability;
}

/** Builds the exact qualification-probe request and matching trusted claim. Route selection is bypassed by design: this run is what produces the first receipts. */
async function packetRequest(input: {
  attemptId: string;
  lineageKey: string;
  operation: "generate" | "edit";
  prompt: string;
  feedback?: string;
  parentVersionId?: string;
  parentModel?: string;
  images: VisualImageInput[];
}): Promise<{
  prepared: PreparedVisualProviderRequest;
  claim: VisualDispatchClaim;
}> {
  const capability = packetCapability();
  // The probe run is what produces the first receipts, so route selection is bypassed with the documented authorized-probe identity: no invented receipts, empty receiptIds.
  const probeRoute = {
    ...capability,
    qualification: "authorized-probe" as const,
    receiptIds: [] as const,
  };
  const base: Omit<PreparedVisualProviderRequest, "requestSha256"> = {
    attemptId: input.attemptId,
    lineageKey: input.lineageKey,
    operation: input.operation,
    mode: "qualification-probe",
    route: probeRoute,
    prompt: input.prompt,
    ...(input.feedback ? { feedback: input.feedback } : {}),
    ...(input.parentVersionId
      ? { parentVersionId: input.parentVersionId }
      : {}),
    ...(input.parentModel ? { parentModel: input.parentModel } : {}),
    revisions: {
      articleRevision: "qualification-packet",
      profileRevision: "qualification-packet",
      lessonRevisions: [],
    },
    modelOverride: null,
    images: input.images,
    request: {
      path: "/v1/images/edits",
      encoding: "multipart",
      fields: packetFields(input.prompt),
    },
  };
  const requestSha256 = await hashVisualProviderRequest(base);
  return {
    prepared: { ...base, requestSha256 },
    claim: {
      claimId: input.attemptId,
      attemptId: input.attemptId,
      lineageKey: input.lineageKey,
      provider: "openai",
      apiModelId: capability.apiModelId,
      requestSha256,
      maximumUsd: QUALIFICATION_PER_ATTEMPT_CAP_MICROS / 1_000_000,
      boundVerified: true,
      mode: "qualification-probe",
    },
  };
}

async function callReceipt(
  operation: "generate" | "edit",
  requestSha256: string,
  result: Extract<
    Awaited<ReturnType<typeof dispatchVisualImageRequest>>,
    { status: "completed" }
  >,
  output: { bytes: Uint8Array; mimeType: string },
  store: (output: {
    bytes: Uint8Array;
    mimeType: string;
  }) => Promise<Id<"_storage">>,
): Promise<CallReceipt> {
  const verified = await verifyVisualOutput(output.bytes, output.mimeType);
  const usageCost = result.usage
    ? calculateVisualUsageCost("openai", result.usage, "gpt-image-2")
    : null;
  const outputStorageId = await store(output);
  return {
    operation,
    requestSha256,
    httpStatus: result.receipt?.httpStatus ?? 200,
    ...(result.receipt?.requestId
      ? { requestId: result.receipt.requestId }
      : {}),
    usage: result.usage ?? null,
    estimatedCostUsd: usageCost,
    outputStorageId,
    outputSha256: verified.sha256,
    outputBytes: verified.bytes,
    width: verified.width,
    height: verified.height,
  };
}

/**
 * Executes the reviewed functional packet: one generation, then one edit bound to the
 * verified 1536x1024 generation output. Caps are enforced before dispatch; outcomes are
 * explicit (absent credentials are reported with the prerequisite named, never silently
 * skipped) and nothing is retried.
 */
export const executeImageQualificationPacket = action({
  args: packetRequestValidator,
  returns: packetResultValidator,
  handler: async (ctx, args): Promise<PacketResult> => {
    const store = (output: { bytes: Uint8Array; mimeType: string }) =>
      ctx.storage.store(
        new Blob([new Uint8Array(output.bytes).buffer], {
          type: output.mimeType,
        }),
      );
    await assertOperatorToken(args.operatorToken);
    const imageCredential = visualProviderCredential("openai");
    const textCredential =
      visualTextCredential("openai") ?? visualTextCredential("cortex");
    const gate = qualificationGate({
      approved: process.env[LIVE_SUBMISSION_APPROVAL_ENV],
      credentials: { image: !!imageCredential, text: !!textCredential },
    });
    if (gate.mode === "offline-fixture")
      return {
        status: "blocked",
        reason: `live submission is not approved (${LIVE_SUBMISSION_APPROVAL_ENV} is not ${LIVE_SUBMISSION_APPROVED_VALUE}); the fixture tier remains the zero-cost default`,
        missingCredentials: [],
        prerequisite: null,
        calls: [],
      };
    if (gate.mode === "absent")
      return {
        status: "absent",
        reason: "credentials-not-configured",
        missingCredentials: gate.missing,
        prerequisite: gate.prerequisite,
        calls: [],
      };
    assertQualificationPacketCaps([
      QUALIFICATION_PER_ATTEMPT_CAP_MICROS,
      QUALIFICATION_PER_ATTEMPT_CAP_MICROS,
    ]);
    assertQualificationPromptBytes(args.generationPrompt);
    const editPrompt = EDIT_PROMPT_PREFIX + args.editFeedback;
    assertQualificationPromptBytes(editPrompt);
    if (!args.editFeedback.trim())
      throw new Error("The edit call requires the packet's reviewed feedback");
    if (args.references.length !== IMAGE_PACKET_REFERENCES.length)
      throw new Error(
        "The functional packet binds exactly the two approved reference images",
      );

    const references: VisualImageInput[] = [];
    for (const [index, reference] of args.references.entries()) {
      const frozen = IMAGE_PACKET_REFERENCES[index];
      if (reference.role !== frozen.role)
        throw new Error(
          `Reference ${index + 1} role differs from the approved packet order`,
        );
      const bytes = Buffer.from(reference.bytesBase64, "base64");
      if (bytes.length !== frozen.bytes)
        throw new Error(
          `Reference ${index + 1} byte count differs from the approved packet`,
        );
      const verified = await verifyVisualOutput(bytes, "image/png");
      if (
        verified.sha256 !== frozen.sha256 ||
        verified.width !== frozen.width ||
        verified.height !== frozen.height
      ) {
        throw new Error(
          `Reference ${index + 1} differs from the approved packet bytes/dimensions; changed or extra images are rejected`,
        );
      }
      const storageId = await ctx.storage.store(
        new Blob([new Uint8Array(bytes).buffer], { type: "image/png" }),
      );
      references.push({
        id: `packet-${frozen.role}`,
        role: frozen.role,
        storageId: storageId.toString(),
        sha256: verified.sha256,
        mimeType: "image/png",
        bytes: Uint8Array.from(bytes),
      });
    }

    const key = imageCredential as string;
    const calls: CallReceipt[] = [];

    const generation = await packetRequest({
      attemptId: "qualification-probe-generate",
      lineageKey: "qualification-packet-article-8",
      operation: "generate",
      prompt: args.generationPrompt,
      images: references,
    });
    const generated = await dispatchVisualImageRequest(
      generation.prepared,
      generation.claim,
      key,
    );
    if (generated.status !== "completed")
      return {
        status: generated.status,
        reason: `generation-${generated.status}: ${generated.reason}`,
        missingCredentials: [],
        prerequisite: null,
        calls,
      };
    const generationOutput = generated.images[0];
    if (!generationOutput)
      return {
        status: "uncertain",
        reason: "generation-output-missing",
        missingCredentials: [],
        prerequisite: null,
        calls,
      };
    const generationVerified = await verifyVisualOutput(
      generationOutput.bytes,
      generationOutput.mimeType,
    );
    if (generationVerified.width !== 1536 || generationVerified.height !== 1024)
      throw new Error(
        "The generation output is not the reviewed 1536x1024 parent; the edit call is refused",
      );
    calls.push(
      await callReceipt(
        "generate",
        generation.claim.requestSha256,
        generated,
        generationOutput,
        store,
      ),
    );

    const parentReference: VisualImageInput = {
      id: "packet-generated-parent",
      role: "edit-parent",
      storageId: calls[0].outputStorageId.toString(),
      sha256: generationVerified.sha256,
      mimeType: generationOutput.mimeType as VisualImageInput["mimeType"],
      bytes: generationOutput.bytes,
    };
    const edit = await packetRequest({
      attemptId: "qualification-probe-edit",
      lineageKey: "qualification-packet-article-8",
      operation: "edit",
      prompt: editPrompt,
      feedback: args.editFeedback,
      parentVersionId: "qualification-probe-generate",
      parentModel: "gpt-image-2",
      images: [parentReference, ...references],
    });
    const edited = await dispatchVisualImageRequest(
      edit.prepared,
      edit.claim,
      key,
    );
    if (edited.status !== "completed")
      return {
        status: edited.status,
        reason: `edit-${edited.status}: ${edited.reason}`,
        missingCredentials: [],
        prerequisite: null,
        calls,
      };
    const editOutput = edited.images[0];
    if (!editOutput)
      return {
        status: "uncertain",
        reason: "edit-output-missing",
        missingCredentials: [],
        prerequisite: null,
        calls,
      };
    calls.push(
      await callReceipt(
        "edit",
        edit.claim.requestSha256,
        edited,
        editOutput,
        store,
      ),
    );
    return {
      status: "completed",
      reason: null,
      missingCredentials: [],
      prerequisite: null,
      calls,
    };
  },
});
