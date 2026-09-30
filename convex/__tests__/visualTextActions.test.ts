import { convexTest } from "convex-test";
import { createHash } from "node:crypto";
import { anyApi } from "convex/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import schema from "../schema";
import { articleSignature, stableInputSignature } from "../../lib/visualWorkflow";

const api = anyApi;
const modules = import.meta.glob("../**/*.ts");
const article = { title: "An inspection finds the fault", content: "The raven inspects a machine and chooses to repair the broken gear." };
const credentials = vi.hoisted(() => ({ key: "fictional-text-key" as string | null, cortexKey: null as string | null }));
vi.mock("../../lib/visualTextRuntime", async original => ({ ...await original<typeof import("../../lib/visualTextRuntime")>(), visualTextCredential: (provider: string) => provider === "openai" ? credentials.key : credentials.cortexKey }));
const scenes = [
  { title: "Find the fault", subject: "raven in a workshop", metaphor: "inspection before action", action: "raven removes a broken gear", reveal: "repair exposes the cause of failure", articleConnection: "Inspection identifies a cause before committing to repair.", articleAnchor: "repair the broken gear" },
  { title: "Choose a path", subject: "navigator at a fork in a stone passage", metaphor: "evidence guides decisions", action: "navigator follows a lantern beam through the correct doorway", reveal: "the unlit passage ends abruptly", articleConnection: "Evidence makes the decision consequential.", articleAnchor: "chooses to repair" },
  { title: "Test under load", subject: "bridge builder beside a river", metaphor: "verification before trust", action: "builder lowers a weighted basket onto a newly repaired crossing", reveal: "one weak joint bends visibly", articleConnection: "Testing reveals failure before users depend on it.", articleAnchor: "inspects a machine" },
];
const route = { provider: "openai", model: "fictional-approved-text-model", stages: ["planning", "reflection"], maxInputBytes: 20_000, maxInputTokens: 21_000, maxMessageOverheadTokens: 1000, contextWindowTokens: 30_000, maxOutputTokens: 4000, inputPriceMicrosPerMillion: 1_000_000, outputPriceMicrosPerMillion: 2_000_000, capabilityReceiptIds: ["fictional-text-capability"], tokenBoundReceiptId: "fictional-byte-token-proof", priceReceiptId: "fictional-price-proof", reviewedBy: "offline-test-review", provenance: "IN-PROCESS FAKE HTTP CONTRACT, not live qualification", expiresAt: 4_000_000_000_000 };

function response(output: unknown) {
  return new Response(JSON.stringify({ model: route.model, choices: [{ finish_reason: "stop", message: { content: JSON.stringify(output) } }], usage: { prompt_tokens: 100, completion_tokens: 50 } }), { status: 200, headers: { "x-request-id": "req_fictional" } });
}

async function setup() {
  const t = convexTest(schema, modules), user = t.withIdentity({ subject: "author" });
  const postId = await t.run(async ctx => {
    await ctx.db.insert("v2BrandMemberships", { userId: "author", brandId: "corvo", role: "owner", createdAt: 1, updatedAt: 1 });
    return ctx.db.insert("v2Posts", { userId: "author", brandId: "corvo", channelId: "corvo-blog", platformId: "corvo-blog", ...article, contentFingerprint: "saved", status: "draft", approvalState: "unapproved", timezone: "UTC", createdAt: 1, updatedAt: 1 });
  });
  await user.mutation(api.visualProfiles.saveRevision, { brandId: "corvo", expectedRevisionId: null, guidance: { artDirection: "Narrative raven scenes", palette: [{ name: "Dark teal", color: "#123456" }], mascotGuidance: "One raven", compositionGuidance: "Visible action", textPolicy: "No text", heroChartPolicy: "No charts" }, referenceBindings: [], defaultRoute: { provider: "openai", model: "gpt-image-2", qualification: "unqualified" } });
  await user.mutation(api.visualWorkflow.setMonthlyBudget, { brandId: "corvo", limitMicros: 100_000 });
  const attemptId = await user.mutation(api.visualWorkflow.requestPlan, { postId, operationKey: "plan" });
  return { t, user, postId, attemptId };
}

describe("authenticated text executor", () => {
  beforeEach(() => { credentials.key = "fictional-text-key"; credentials.cortexKey = null; vi.stubEnv("EDITORIAL_VISUALS_ENABLED", "1"); vi.stubGlobal("fetch", vi.fn()); });
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

  it("keeps planning queued without reserving or HTTP when no trusted route exists", async () => {
    const { user, postId, attemptId } = await setup();
    expect(await user.action(api.visualTextActions.executeTextAttempt, { attemptId })).toMatchObject({ status: "blocked", reason: "no-qualified-text-route-and-cost-bound" });
    const state = await user.query(api.visualWorkflow.get, { postId });
    expect(state.attempts[0].status).toBe("queued");
    expect(state.month?.reservedMicros ?? 0).toBe(0);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("executes a saved planning attempt through quote, reservation, claim and completion using one mocked HTTP response", async () => {
    const { t, user, postId, attemptId } = await setup();
    await t.mutation(api.visualTextConfig.registerReviewedTextRoute, route);
    vi.mocked(fetch).mockResolvedValue(response({ scenes }));
    const result = await user.action(api.visualTextActions.executeTextAttempt, { attemptId });
    expect(result.status).toBe("completed");
    const state = await user.query(api.visualWorkflow.get, { postId });
    expect(state.plans[0]).toMatchObject({ status: "complete", scenes });
    expect(state.attempts[0]).toMatchObject({ status: "completed", estimatedActualMicros: 200 });
    expect(state.month).toMatchObject({ spentMicros: 200, reservedMicros: 0 });
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, request] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("https://api.openai.com/v1/chat/completions");
    const body = JSON.parse(request!.body as string);
    expect(body).toMatchObject({ model: route.model, max_completion_tokens: 4000, stream: false, response_format: { type: "json_schema", json_schema: { strict: true } } });
    expect(JSON.stringify(body)).toContain(article.content);
    expect(JSON.stringify(body)).toContain(state.plans[0].input.pins.profileRevisionId);
    expect(state.attempts[0].usageReceipt).not.toContain(credentials.key);
  });

  it("selects the first reviewed route with its actual credential before any reservation", async () => {
    const { t, user, postId, attemptId } = await setup();
    await t.mutation(api.visualTextConfig.registerReviewedTextRoute, route);
    await t.mutation(api.visualTextConfig.registerReviewedTextRoute, { ...route, provider: "cortex" });
    credentials.key = null; credentials.cortexKey = "fictional-cortex-key";
    vi.mocked(fetch).mockResolvedValue(response({ scenes }));
    expect(await user.query(api.visualTextConfig.getAvailability, { postId })).toMatchObject({ planning: true });
    expect(await user.action(api.visualTextActions.executeTextAttempt, { attemptId })).toMatchObject({ status: "completed" });
    expect(vi.mocked(fetch).mock.calls[0][0]).toBe("https://cortex.corvolabs.com/v1/chat/completions");
    expect(JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string)).toMatchObject({ max_tokens: 4000 });
  });

  it("keeps an approved route without its credential queued and never reserves", async () => {
    const { t, user, postId, attemptId } = await setup();
    await t.mutation(api.visualTextConfig.registerReviewedTextRoute, route);
    credentials.key = null;
    expect(await user.query(api.visualTextConfig.getAvailability, { postId })).toMatchObject({ planning: false, reflection: false });
    expect(await user.action(api.visualTextActions.executeTextAttempt, { attemptId })).toMatchObject({ status: "blocked", reason: "text-credential-unavailable" });
    const state = await user.query(api.visualWorkflow.get, { postId });
    expect(state.attempts[0].status).toBe("queued");
    expect(state.month?.reservedMicros ?? 0).toBe(0);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects unauthenticated and guessed other-author attempts before transport", async () => {
    const { t, attemptId } = await setup();
    await t.mutation(api.visualTextConfig.registerReviewedTextRoute, route);
    await expect(t.action(api.visualTextActions.executeTextAttempt, { attemptId })).rejects.toThrow("Unauthorized");
    await expect(t.withIdentity({ subject: "other-author" }).action(api.visualTextActions.executeTextAttempt, { attemptId })).rejects.toThrow();
    await expect(t.action(api.visualTextActions.executeQueuedReflection, { attemptId, userId: "author" })).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("retains an uncertain reservation and does not retry a failed transport", async () => {
    const { t, user, postId, attemptId } = await setup();
    await t.mutation(api.visualTextConfig.registerReviewedTextRoute, route);
    vi.mocked(fetch).mockRejectedValue(new Error("fictional provider error including a secret"));
    expect(await user.action(api.visualTextActions.executeTextAttempt, { attemptId })).toMatchObject({ status: "uncertain", reason: "text-transport-uncertain" });
    const state = await user.query(api.visualWorkflow.get, { postId });
    expect(state.attempts[0].status).toBe("uncertain");
    expect(state.month?.reservedMicros).toBe(29_000);
    expect(await user.action(api.visualTextActions.executeTextAttempt, { attemptId })).toMatchObject({ status: "blocked", reason: "reconciliation-required" });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(state.attempts[0])).not.toContain("including a secret");
  });

  it("persists a schema-shaped short plan as inspectable incomplete output", async () => {
    const { t, user, postId, attemptId } = await setup();
    await t.mutation(api.visualTextConfig.registerReviewedTextRoute, route);
    vi.mocked(fetch).mockResolvedValue(response({ scenes: scenes.slice(0, 2) }));
    const result = await user.action(api.visualTextActions.executeTextAttempt, { attemptId });
    expect(result.planId).not.toBeNull();
    const state = await user.query(api.visualWorkflow.get, { postId });
    expect(state.plans[0]).toMatchObject({ status: "incomplete", scenes: scenes.slice(0, 2) });
    expect(state.plans[0].reasons.length).toBeGreaterThan(0);
    expect(state.month?.reservedMicros).toBe(0);
  });

  it("runs the newly approved reflection through its trusted scheduled action and persists untested scoped lessons", async () => {
    const { t, user, postId, attemptId } = await setup();
    await t.mutation(api.visualTextConfig.registerReviewedTextRoute, route);
    vi.mocked(fetch).mockResolvedValueOnce(response({ scenes }));
    const planned = await user.action(api.visualTextActions.executeTextAttempt, { attemptId });
    const exported = await t.run(async ctx => {
      const attempt = (await ctx.db.get(attemptId))!;
      const input = { ...attempt.input, planId: planned.planId, scene: scenes[0], provider: "openai", model: "gpt-image-2", prompt: "Preserve the raven inspecting a broken gear." };
      const bytes = "fictional-image-only", hash = createHash("sha256").update(bytes).digest("hex");
      const storageId = await ctx.storage.store(new Blob([bytes], { type: "image/png" }));
      const base = { userId: "author", brandId: "corvo" as const, postId, attemptId, planId: planned.planId!, input, storageId, sha256: hash, contentType: "image/png", width: 1536, height: 1024, bytes: bytes.length, provider: "openai", model: "gpt-image-2", createdAt: 1 };
      const originalId = await ctx.db.insert("v2VisualVersions", { ...base, parentVersionId: null, feedback: null });
      const exportStorageId = await ctx.storage.store(new Blob([bytes], { type: "image/webp" }));
      const exportMetadata = { width: 1600, height: 900, bytes: bytes.length, format: "webp" as const, crop: "center" };
      const versionId = await ctx.db.insert("v2VisualVersions", { ...base, parentVersionId: originalId, feedback: "Keep the claw touching the gear.", input: { ...input, parentVersionId: originalId, parentStorageId: storageId, feedback: "Keep the claw touching the gear." }, exportStorageId, exportHash: hash, exportMetadata });
      const state = (await ctx.db.query("v2VisualStates").withIndex("by_post", q => q.eq("postId", postId)).unique())!;
      await ctx.db.patch(state._id, { selectedPlanId: planned.planId!, selectedSceneIndex: 0, selectedVersionId: versionId });
      return { versionId, hash, exportMetadata };
    });
    const output = { candidatePrompt: "Keep the raven's claw touching the damaged gear while preserving the original workshop scene.", lessons: [{ title: "Gear contact", instruction: "For this saved post, maintain visible claw contact with the gear.", role: "image_generator", sceneTags: [], modelSpecific: false, postSpecific: true }], profileChangeProposals: [] };
    vi.mocked(fetch).mockResolvedValueOnce(response(output));
    vi.useFakeTimers();
    try {
      const args = { postId, versionId: exported.versionId, alt: "A fictional raven inspects a broken gear.", expectedExportHash: exported.hash, expectedExportMetadataSignature: stableInputSignature(exported.exportMetadata), expectedArticleSignature: articleSignature(article) };
      await user.mutation(api.visualWorkflow.approveHero, args);
      await t.finishAllScheduledFunctions(() => vi.runAllTimers());
      const state = await user.query(api.visualWorkflow.get, { postId });
      expect(state.reflections[0]).toMatchObject({ candidatePrompt: output.candidatePrompt, validationStatus: "untested" });
      expect(state.reflections[0].lessonIds).toHaveLength(1);
      expect(state.attempts.find((attempt: { stage: string }) => attempt.stage === "reflection").status).toBe("completed");
      expect(fetch).toHaveBeenCalledTimes(2);
      const body = JSON.parse(vi.mocked(fetch).mock.calls[1][1]!.body as string);
      expect(JSON.stringify(body)).toContain("Keep the claw touching the gear.");
      expect(JSON.stringify(body)).toContain(exported.hash);
      await user.mutation(api.visualWorkflow.approveHero, args);
      await t.finishAllScheduledFunctions(() => vi.runAllTimers());
      expect(fetch).toHaveBeenCalledTimes(2);
    } finally { vi.useRealTimers(); }
  });
});
