import { describe, expect, it, vi } from "vitest";
import { VISUAL_PROVIDER_CAPABILITIES, calculateVisualUsageCost, executeVisualProviderRequest, hashVisualProviderRequest, interpretVisualProviderResponse, prepareVisualProviderRequest, quoteVisualProviderCost, selectVisualProviderRoute, type VisualRouteCapability } from "@/lib/visualProviders";

// Speculative protocol doubles, not sanitized live receipts or qualification.
const openaiFixture: VisualRouteCapability = {
  provider: "openai", model: "gpt-image-2", apiModelId: "gpt-image-2",
  qualification: "speculative-fixture", receiptIds: [],
  operations: ["generate", "edit"], referenceInputs: true, maxInputImages: 16,
  sizes: ["1536x1024"], outputFormats: ["png"],
};
const doFixture: VisualRouteCapability = {
  ...openaiFixture, provider: "digitalocean", apiModelId: "openai-gpt-image-2",
  referenceInputs: false, operations: ["generate"],
};
const identity = { id: "raven", role: "identity" as const, storageId: "stored-raven", sha256: "275f1bcbbb585c71e3b2184304eccfa0e37de92022ca3b6f4e9c10df32318d85",
  mimeType: "image/png" as const, bytes: new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1]) };
const style = { ...identity, id: "paper-lighting", role: "style" as const, storageId: "stored-style", sha256: "379aa60c5861ea4f15b6b8fd97ce05053fd6a7de6a4bd4338859fd72ebdbdf4d", bytes: new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 2]) };
const pins = { articleRevision: "article-v3", profileRevision: "profile-v1", lessonRevisions: ["corvo-02:v1"] };
const generation = () => prepareVisualProviderRequest({
  attemptId: "attempt-generate", lineageKey: "post-1/scene-1", operation: "generate", mode: "offline-contract", prompt: "A raven sees the bent tool.",
  revisions: pins, references: [identity, style], size: "1536x1024", quality: "medium", outputFormat: "png",
}, [openaiFixture]);
const claimFixture = async (request: Awaited<ReturnType<typeof generation>>) => ({
  claimId: "offline-claim", attemptId: request.attemptId, lineageKey: request.lineageKey, provider: request.route.provider,
  apiModelId: request.route.apiModelId, requestSha256: request.requestSha256, maximumUsd: 0, mode: "offline-contract" as const,
});

describe("editorial visual provider boundary", () => {
  it("rejects empty revision pins in preparation and consistently hashed interpretation", async () => {
    const original = await generation();
    const input = { attemptId: "pins", lineageKey: "post-1/scene-1", operation: "generate" as const, mode: "offline-contract" as const, prompt: "Read the bend.", references: [identity], size: "1536x1024", quality: "medium" as const, outputFormat: "png" as const };
    for (const revisions of [{ ...pins, articleRevision: " " }, { ...pins, profileRevision: "" }, { ...pins, lessonRevisions: [""] }, { ...pins, lessonRevisions: [1] as unknown as string[] }]) {
      await expect(prepareVisualProviderRequest({ ...input, revisions }, [openaiFixture])).rejects.toThrow("revision pins");
      const request = { ...original, revisions }; request.requestSha256 = await hashVisualProviderRequest(request);
      expect(await interpretVisualProviderResponse(request, await claimFixture(request), { status: 200, body: { data: [{ b64_json: "iVBORw0KGgo=" }] } })).toMatchObject({ status: "uncertain", reason: "request-provenance-invalid" });
    }
  });
  it("uses a synchronous request snapshot throughout interpreter awaits", async () => {
    const request = await generation(), claim = await claimFixture(request);
    const digest = crypto.subtle.digest.bind(crypto.subtle);
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const spy = vi.spyOn(crypto.subtle, "digest").mockImplementationOnce(async (...args) => { await gate; return digest(...args); });
    try {
      const pending = interpretVisualProviderResponse(request, claim, { status: 200, body: { data: [{ b64_json: "iVBORw0KGgo=" }] } });
      request.prompt = "Changed during await"; request.request.fields.quality = "high";
      request.revisions.articleRevision = "changed"; request.images[0].bytes[0] = 0;
      release();
      expect(await pending).toMatchObject({ status: "completed", receipt: { settings: { quality: "medium" }, revisions: pins } });
    } finally { release(); spy.mockRestore(); }
  });
  it("rechecks edit model continuity and feedback even for consistently hashed fixture input", async () => {
    const original = await prepareVisualProviderRequest({ attemptId: "edit-invariants", lineageKey: "post-1/scene-1", operation: "edit", mode: "offline-contract", prompt: "Shorten the grip.", feedback: "Shorten it.", revisions: pins,
      references: [identity], size: "1536x1024", quality: "medium", outputFormat: "png", parentImage: { ...style, role: "edit-parent", versionId: "hero-v2", model: "gpt-image-2", provider: "openai" } }, [openaiFixture]);
    for (const override of [{ parentModel: "other" }, { modelOverride: "other" }, { parentModel: undefined }, { parentVersionId: undefined }, { feedback: " " }]) {
      const changed = { ...original, ...override }; changed.requestSha256 = await hashVisualProviderRequest(changed);
      expect(await interpretVisualProviderResponse(changed, await claimFixture(changed), { status: 200, body: { data: [{ b64_json: "iVBORw0KGgo=" }] } }))
        .toMatchObject({ status: "uncertain", reason: "request-provenance-invalid" });
    }
  });
  it("binds full canonical image and revision provenance to the separately retained claim hash", async () => {
    const original = await generation(), claim = await claimFixture(original);
    const input = { attemptId: "attempt-generate", lineageKey: "post-1/scene-1", operation: "generate" as const, mode: "offline-contract" as const, prompt: original.prompt,
      revisions: pins, references: [identity, style], size: "1536x1024", quality: "medium" as const, outputFormat: "png" as const };
    for (const changed of [{ ...input, revisions: { ...pins, profileRevision: "profile-v2" } }, { ...input, references: [style, identity] }]) {
      const request = await prepareVisualProviderRequest(changed, [openaiFixture]);
      expect(await interpretVisualProviderResponse(request, claim, { status: 200, body: { data: [{ b64_json: "iVBORw0KGgo=" }] } }))
        .toMatchObject({ status: "uncertain", reason: "claim-does-not-match-request", claimId: "offline-claim" });
      expect(request.requestSha256).not.toBe(original.requestSha256);
    }
    expect(await interpretVisualProviderResponse(original, { ...claim, requestSha256: "f".repeat(64) }, { status: 200, body: { data: [{ b64_json: "iVBORw0KGgo=" }] } }))
      .toMatchObject({ status: "uncertain", reason: "claim-does-not-match-request", claimId: "offline-claim" });
  });
  it("keeps default routes unqualified, pins the production snapshot and accepts matching JPEG/WebP fixture signatures", async () => {
    expect(VISUAL_PROVIDER_CAPABILITIES.find(route => route.provider === "openai")?.apiModelId).toBe("gpt-image-2-2026-04-21");
    expect(selectVisualProviderRoute({ operation: "generate", model: "gpt-image-2", referenceCount: 0, size: "1536x1024", outputFormat: "png", mode: "offline-contract" }).ok).toBe(false);
    for (const [format, bytes] of [["jpeg", [255, 216, 255]], ["webp", [82, 73, 70, 70, 0, 0, 0, 0, 87, 69, 66, 80]]] as const) {
      const request = await prepareVisualProviderRequest({ attemptId: "formats", lineageKey: "post-1/scene-1", operation: "generate", mode: "offline-contract", prompt: "Read the bend.", revisions: pins,
        references: [identity], size: "1536x1024", quality: "medium", outputFormat: format }, [{ ...openaiFixture, outputFormats: [format] }]);
      expect(await interpretVisualProviderResponse(request, await claimFixture(request), { status: 200, body: { data: [{ b64_json: btoa(String.fromCharCode(...bytes)) }] } })).toMatchObject({ status: "completed" });
      if (format === "webp") expect(await interpretVisualProviderResponse(request, await claimFixture(request), { status: 200, body: { data: [{ b64_json: btoa(String.fromCharCode(...bytes.slice(0, 11))) }] } })).toMatchObject({ status: "uncertain", reason: "provider-result-invalid" });
    }
    const bytes = identity.bytes.slice();
    const prepared = await prepareVisualProviderRequest({ attemptId: "snapshot", lineageKey: "post-1/scene-1", operation: "generate", mode: "offline-contract", prompt: "Read the bend.", revisions: pins,
      references: [{ ...identity, bytes }], size: "1536x1024", quality: "medium", outputFormat: "png" }, [openaiFixture]);
    bytes[0] = 0;
    expect(prepared.images[0].bytes[0]).toBe(137);
  });
  it("cannot interpret a live claim as completed while its reliable quote is unknown", async () => {
    const request = { ...await generation(), mode: "live" as const }, claim = { ...await claimFixture(request), mode: "live" as const };
    expect(await interpretVisualProviderResponse(request, claim, { status: 200, body: { data: [{ b64_json: "iVBORw0KGgo=" }] } }))
      .toMatchObject({ status: "uncertain", reason: "reliable-cost-bound-required", claimId: "offline-claim" });
  });
  it("does not coerce non-string request IDs into durable receipt metadata", async () => {
    const request = await generation();
    const result = await interpretVisualProviderResponse(request, await claimFixture(request), { status: 200, requestId: ["req_private"] as unknown as string, body: { data: [{ b64_json: "iVBORw0KGgo=" }] } });
    expect(result).not.toHaveProperty("receipt.requestId");
  });
  it("rejects conflicting model inputs while allowing a deliberate generation override", async () => {
    const input = { attemptId: "conflict", lineageKey: "post-1/scene-1", operation: "generate" as const, mode: "offline-contract" as const, prompt: "Read the bend.",
      revisions: pins, references: [identity], size: "1536x1024", quality: "medium" as const, outputFormat: "png" as const };
    await expect(prepareVisualProviderRequest({ ...input, model: "gpt-image-2", modelOverride: "other" }, [{ ...openaiFixture, model: "other" }])).rejects.toThrow("Conflicting");
    expect(await prepareVisualProviderRequest({ ...input, modelOverride: "other" }, [{ ...openaiFixture, model: "other" }])).toMatchObject({ route: { model: "other" }, modelOverride: "other" });
  });
  it("records edit operation, revision pins, feedback and deliberate override with typed submitted settings", async () => {
    const request = await prepareVisualProviderRequest({ attemptId: "full-edit", lineageKey: "post-1/scene-1", operation: "edit", mode: "offline-contract", modelOverride: "explicit-other-model",
      prompt: "Shorten only the grip.", feedback: "Shorten the grip.", revisions: pins, references: [identity], size: "1536x1024", quality: "medium", outputFormat: "png",
      parentImage: { ...style, role: "edit-parent", versionId: "hero-v2", model: "gpt-image-2", provider: "openai" } }, [{ ...openaiFixture, model: "explicit-other-model", apiModelId: "explicit-other-model" }]);
    const result = await interpretVisualProviderResponse(request, await claimFixture(request), { status: 200, body: { data: [{ b64_json: "iVBORw0KGgo=" }] } });
    expect(result).toMatchObject({ status: "completed", receipt: { operation: "edit", mode: "offline-contract", canonicalModel: "explicit-other-model", revisions: pins,
      parentVersionId: "hero-v2", parentModel: "gpt-image-2", modelOverride: "explicit-other-model", modelOverrideChangedParent: true,
      feedbackSha256: expect.stringMatching(/^[a-f\d]{64}$/), requestSha256: request.requestSha256,
      settings: { n: 1, size: "1536x1024", quality: "medium", outputFormat: "png", background: "opaque", stream: false } } });
  });
  it("rejects every forged transport setting and parent/reference invariant", async () => {
    const request = await generation(), claim = await claimFixture(request);
    const changes = [
      ...[{ model: "other" }, { n: 2 }, { size: "999x999" }, { quality: "automatic" }, { quality: "high" }, { output_format: "jpeg" }, { background: "transparent" }, { stream: true }].map(fields => ({ ...request, request: { ...request.request, fields: { ...request.request.fields, ...fields } } })),
      { ...request, request: { ...request.request, path: "/v1/images/generations", encoding: "json" } },
      { ...request, request: { ...request.request, encoding: "json" } },
      { ...request, parentVersionId: "forged-parent" }, { ...request, operation: "edit" },
      { ...request, images: [{ ...request.images[0], role: "edit-parent" }, request.images[1]] },
      { ...request, images: [request.images[0], request.images[0]] },
    ];
    for (const changed of changes) expect(await interpretVisualProviderResponse(changed as typeof request, claim, { status: 200, body: { data: [{ b64_json: "iVBORw0KGgo=" }] } }))
      .toMatchObject({ status: "uncertain", reason: "request-provenance-invalid", claimId: "offline-claim" });
  });
  it("rejects substituted prepared bytes and forged offline qualification while retaining the claim", async () => {
    const request = await generation(), claim = await claimFixture(request);
    const response = { status: 200, body: { data: [{ b64_json: "iVBORw0KGgo=" }] } };
    for (const changed of [
      { ...request, images: [{ ...request.images[0], bytes: new Uint8Array(style.bytes) }, request.images[1]] },
      { ...request, route: { ...request.route, qualification: "live-receipt" as const, receiptIds: ["asserted"] } },
      { ...request, prompt: "Different from the protocol prompt" },
    ]) {
      expect(await interpretVisualProviderResponse(changed, claim, response))
        .toMatchObject({ status: "uncertain", reason: "request-provenance-invalid", claimId: "offline-claim" });
    }
  });
  it("omits rewrites and model metadata carrying credential-like or long opaque tokens", async () => {
    const request = await generation(), claim = await claimFixture(request);
    for (const token of ["sk_live_private", "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJwcml2YXRlIn0.signature", "AKIAABCDEFGHIJKLMNOP", "opaque".repeat(10), "https://private.example/path"]) {
      const result = await interpretVisualProviderResponse(request, claim, { status: 200, body: { data: [{ b64_json: "iVBORw0KGgo=", revised_prompt: "Keep " + token }] } });
      expect(result.status).toBe("completed");
      expect(result).not.toHaveProperty("revisedPrompt");
    }
    const result = await interpretVisualProviderResponse(request, claim, { status: 200, body: { model: "sk_live_private", data: [{ b64_json: "iVBORw0KGgo=" }] } });
    expect(result).not.toHaveProperty("receipt.reportedModel");
  });
  it("keeps a provider-reported model mismatch uncertain and omits malformed request IDs", async () => {
    const request = await generation(), claim = await claimFixture(request);
    expect(await interpretVisualProviderResponse(request, claim, { status: 200, requestId: "Bearer private-id", body: { model: "other-model", data: [{ b64_json: "iVBORw0KGgo=" }] } }))
      .toMatchObject({ status: "uncertain", reason: "provider-model-mismatch", receipt: { reportedModel: "other-model" } });
    const result = await interpretVisualProviderResponse(request, claim, { status: 200, requestId: "req_" + "a".repeat(101), body: { model: "gpt-image-2", data: [{ b64_json: "iVBORw0KGgo=" }] } });
    expect(result).not.toHaveProperty("receipt.requestId");
  });
  it("binds response evidence to the claim, logical job, prompt, ordered input and output hashes", async () => {
    const request = await generation(), claim = await claimFixture(request);
    const result = await interpretVisualProviderResponse(request, claim, { status: 200, body: { model: "gpt-image-2", data: [{ b64_json: "iVBORw0KGgo=" }] } });
    const digest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(request.prompt))), byte => byte.toString(16).padStart(2, "0")).join("");
    expect(result).toMatchObject({ status: "completed", receipt: { attemptId: "attempt-generate", claimId: "offline-claim", maximumUsd: 0,
      lineageKey: "post-1/scene-1", promptSha256: digest, reportedModel: "gpt-image-2", qualifiesRoute: false,
      inputImages: [{ role: "identity", sha256: identity.sha256 }, { role: "style", sha256: style.sha256 }],
      outputSha256: [expect.stringMatching(/^[a-f\d]{64}$/)], } });
  });
  it("retains invalid signatures, oversized bytes and invalid HTTP status as uncertain", async () => {
    const request = await generation(), claim = await claimFixture(request);
    for (const response of [
      { status: 200, body: { data: [{ b64_json: "AAAA" }] } },
      { status: 200, body: { data: [{ b64_json: "/9j/" }] } },
      { status: 200, body: { data: [{ b64_json: "A".repeat(Math.ceil(20 * 1024 * 1024 / 3) * 4 + 4) }] } },
      { status: 200.5, body: { data: [{ b64_json: "iVBORw0KGgo=" }] } },
    ]) {
      expect(await interpretVisualProviderResponse(request, claim, response))
        .toMatchObject({ status: "uncertain", reason: "provider-result-invalid", claimId: "offline-claim" });
    }
  });
  it("verifies the digest of the exact retained input bytes", async () => {
    await expect(Promise.resolve().then(() => prepareVisualProviderRequest({ attemptId: "digest", lineageKey: "post-1/scene-1", operation: "generate", mode: "offline-contract", prompt: "Read the bend.",
      revisions: pins, references: [{ ...identity, sha256: "f".repeat(64) }], size: "1536x1024", quality: "medium", outputFormat: "png" }, [openaiFixture])))
      .rejects.toThrow("digest");
  });
  it("rejects input MIME claims without matching bounded image signatures", async () => {
    for (const bytes of [new Uint8Array([1, 2, 3]), new Uint8Array(20 * 1024 * 1024 + 1)]) {
      await expect(prepareVisualProviderRequest({ attemptId: "magic", lineageKey: "post-1/scene-1", operation: "generate", mode: "offline-contract", prompt: "A raven sees the bend.",
        revisions: pins, references: [{ ...identity, bytes }], size: "1536x1024", quality: "medium", outputFormat: "png" }, [openaiFixture])).rejects.toThrow("image signature");
    }
  });
  it("rejects operation/role mismatches and duplicate provenance while preserving composition binding order", async () => {
    const input = { attemptId: "roles", lineageKey: "post-1/scene-1", operation: "generate" as const, mode: "offline-contract" as const, prompt: "A raven sees the bend.",
      revisions: pins, references: [identity, style], size: "1536x1024", quality: "medium" as const, outputFormat: "png" as const };
    const parentImage = { ...style, role: "edit-parent" as const, versionId: "hero-v2", model: "gpt-image-2", provider: "openai" as const };
    await expect(prepareVisualProviderRequest({ ...input, parentImage }, [openaiFixture])).rejects.toThrow("parent");
    await expect(prepareVisualProviderRequest({ ...input, operation: "edit", feedback: "Move it.", parentImage: { ...parentImage, role: "style" } }, [openaiFixture])).rejects.toThrow("role");
    for (const reference of [{ ...style, role: "edit-parent" as const }, { ...style, id: identity.id }, { ...style, storageId: identity.storageId }, { ...style, sha256: identity.sha256 }]) {
      await expect(prepareVisualProviderRequest({ ...input, references: [identity, reference] }, [openaiFixture])).rejects.toThrow();
    }
    expect((await prepareVisualProviderRequest({ ...input, references: [{ ...style, role: "composition" }, identity] }, [openaiFixture])).images.map(image => image.role))
      .toEqual(["composition", "identity"]);
  });
  it("requires an explicit modelOverride to change an edit parent model", async () => {
    const input = { attemptId: "override", lineageKey: "post-1/scene-1", operation: "edit" as const, mode: "offline-contract" as const,
      prompt: "Move the handle.", feedback: "Move it.", revisions: pins, references: [identity],
      size: "1536x1024", quality: "medium" as const, outputFormat: "png" as const,
      parentImage: { ...style, role: "edit-parent" as const, versionId: "hero-v2", model: "gpt-image-2", provider: "openai" as const } };
    const routes = [{ ...openaiFixture, model: "explicit-other-model", apiModelId: "explicit-other-model" }];
    await expect(prepareVisualProviderRequest({ ...input, model: "explicit-other-model" }, routes)).rejects.toThrow("Use modelOverride");
    expect(await prepareVisualProviderRequest({ ...input, modelOverride: "explicit-other-model" }, routes))
      .toMatchObject({ route: { model: "explicit-other-model" }, parentVersionId: "hero-v2" });
  });
  it("retains every mismatched claim for reconciliation without marking a fixture complete", async () => {
    const request = await generation(), claim = await claimFixture(request);
    for (const override of [{ attemptId: "other" }, { provider: "digitalocean" as const }, { apiModelId: "other" }, { mode: "live" as const }, { maximumUsd: 1 }, { maximumUsd: NaN }]) {
      expect(await interpretVisualProviderResponse(request, { ...claim, ...override }, { status: 200, body: { data: [{ b64_json: "iVBORw0KGgo=" }] } }))
        .toMatchObject({ status: "uncertain", reason: "claim-does-not-match-request", claimId: "offline-claim" });
    }
  });
  it("limits offline route selection to speculative fixtures with no receipts", async () => {
    const request = { operation: "generate" as const, model: "gpt-image-2", referenceCount: 2, size: "1536x1024", outputFormat: "png" as const, mode: "offline-contract" as const };
    expect(selectVisualProviderRoute(request, [{ ...openaiFixture, qualification: "live-receipt", receiptIds: ["real-receipt"] }]).ok).toBe(false);
    expect(selectVisualProviderRoute(request, [{ ...openaiFixture, receiptIds: ["asserted-receipt"] }]).ok).toBe(false);
  });
  it("cannot dispatch an arbitrary callback even when caller labels it offline", async () => {
    const dispatch = vi.fn().mockResolvedValue({ status: 200, body: { data: [{ b64_json: "iVBORw0KGgo=" }] } });
    const claimDispatch = vi.fn(claimFixture);
    for (const requestMode of ["live", "offline-contract"] as const) {
      for (const contextMode of ["live", "offline-contract"] as const) {
        const prepared = { ...await generation(), mode: requestMode, route: { ...openaiFixture, qualification: "live-receipt" as const, receiptIds: ["asserted-receipt"] } };
        expect(await executeVisualProviderRequest(prepared, { mode: contextMode, claimDispatch, dispatch }))
          .toMatchObject({ status: "blocked", reason: "reliable-cost-bound-required" });
      }
    }
    expect(claimDispatch).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
  });
  it("keeps extra outputs and deterministic HTTP errors uncertain and rejects invalid preparation identity", async () => {
    const request = await generation(), claim = await claimFixture(request);
    expect(await interpretVisualProviderResponse(request, claim, { status: 200, body: { data: [{ b64_json: "iVBORw0KGgo=" }, { b64_json: "iVBORw0KGgo=" }] } }))
      .toMatchObject({ status: "uncertain", reason: "provider-result-incomplete" });
    expect(await interpretVisualProviderResponse(request, claim, { status: 400, body: { error: { message: "private" } } }))
      .toMatchObject({ status: "uncertain", reason: "provider-http-uncertain" });
    const input = { attemptId: "invalid", lineageKey: "post-1/scene-1", operation: "generate" as const, mode: "offline-contract" as const, prompt: "Read the bend.",
      revisions: pins, references: [identity], size: "1536x1024", quality: "medium" as const, outputFormat: "png" as const };
    await expect(prepareVisualProviderRequest({ ...input, attemptId: "" }, [openaiFixture])).rejects.toThrow("Attempt");
    await expect(prepareVisualProviderRequest({ ...input, previousOutcome: "uncertain" }, [openaiFixture])).rejects.toThrow("reconciliation-required");
  });
  it("does not enable a documented model without real operation qualification", async () => {
    expect(selectVisualProviderRoute({
      operation: "generate", model: "gpt-image-2", referenceCount: 2,
      size: "1536x1024", outputFormat: "png",
    })).toMatchObject({ ok: false, reason: "no-qualified-route" });
  });
  it("routes reference work around a known gap without treating the double as qualified", async () => {
    const request = {
      operation: "generate" as const, model: "gpt-image-2", referenceCount: 2,
      size: "1536x1024", outputFormat: "png" as const,
    };
    expect(selectVisualProviderRoute({ ...request, mode: "offline-contract" }, [doFixture, openaiFixture]))
      .toMatchObject({ ok: true, route: { provider: "openai", model: "gpt-image-2" } });
    expect(selectVisualProviderRoute(request, [doFixture, openaiFixture]))
      .toMatchObject({ ok: false, reason: "no-qualified-route" });
  });
  it("requires reconciliation before any fallback from an uncertain paid result", async () => {
    expect(selectVisualProviderRoute({
      operation: "edit", model: "gpt-image-2", referenceCount: 3,
      size: "1536x1024", outputFormat: "png", mode: "offline-contract",
      previousOutcome: "uncertain",
    }, [openaiFixture])).toMatchObject({ ok: false, reason: "reconciliation-required" });
  });
  it("prepares an edit with the selected parent first, default model continuity and exact prompt/reference pins", async () => {
    const prepared = await prepareVisualProviderRequest({
      attemptId: "attempt-edit", lineageKey: "post-1/scene-1", operation: "edit", mode: "offline-contract",
      prompt: "Move only the copper handle to the right. Keep the workshop story.",
      feedback: "Move only the copper handle to the right.", revisions: pins,
      references: [identity, style], size: "1536x1024", quality: "medium", outputFormat: "png",
      parentImage: { ...style, id: "selected-v2", role: "edit-parent", storageId: "selected-bytes", sha256: "a72382d260ebdf7948e618a3908a8e569f5cf9bbd3f1d804ee456a9fa1222568", bytes: new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 3]),
        versionId: "hero-v2", model: "gpt-image-2", provider: "digitalocean" },
    }, [doFixture, openaiFixture]);
    expect(prepared.images.map((image) => [image.id, image.role, image.storageId]))
      .toEqual([["selected-v2", "edit-parent", "selected-bytes"], ["raven", "identity", "stored-raven"], ["paper-lighting", "style", "stored-style"]]);
    expect(prepared).toMatchObject({
      route: { provider: "openai", model: "gpt-image-2", apiModelId: "gpt-image-2" },
      parentVersionId: "hero-v2", revisions: pins,
      request: { path: "/v1/images/edits", encoding: "multipart", fields: {
        model: "gpt-image-2", n: 1, prompt: "Move only the copper handle to the right. Keep the workshop story.",
      } },
    });
    expect(prepared.request.fields).not.toHaveProperty("input_fidelity");
  });
  it("rejects an edit without a selected parent rather than dispatching text-only regeneration", async () => {
    await expect(prepareVisualProviderRequest({
      attemptId: "missing-parent", lineageKey: "post-1/scene-1", operation: "edit", mode: "offline-contract", prompt: "Move the handle.",
      revisions: pins, references: [identity, style], size: "1536x1024", quality: "medium", outputFormat: "png",
    }, [openaiFixture])).rejects.toThrow("An edit requires the selected parent image and feedback");
  });
  it("returns durable image bytes and observed usage while omitting secret-bearing receipt material", async () => {
    const dispatch = vi.fn().mockResolvedValue({ status: 200, requestId: "req_fixture", body: {
      output_format: "png", authorization: "Bearer private-token", debug: { apiKey: "private-key" },
      data: [{ b64_json: "iVBORw0KGgo=", revised_prompt: "Preserve the raven and workshop.", url: "https://example.test/image?token=private-url" }],
      usage: { input_tokens: 30, input_tokens_details: { text_tokens: 10, image_tokens: 20 }, output_tokens: 40, total_tokens: 70 },
    } });
    const request = await generation();
    const result = await interpretVisualProviderResponse(request, await claimFixture(request), await dispatch());
    expect(result).toMatchObject({ status: "completed", revisedPrompt: "Preserve the raven and workshop.",
      usage: { textInputTokens: 10, imageInputTokens: 20, imageOutputTokens: 40 } });
    if (result.status !== "completed") throw new Error("Expected completed offline result");
    expect([...result.images[0].bytes]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    expect(JSON.stringify(result)).not.toMatch(/private-token|private-key|private-url|b64_json|https:\/\//);
    expect(dispatch).toHaveBeenCalledTimes(1);
  });
  it("blocks live dispatch when no reliable total charge bound has been established", async () => {
    const prepared = { ...(await generation()), mode: "live" as const };
    const claimDispatch = vi.fn(claimFixture), dispatch = vi.fn();
    expect(quoteVisualProviderCost(prepared.route)).toMatchObject({ maximumUsd: null, estimatedOnly: true });
    expect(await executeVisualProviderRequest(prepared, { mode: "live", claimDispatch, dispatch }))
      .toMatchObject({ status: "blocked", reason: "reliable-cost-bound-required" });
    expect(claimDispatch).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
  });
  it("keeps a nominal success without image bytes uncertain and retains available usage", async () => {
    const dispatch = vi.fn().mockResolvedValue({ status: 200, body: {
      data: [], usage: { input_tokens_details: { text_tokens: 10, image_tokens: 20 }, output_tokens: 40 },
      error: { message: "private raw error" },
    } });
    expect(await interpretVisualProviderResponse(await generation(), await claimFixture(await generation()), await dispatch()))
      .toMatchObject({ status: "uncertain", claimId: "offline-claim", reason: "provider-result-incomplete",
        receipt: { usage: { textInputTokens: 10, imageInputTokens: 20, imageOutputTokens: 40 } } });
    expect(dispatch).toHaveBeenCalledTimes(1);
  });
  it("keeps an HTTP server failure uncertain even if its body contains an image", async () => {
    expect(await interpretVisualProviderResponse(await generation(), await claimFixture(await generation()),
      { status: 503, body: { data: [{ b64_json: "iVBORw0KGgo=" }] } })).toMatchObject({ status: "uncertain", reason: "provider-http-uncertain", claimId: "offline-claim" });
  });
  it("keeps undecodable completed bytes uncertain so the claim cannot be silently released", async () => {
    expect(await interpretVisualProviderResponse(await generation(), await claimFixture(await generation()),
      { status: 200, body: { data: [{ b64_json: "broken bytes private-content" }] } })).toMatchObject({ status: "uncertain", reason: "provider-result-invalid", claimId: "offline-claim" });
  });
  it("omits a provider rewrite containing credential material without discarding the image", async () => {
    const result = await interpretVisualProviderResponse(await generation(), await claimFixture(await generation()),
      { status: 200, body: { data: [{ b64_json: "iVBORw0KGgo=", revised_prompt: "Bearer private-rewrite" }] } });
    expect(result.status).toBe("completed");
    expect(JSON.stringify(result)).not.toContain("private-rewrite");
    expect(result).not.toHaveProperty("revisedPrompt");
  });
  it("rejects a named reference without actual retained bytes", async () => {
    await expect(prepareVisualProviderRequest({
      attemptId: "missing-bytes", lineageKey: "post-1/scene-1", operation: "generate", mode: "offline-contract", prompt: "Read the bend.",
      revisions: pins, references: [{ ...identity, bytes: new Uint8Array() }, style],
      size: "1536x1024", quality: "medium", outputFormat: "png",
    }, [openaiFixture])).rejects.toThrow("Every image input requires retained bytes and provenance");
  });
  it("prices observed text, image input and image output using separate provider rates", async () => {
    const usage = { textInputTokens: 10, imageInputTokens: 20, imageOutputTokens: 40 };
    expect(calculateVisualUsageCost("digitalocean", usage)).toBeCloseTo(0.00141, 10);
    expect(calculateVisualUsageCost("openai", usage)).toBeCloseTo(0.000705, 10);
    expect(calculateVisualUsageCost("openai", { ...usage, imageInputTokens: -1 })).toBeNull();
  });
  it("does not infer a DO reference wire contract from an asserted capability flag", async () => {
    await expect(prepareVisualProviderRequest({
      attemptId: "do-wire-gap", lineageKey: "post-1/scene-1", operation: "generate", mode: "offline-contract", prompt: "Read the bend.",
      revisions: pins, references: [identity, style], size: "1536x1024", quality: "medium", outputFormat: "png",
    }, [{ ...doFixture, referenceInputs: true, maxInputImages: 16 }]))
      .rejects.toThrow("DigitalOcean reference/edit request contract is not established");
  });
});
