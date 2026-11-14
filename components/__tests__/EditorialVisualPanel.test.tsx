import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAction, useMutation, useQuery } from "convex/react";
import { EditorialVisualPanel } from "@/components/EditorialVisualPanel";
import { stableInputSignature } from "@/lib/visualWorkflow";

vi.mock("convex/react", () => ({ useQuery: vi.fn(), useMutation: vi.fn(), useAction: vi.fn() }));
vi.mock("@/convex/_generated/api", () => ({ api: {
  visualWorkflow: Object.fromEntries(["get", "requestPlan", "selectScene", "requestGeneration", "requestEdit", "selectVersion", "approveHero", "confirmRelevance", "setMonthlyBudget", "cancelQueuedAttempt"].map((name) => [name, `workflow:${name}`])),
  visualProfiles: Object.fromEntries(["getProfile", "saveRevision", "uploadReference", "getSeedStatus", "resolveForPost", "setPostException", "applyCorvoArticle7Exception"].map((name) => [name, `profiles:${name}`])),
  visualExports: { prepareHero: "exports:prepareHero" },
  visualProviderConfig: { getAvailability: "providers:getAvailability" },
  visualProviderActions: { executeImageAttempt: "providers:executeImageAttempt" },
  visualTextConfig: { getAvailability: "text:getAvailability" },
  visualTextActions: { executeTextAttempt: "text:executeTextAttempt" },
} }));

const scenes = [
  { title: "Workshop", subject: "Raven mechanic", metaphor: "Controlled testing", action: "Adjusts the wheel", reveal: "The hidden bend appears", articleConnection: "Tests reveal hidden limits", articleAnchor: "Test the actual work" },
  { title: "Bridge", subject: "Navigator", metaphor: "A safe crossing", action: "Lowers the bridge", reveal: "The far bank becomes visible", articleConnection: "Evidence connects decisions", articleAnchor: "Find the necessary evidence" },
  { title: "Garden", subject: "Gardener", metaphor: "Careful pruning", action: "Prunes a tangled branch", reveal: "A bud receives daylight", articleConnection: "Constraints create clarity", articleAnchor: "Keep the constraints visible" },
];
const planFixture = { _id: "plan-1", status: "complete", scenes, reasons: [], input: { article: { signature: "article-current" } } };
const versionFixture = { _id: "hero-v2", parentVersionId: "hero-v1", provider: "offline-fixture", model: "offline-fixture", feedback: "Shorten the handle", width: 1536, height: 1024, input: { prompt: "Pinned workshop prompt" },
  url: "https://storage.example/master-v2", exportUrl: null, exportHash: undefined };
const emptyWorkflow = { articleSignature: "article-current", state: null, attempts: [], plans: [], versions: [], reflections: [],
  budget: { limitMicros: 20_000_000 }, month: { spentMicros: 1_000_000, reservedMicros: 2_000_000 } };
const profileFixture = { revision: { _id: "profile-v1", revision: 1,
  artDirection: "Layered matte paper", palette: [{ name: "Teal", color: "#2E5B60" }],
  mascotGuidance: "Approved raven identity", compositionGuidance: "Show the action",
  textPolicy: "Only necessary specified strings", heroChartPolicy: "Illustrative graphics",
  referenceBindings: [{ referenceId: "raven", role: "identity" }, { referenceId: "paper", role: "style" }],
  defaultRoute: { provider: "offline-fixture", model: "offline-fixture", qualification: "unqualified" },
}, references: [{ _id: "raven", fileName: "raven.png" }, { _id: "paper", fileName: "paper.png" }] };
let workflow: unknown;
let profile: unknown;
let seedStatus: unknown;
let resolvedPost: unknown;
let routeAvailability: unknown;
let textAvailability: unknown;
const calls: Record<string, ReturnType<typeof vi.fn>> = {};
function fixtureEnvironment() {
  vi.stubEnv("NODE_ENV", "development"); vi.stubEnv("NEXT_PUBLIC_E2E_BYPASS_AUTH", "1");
  vi.stubEnv("NEXT_PUBLIC_CONVEX_URL", "http://127.0.0.1:3210"); vi.stubEnv("NEXT_PUBLIC_VISUAL_FIXTURE_TOKEN_URL", "http://127.0.0.1:3969/token");
  vi.stubEnv("NEXT_PUBLIC_VERCEL_ENV", ""); vi.stubEnv("VERCEL", "");
}

describe("EditorialVisualPanel", () => {
  it("disables version selection while image dispatch is pending and permits it after completion", () => {
    workflow = { ...emptyWorkflow, state: { selectedVersionId: "hero-v2" }, versions: [versionFixture], attempts: [{ _id: "pending-image", stage: "generation", status: "queued" }] };
    const view = render(<EditorialVisualPanel postId="post-1" brandId="corvo" />);
    expect(screen.getByRole("button", { name: "Select version 1" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Select version 1" }));
    expect(calls.selectVersion).not.toHaveBeenCalled();
    workflow = { ...emptyWorkflow, state: { selectedVersionId: "hero-v2" }, versions: [versionFixture], attempts: [{ _id: "pending-image", stage: "generation", status: "completed" }] };
    view.rerender(<EditorialVisualPanel postId="post-1" brandId="corvo" />);
    expect(screen.getByRole("button", { name: "Select version 1" })).toBeEnabled();
  });

  beforeEach(() => {
    fixtureEnvironment();
    vi.clearAllMocks();
    routeAvailability = { imageRoutes: [], reason: "Qualification pending" };
    textAvailability = { planning: false, reflection: false, reason: "No approved text route" };
    workflow = emptyWorkflow; profile = profileFixture; resolvedPost = { postExceptionId: null, postException: null, approvedSeedException: false }; seedStatus = { imported: false, assets: [{ referenceId: "verified-1" }, { referenceId: null }], oneShotValidation: "not_tested", historicalModelId: null };
    for (const name of ["requestPlan", "selectScene", "requestGeneration", "requestEdit", "selectVersion", "approveHero", "confirmRelevance", "setMonthlyBudget", "cancelQueuedAttempt", "saveRevision", "uploadReference", "prepareHero", "setPostException", "applyCorvoArticle7Exception", "executeImageAttempt", "executeTextAttempt"]) {
      calls[name] = vi.fn().mockResolvedValue(null);
    }
    vi.mocked(useQuery).mockImplementation(((reference: unknown, args: unknown) => args === "skip" ? undefined : reference === "text:getAvailability" ? textAvailability : reference === "providers:getAvailability" ? routeAvailability : reference === "workflow:get" ? workflow : reference === "profiles:getSeedStatus" ? seedStatus : reference === "profiles:resolveForPost" ? resolvedPost : profile) as never);
    vi.mocked(useMutation).mockImplementation(((reference: unknown) => calls[String(reference).split(":")[1]]) as never);
    vi.mocked(useAction).mockImplementation(((reference: unknown) => calls[String(reference).split(":")[1]]) as never);
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });
  it("shows a neutral brand default while qualified availability enables planning and generation", () => {
    vi.stubEnv("NODE_ENV", "production");
    workflow = { ...emptyWorkflow, plans: [planFixture], state: { selectedPlanId: "plan-1", selectedSceneIndex: 0 } };
    profile = { ...profileFixture, revision: { ...profileFixture.revision, defaultRoute: { provider: "openai", model: "gpt-image-2", qualification: "unqualified" } } };
    textAvailability = { planning: true, reflection: true, reason: null };
    routeAvailability = { imageRoutes: [{ provider: "openai", model: "gpt-image-2", apiModelId: "gpt-image-2-2026-04-21", quality: "medium", size: "1536x1024", outputFormat: "png", generation: true, edit: true }], reason: null };
    render(<EditorialVisualPanel postId="post-1" brandId="corvo" />);
    expect(screen.getByText("Brand default: openai · gpt-image-2.")).toHaveClass("text-gray-600");
    expect(screen.queryByText(/Qualification: unqualified/)).not.toBeInTheDocument();
    expect(screen.getByText("Generation route: openai · gpt-image-2-2026-04-21.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Plan visuals" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Generate this concept" })).toBeEnabled();
    expect(calls.executeTextAttempt).not.toHaveBeenCalled();
    expect(calls.executeImageAttempt).not.toHaveBeenCalled();
  });

  it("dispatches a saved scene plan through the approved text action without generating an image", async () => {
    vi.stubEnv("NODE_ENV", "production");
    textAvailability = { planning: true, reflection: false, reason: null };
    calls.requestPlan.mockResolvedValue("attempt-text-plan");
    calls.executeTextAttempt.mockResolvedValue({ status: "completed", planId: "planned-scenes", reflectionId: null, reason: null });
    render(<EditorialVisualPanel postId="post-1" brandId="corvo" />);
    const plan = screen.getByRole("button", { name: "Plan visuals" });
    expect(plan).toBeEnabled();
    fireEvent.click(plan); fireEvent.click(plan);
    await waitFor(() => expect(calls.executeTextAttempt).toHaveBeenCalledExactlyOnceWith({ attemptId: "attempt-text-plan" }));
    expect(calls.requestPlan).toHaveBeenCalledTimes(1);
    expect(calls.requestGeneration).not.toHaveBeenCalled();
    expect(calls.executeImageAttempt).not.toHaveBeenCalled();
    expect(screen.queryByText(/Local offline rehearsal only/)).not.toBeInTheDocument();
  });

  it("dispatches the queued generation through the qualified server route after one explicit click", async () => {
    vi.stubEnv("NODE_ENV", "production");
    workflow = { ...emptyWorkflow, plans: [planFixture], state: { selectedPlanId: "plan-1", selectedSceneIndex: 0 } };
    profile = { ...profileFixture, revision: { ...profileFixture.revision, defaultRoute: { provider: "digitalocean", model: "gpt-image-2", qualification: "unqualified" } } };
    routeAvailability = { imageRoutes: [{ provider: "openai", model: "gpt-image-2", apiModelId: "gpt-image-2-2026-04-21", quality: "low", size: "1536x1024", outputFormat: "webp", generation: true, edit: true }], reason: null };
    calls.requestGeneration.mockResolvedValue("attempt-real-route");
    calls.executeImageAttempt.mockResolvedValue({ status: "completed", versionId: "hero-real-route", reason: null });
    render(<EditorialVisualPanel postId="post-1" brandId="corvo" />);
    expect(calls.executeImageAttempt).not.toHaveBeenCalled();
    const generate = screen.getByRole("button", { name: "Generate this concept" });
    expect(generate).toBeEnabled();
    fireEvent.click(generate); fireEvent.click(generate);
    await waitFor(() => expect(calls.executeImageAttempt).toHaveBeenCalledWith({ attemptId: "attempt-real-route" }));
    expect(calls.requestGeneration).toHaveBeenCalledTimes(1);
    expect(calls.requestGeneration.mock.calls[0][0]).toMatchObject({ postId: "post-1", providerOverride: "openai", quality: "low", expectedArticleSignature: "article-current", expectedPlanId: "plan-1" });
    expect(calls.executeImageAttempt).toHaveBeenCalledTimes(1);
  });
  it("blocks unqualified and missing production routes while keeping saved asset review usable", () => {
    workflow = { ...emptyWorkflow, plans: [planFixture], state: { selectedPlanId: "plan-1", selectedSceneIndex: 0, selectedVersionId: "hero-v2" }, versions: [versionFixture] };
    const variants = [
      { env: "NODE_ENV", value: "production" }, { env: "NEXT_PUBLIC_E2E_BYPASS_AUTH", value: "0" },
      { env: "NEXT_PUBLIC_CONVEX_URL", value: "https://remote.convex.cloud" }, { env: "NEXT_PUBLIC_VISUAL_FIXTURE_TOKEN_URL", value: "http://127.0.0.1:3968/token" },
      { env: "NEXT_PUBLIC_VERCEL_ENV", value: "preview" }, { route: null },
      { route: { provider: "digitalocean", model: "gpt-image-2", qualification: "unqualified" } },
    ];
    for (const variant of variants) {
      fixtureEnvironment(); profile = profileFixture;
      if ("env" in variant) vi.stubEnv(variant.env, variant.value);
      else profile = { ...profileFixture, revision: { ...profileFixture.revision, defaultRoute: variant.route } };
      const view = render(<EditorialVisualPanel postId="post-1" brandId="corvo" />);
      fireEvent.change(screen.getByLabelText("Edit feedback"), { target: { value: "Change only this fixture grip." } });
      for (const name of ["Plan visuals", "Generate this concept", "Edit selected version"]) expect(screen.getByRole("button", { name })).toBeDisabled();
      expect(screen.getByText(/Image actions are on hold: no provider route is qualified with a dependable cost bound/)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Prepare final hero crop" })).toBeEnabled();
      expect(screen.getByRole("button", { name: "Select version 1" })).toBeEnabled();
      view.unmount();
    }
    for (const name of ["requestPlan", "requestGeneration", "requestEdit"]) expect(calls[name]).not.toHaveBeenCalled();
  });
  it("requires an edit route matching the selected parent's saved quality", () => {
    vi.stubEnv("NODE_ENV", "production");
    workflow = { ...emptyWorkflow, plans: [planFixture], state: { selectedPlanId: "plan-1", selectedSceneIndex: 0, selectedVersionId: "hero-v2" }, versions: [{ ...versionFixture, provider: "openai", model: "gpt-image-1-mini", input: { ...versionFixture.input, quality: "low" } }] };
    routeAvailability = { imageRoutes: [{ provider: "openai", model: "gpt-image-1-mini", apiModelId: "gpt-image-1-mini", quality: "high", size: "1536x1024", outputFormat: "webp", generation: true, edit: true }], reason: null };
    render(<EditorialVisualPanel postId="post-1" brandId="corvo" />);
    fireEvent.change(screen.getByLabelText("Edit feedback"), { target: { value: "Change only the handle." } });
    expect(screen.getByRole("button", { name: "Edit selected version" })).toBeDisabled();
    expect(calls.executeImageAttempt).not.toHaveBeenCalled();
  });
  it("pins the reviewed mini input fidelity with its low output quality", async () => {
    vi.stubEnv("NODE_ENV", "production");
    workflow = { ...emptyWorkflow, plans: [planFixture], state: { selectedPlanId: "plan-1", selectedSceneIndex: 0 } };
    profile = { ...profileFixture, revision: { ...profileFixture.revision, defaultRoute: { provider: "openai", model: "gpt-image-1-mini", qualification: "unqualified" } } };
    routeAvailability = { imageRoutes: [{ provider: "openai", model: "gpt-image-1-mini", apiModelId: "gpt-image-1-mini", quality: "low", inputFidelity: "high", size: "1536x1024", outputFormat: "webp", generation: true, edit: true }], reason: null };
    calls.requestGeneration.mockResolvedValue("attempt-mini-fidelity");
    calls.executeImageAttempt.mockResolvedValue({ status: "completed", versionId: "mini-result", reason: null });
    render(<EditorialVisualPanel postId="post-1" brandId="corvo" />);
    fireEvent.click(screen.getByRole("button", { name: "Generate this concept" }));
    await waitFor(() => expect(calls.requestGeneration).toHaveBeenCalledTimes(1));
    expect(calls.requestGeneration.mock.calls[0][0]).toMatchObject({ quality: "low", inputFidelity: "high" });
  });
  it.each(["gpt-image-1-mini", "gpt-image-1"])("executes an edit of the selected %s parent without switching to the brand's Image 2 default", async model => {
    vi.stubEnv("NODE_ENV", "production");
    workflow = { ...emptyWorkflow, plans: [planFixture], state: { selectedPlanId: "plan-1", selectedSceneIndex: 0, selectedVersionId: "hero-v2" }, versions: [{ ...versionFixture, provider: "openai", model, input: { ...versionFixture.input, quality: "low", inputFidelity: "low" } }] };
    profile = { ...profileFixture, revision: { ...profileFixture.revision, defaultRoute: { provider: "digitalocean", model: "gpt-image-2", qualification: "unqualified" } } };
    routeAvailability = { imageRoutes: [{ provider: "openai", model, apiModelId: model, quality: "low", inputFidelity: "low", size: "1536x1024", outputFormat: "webp", generation: true, edit: true }], reason: null };
    calls.requestEdit.mockResolvedValue("attempt-mini-edit");
    calls.executeImageAttempt.mockResolvedValue({ status: "completed", versionId: "mini-child", reason: null });
    render(<EditorialVisualPanel postId="post-1" brandId="corvo" />);
    fireEvent.change(screen.getByLabelText("Edit feedback"), { target: { value: "Change only the handle." } });
    const edit = screen.getByRole("button", { name: "Edit selected version" });
    expect(edit).toBeEnabled();
    fireEvent.click(edit); fireEvent.click(edit);
    await waitFor(() => expect(calls.executeImageAttempt).toHaveBeenCalledExactlyOnceWith({ attemptId: "attempt-mini-edit" }));
    expect(calls.requestEdit).toHaveBeenCalledTimes(1);
    expect(calls.requestEdit.mock.calls[0][0]).toMatchObject({ expectedParentVersionId: "hero-v2", expectedPlanId: "plan-1", feedback: "Change only the handle." });
    expect(calls.requestEdit.mock.calls[0][0]).not.toHaveProperty("modelOverride");
  });
  it("does not retry a lost generation action response after its attempt was accepted", async () => {
    vi.stubEnv("NODE_ENV", "production");
    workflow = { ...emptyWorkflow, plans: [planFixture], state: { selectedPlanId: "plan-1", selectedSceneIndex: 0 } };
    profile = { ...profileFixture, revision: { ...profileFixture.revision, defaultRoute: { provider: "openai", model: "gpt-image-1-mini", qualification: "unqualified" } } };
    routeAvailability = { imageRoutes: [{ provider: "openai", model: "gpt-image-1-mini", apiModelId: "gpt-image-1-mini", quality: "low", size: "1536x1024", outputFormat: "webp", generation: true, edit: true }], reason: null };
    calls.requestGeneration.mockResolvedValue("attempt-uncertain");
    calls.executeImageAttempt.mockRejectedValue(new Error("connection lost"));
    render(<EditorialVisualPanel postId="post-1" brandId="corvo" />);
    const generate = screen.getByRole("button", { name: "Generate this concept" });
    fireEvent.click(generate);
    await screen.findByRole("alert");
    expect(generate).toBeDisabled();
    fireEvent.click(generate);
    expect(calls.requestGeneration).toHaveBeenCalledTimes(1);
    expect(calls.executeImageAttempt).toHaveBeenCalledTimes(1);
  });
  it("allows only exact fixture image overrides and keeps real provider selections pending qualification", () => {
    workflow = { ...emptyWorkflow, plans: [planFixture], state: { selectedPlanId: "plan-1", selectedSceneIndex: 0, selectedVersionId: "hero-v2" }, versions: [versionFixture] };
    render(<EditorialVisualPanel postId="post-1" brandId="corvo" />);
    fireEvent.change(screen.getByLabelText("Edit feedback"), { target: { value: "Change only the grip." } });
    expect(screen.getByRole("button", { name: "Generate this concept" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Edit selected version" })).toBeEnabled();
    for (const [label, value] of [["Model override", "gpt-image-2"], ["Provider override", "openai"]]) {
      fireEvent.change(screen.getByLabelText(label), { target: { value } });
      expect(screen.getByRole("button", { name: "Generate this concept" })).toBeDisabled();
      expect(screen.getByRole("button", { name: "Edit selected version" })).toBeDisabled();
      fireEvent.change(screen.getByLabelText(label), { target: { value: "" } });
    }
    for (const name of ["requestGeneration", "requestEdit"]) expect(calls[name]).not.toHaveBeenCalled();
  });

  it("plans only after an explicit click and queues the saved post with an operation key", async () => {
    render(<EditorialVisualPanel postId="post-1" brandId="corvo" />);
    expect(calls.requestPlan).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Plan visuals" }));
    await waitFor(() => expect(calls.requestPlan).toHaveBeenCalledWith({ postId: "post-1", operationKey: expect.any(String) }));
    expect(calls.requestPlan.mock.calls[0][0].operationKey).toMatch(/^[a-f\d-]{36}$/i);
  });
  it("blocks duplicate clicks, pending work on reload and unsaved article edits", async () => {
    calls.requestPlan.mockImplementation(() => new Promise(() => {}));
    const view = render(<EditorialVisualPanel postId="post-1" brandId="corvo" />);
    fireEvent.click(screen.getByRole("button", { name: "Plan visuals" }));
    fireEvent.click(screen.getByRole("button", { name: "Plan visuals" }));
    expect(calls.requestPlan).toHaveBeenCalledTimes(1);
    view.unmount();
    workflow = { ...emptyWorkflow, attempts: [{ _id: "attempt-1", stage: "planning", status: "queued", pauseReason: "planning-route-unqualified" }] };
    const pending = render(<EditorialVisualPanel postId="post-1" brandId="corvo" />);
    expect(screen.getByRole("button", { name: "Plan visuals" })).toBeDisabled();
    pending.unmount();
    workflow = emptyWorkflow;
    render(<EditorialVisualPanel postId="post-1" brandId="corvo" savedContentChanged />);
    expect(screen.getByRole("button", { name: "Plan visuals" })).toBeDisabled();
    expect(screen.getByText(/Save article changes before requesting visuals/)).toBeInTheDocument();
  });
  it("reuses the operation key after a rejected save and waits for durable state after success", async () => {
    calls.requestPlan.mockRejectedValueOnce(new Error("transport lost")).mockResolvedValueOnce("attempt-1");
    render(<EditorialVisualPanel postId="post-1" brandId="corvo" />);
    fireEvent.click(screen.getByRole("button", { name: "Plan visuals" }));
    await screen.findByRole("alert");
    fireEvent.click(screen.getByRole("button", { name: "Plan visuals" }));
    await waitFor(() => expect(calls.requestPlan).toHaveBeenCalledTimes(2));
    expect(calls.requestPlan.mock.calls[1][0].operationKey).toBe(calls.requestPlan.mock.calls[0][0].operationKey);
    await waitFor(() => expect(screen.getByRole("button", { name: "Plan visuals" })).toBeDisabled());
  });
  it("shows three complete scene cards and persists a selection without generating", async () => {
    workflow = { ...emptyWorkflow, plans: [planFixture] };
    const view = render(<EditorialVisualPanel postId="post-1" brandId="corvo" />);
    const cards = screen.getAllByRole("article", { name: /Scene \d/ });
    expect(cards).toHaveLength(3);
    for (const [index, card] of cards.entries()) for (const text of Object.values(scenes[index])) expect(within(card).getByText(text)).toBeInTheDocument();
    fireEvent.click(within(cards[1]).getByRole("button", { name: "Select scene" }));
    await waitFor(() => expect(calls.selectScene).toHaveBeenCalledWith({ planId: "plan-1", sceneIndex: 1 }));
    expect(calls.requestGeneration).not.toHaveBeenCalled();
    workflow = { ...emptyWorkflow, plans: [{ ...planFixture, status: "incomplete", scenes: scenes.slice(0, 2), reasons: ["Exactly three scenes are required"] }] };
    view.rerender(<EditorialVisualPanel postId="post-1" brandId="corvo" />);
    expect(screen.queryAllByRole("article", { name: /Scene \d/ })).toHaveLength(0);
    expect(screen.getByText("Exactly three scenes are required")).toBeInTheDocument();
  });
  it("saves a full scene refinement before an explicit generation with distinct inspector fields", async () => {
    workflow = { ...emptyWorkflow, plans: [planFixture], state: { selectedPlanId: "plan-1", selectedSceneIndex: 0 } };
    const view = render(<EditorialVisualPanel postId="post-1" brandId="corvo" />);
    fireEvent.change(screen.getByLabelText("Refine visible action"), { target: { value: "Shortens the wheel grip" } });
    expect(screen.getByRole("button", { name: "Generate this concept" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Save scene refinement" }));
    const refinedScene = { ...scenes[0], action: "Shortens the wheel grip" };
    await waitFor(() => expect(calls.selectScene).toHaveBeenCalledWith({ planId: "plan-1", sceneIndex: 0, refinedScene }));
    expect(calls.requestGeneration).not.toHaveBeenCalled();
    workflow = { ...emptyWorkflow, plans: [planFixture], state: { selectedPlanId: "plan-1", selectedSceneIndex: 0, refinedScene } };
    view.rerender(<EditorialVisualPanel postId="post-1" brandId="corvo" />);
    fireEvent.change(screen.getByLabelText("Additional production instructions"), { target: { value: "Keep the background neutral." } });
    fireEvent.change(screen.getByLabelText("Model override"), { target: { value: "offline-fixture" } });
    fireEvent.change(screen.getByLabelText("Provider override"), { target: { value: "offline-fixture" } });
    fireEvent.click(screen.getByRole("button", { name: "Generate this concept" }));
    await waitFor(() => expect(calls.requestGeneration).toHaveBeenCalledWith({ postId: "post-1", operationKey: expect.any(String), expectedArticleSignature: "article-current", expectedPlanId: "plan-1", expectedSceneIndex: 0, expectedRefinedSceneSignature: stableInputSignature(refinedScene), prompt: "Keep the background neutral.", modelOverride: "offline-fixture", providerOverride: "offline-fixture" }));
  });
  it("waits for the saved scene selection before generation can use it", async () => {
    const base = { ...emptyWorkflow, plans: [planFixture], state: { selectedPlanId: "plan-1", selectedSceneIndex: 0 } };
    workflow = base;
    const view = render(<EditorialVisualPanel postId="post-1" brandId="corvo" />);
    fireEvent.click(within(screen.getByRole("article", { name: "Scene 2" })).getByRole("button", { name: "Select scene" }));
    await waitFor(() => expect(calls.selectScene).toHaveBeenCalledWith({ planId: "plan-1", sceneIndex: 1 }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Plan visuals" })).toBeEnabled());
    expect(screen.getByRole("button", { name: "Generate this concept" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Generate this concept" }));
    expect(calls.requestGeneration).not.toHaveBeenCalled();
    workflow = { ...base, state: { ...base.state, selectedSceneIndex: 1 } };
    view.rerender(<EditorialVisualPanel postId="post-1" brandId="corvo" />);
    expect(screen.getByText("Selected concept: Bridge")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Generate this concept" })).toBeEnabled();
  });
  it("releases an unconfirmed superseded scene selection after ten seconds without retrying", async () => {
    vi.useFakeTimers();
    const base = { ...emptyWorkflow, plans: [planFixture], state: { selectedPlanId: "plan-1", selectedSceneIndex: 0 } };
    workflow = base;
    const view = render(<EditorialVisualPanel postId="post-1" brandId="corvo" />);
    fireEvent.change(screen.getByLabelText("Art direction"), { target: { value: "My unsaved profile direction." } });
    await act(async () => {
      fireEvent.click(within(screen.getByRole("article", { name: "Scene 2" })).getByRole("button", { name: "Select scene" }));
    });
    expect(calls.selectScene).toHaveBeenCalledWith({ planId: "plan-1", sceneIndex: 1 });
    // This subscriber never renders the target: a second session has already selected scene 3.
    workflow = { ...base, state: { ...base.state, selectedSceneIndex: 2 } };
    view.rerender(<EditorialVisualPanel postId="post-1" brandId="corvo" />);
    expect(screen.getByText("Selected concept: Garden")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Generate this concept" })).toBeDisabled();
    await act(async () => { vi.advanceTimersByTime(9999); });
    expect(screen.getByRole("button", { name: "Generate this concept" })).toBeDisabled();
    await act(async () => { vi.advanceTimersByTime(1); });
    expect(screen.getByRole("alert")).toHaveTextContent(/Scene selection was not confirmed within 10 seconds.*Reload and inspect the current saved selection.*No action was retried/);
    expect(within(screen.getByRole("article", { name: "Scene 1" })).getByRole("button", { name: "Select scene" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Generate this concept" })).toBeEnabled();
    expect(screen.getByLabelText("Art direction")).toHaveValue("My unsaved profile direction.");
    expect(calls.selectScene).toHaveBeenCalledTimes(1);
    expect(calls.requestGeneration).not.toHaveBeenCalled();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Generate this concept" })); });
    expect(calls.requestGeneration).toHaveBeenCalledWith({ postId: "post-1", operationKey: expect.any(String), expectedArticleSignature: "article-current", expectedPlanId: "plan-1", expectedSceneIndex: 2, expectedRefinedSceneSignature: stableInputSignature(null) });
  });
  it("clears a scene selection marker after readback so a later plan remains selectable", async () => {
    const base = { ...emptyWorkflow, plans: [planFixture], state: { selectedPlanId: "plan-1", selectedSceneIndex: 0 } };
    workflow = base;
    const view = render(<EditorialVisualPanel postId="post-1" brandId="corvo" />);
    fireEvent.click(within(screen.getByRole("article", { name: "Scene 2" })).getByRole("button", { name: "Select scene" }));
    await waitFor(() => expect(calls.selectScene).toHaveBeenCalled());
    workflow = { ...base, state: { ...base.state, selectedSceneIndex: 1 } };
    view.rerender(<EditorialVisualPanel postId="post-1" brandId="corvo" />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Generate this concept" })).toBeEnabled());
    workflow = { ...emptyWorkflow, plans: [{ ...planFixture, _id: "plan-2" }] };
    view.rerender(<EditorialVisualPanel postId="post-1" brandId="corvo" />);
    expect(within(screen.getByRole("article", { name: "Scene 1" })).getByRole("button", { name: "Select scene" })).toBeEnabled();
    fireEvent.click(within(screen.getByRole("article", { name: "Scene 1" })).getByRole("button", { name: "Select scene" }));
    await waitFor(() => expect(calls.selectScene).toHaveBeenLastCalledWith({ planId: "plan-2", sceneIndex: 0 }));
  });
  it("clears local requests and review drafts when the composer switches to another saved post", async () => {
    workflow = { ...emptyWorkflow, plans: [planFixture], state: { selectedPlanId: "plan-1", selectedSceneIndex: 0, selectedVersionId: "hero-v2" }, versions: [versionFixture] };
    calls.requestPlan.mockRejectedValueOnce(new Error("rejected"));
    const view = render(<EditorialVisualPanel postId="post-1" brandId="corvo" />);
    for (const label of ["Additional production instructions", "Model override", "Provider override", "Edit feedback", "Monthly visual budget in USD (brand owner)"]) fireEvent.change(screen.getByLabelText(label), { target: { value: "Post one draft" } });
    fireEvent.click(screen.getByRole("button", { name: "Plan visuals" }));
    await screen.findByRole("alert");
    view.rerender(<EditorialVisualPanel postId="post-2" brandId="corvo" />);
    for (const label of ["Additional production instructions", "Model override", "Provider override", "Edit feedback", "Monthly visual budget in USD (brand owner)"]) expect(screen.getByLabelText(label)).toHaveValue("");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Plan visuals" }));
    await waitFor(() => expect(calls.requestPlan).toHaveBeenCalledTimes(2));
    expect(calls.requestPlan.mock.calls[1][0].postId).toBe("post-2");
    expect(calls.requestPlan.mock.calls[1][0].operationKey).not.toBe(calls.requestPlan.mock.calls[0][0].operationKey);
  });
  it("persists version selection and explicitly edits the selected parent without inventing a route switch", async () => {
    const base = { ...emptyWorkflow, plans: [planFixture], state: { selectedPlanId: "plan-1", selectedSceneIndex: 0, selectedVersionId: "hero-v2" },
      versions: [versionFixture, { ...versionFixture, _id: "hero-v1", parentVersionId: null, feedback: null, url: "https://storage.example/master-v1" }] };
    workflow = base;
    const view = render(<EditorialVisualPanel postId="post-1" brandId="corvo" />);
    expect(screen.getByRole("img", { name: "Selected hero version" })).toHaveAttribute("src", versionFixture.url);
    fireEvent.click(screen.getByRole("button", { name: "Select version 1" }));
    await waitFor(() => expect(calls.selectVersion).toHaveBeenCalledWith({ postId: "post-1", versionId: "hero-v1" }));
    expect(calls.requestEdit).not.toHaveBeenCalled();
    workflow = { ...base, state: { ...base.state, selectedVersionId: "hero-v1" } };
    view.rerender(<EditorialVisualPanel postId="post-1" brandId="corvo" />);
    fireEvent.change(screen.getByLabelText("Edit feedback"), { target: { value: "Shorten only the copper handle." } });
    fireEvent.click(screen.getByRole("button", { name: "Edit selected version" }));
    await waitFor(() => expect(calls.requestEdit).toHaveBeenCalledWith({ postId: "post-1", operationKey: expect.any(String), expectedArticleSignature: "article-current", expectedPlanId: "plan-1", expectedSceneIndex: 0, expectedRefinedSceneSignature: stableInputSignature(null), expectedParentVersionId: "hero-v1", feedback: "Shorten only the copper handle." }));
    expect(screen.getByText(/Edit parent route: offline-fixture · offline-fixture/)).toBeInTheDocument();
  });
  it("releases an unconfirmed superseded version selection without retrying and pins the viewed edit parent", async () => {
    vi.useFakeTimers();
    const base = { ...emptyWorkflow, plans: [planFixture], state: { selectedPlanId: "plan-1", selectedSceneIndex: 0, selectedVersionId: "hero-v2" }, versions: [versionFixture, { ...versionFixture, _id: "hero-v1" }] };
    workflow = base;
    const view = render(<EditorialVisualPanel postId="post-1" brandId="corvo" />);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Select version 1" })); });
    expect(calls.selectVersion).toHaveBeenCalledWith({ postId: "post-1", versionId: "hero-v1" });
    // The selected target never renders; a new candidate is already the saved selection.
    workflow = { ...base, state: { ...base.state, selectedVersionId: "hero-v3" }, versions: [{ ...versionFixture, _id: "hero-v3", input: { prompt: "Current third-version prompt" } }, ...base.versions] };
    view.rerender(<EditorialVisualPanel postId="post-1" brandId="corvo" />);
    fireEvent.change(screen.getByLabelText("Edit feedback"), { target: { value: "Change only the third version grip." } });
    expect(screen.getByText("Current third-version prompt")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Prepare final hero crop" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Edit selected version" })).toBeDisabled();
    await act(async () => { vi.advanceTimersByTime(20000); });
    expect(screen.getByRole("alert")).toHaveTextContent(/Image version selection was not confirmed within 10 seconds.*Reload and inspect the current saved selection.*No action was retried/);
    expect(screen.getByRole("button", { name: "Prepare final hero crop" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Edit selected version" })).toBeEnabled();
    expect(calls.selectVersion).toHaveBeenCalledTimes(1);
    expect(calls.requestEdit).not.toHaveBeenCalled();
    expect(calls.prepareHero).not.toHaveBeenCalled();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Edit selected version" })); });
    expect(calls.requestEdit).toHaveBeenCalledWith({ postId: "post-1", operationKey: expect.any(String), expectedArticleSignature: "article-current", expectedPlanId: "plan-1", expectedSceneIndex: 0, expectedRefinedSceneSignature: stableInputSignature(null), expectedParentVersionId: "hero-v3", feedback: "Change only the third version grip." });
  });
  it("clears a version selection marker after readback before a server auto-selection", async () => {
    const base = { ...emptyWorkflow, state: { selectedVersionId: "hero-v2" }, versions: [versionFixture, { ...versionFixture, _id: "hero-v1" }] };
    workflow = base;
    const view = render(<EditorialVisualPanel postId="post-1" brandId="corvo" />);
    fireEvent.click(screen.getByRole("button", { name: "Select version 1" }));
    await waitFor(() => expect(calls.selectVersion).toHaveBeenCalled());
    workflow = { ...base, state: { selectedVersionId: "hero-v1" } };
    view.rerender(<EditorialVisualPanel postId="post-1" brandId="corvo" />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Prepare final hero crop" })).toBeEnabled());
    workflow = { ...base, state: { selectedVersionId: "hero-v2" } };
    view.rerender(<EditorialVisualPanel postId="post-1" brandId="corvo" />);
    expect(screen.getByRole("button", { name: "Prepare final hero crop" })).toBeEnabled();
  });
  it("shows the selected version's pinned prompt and sends explicit fixture model and provider overrides", async () => {
    workflow = { ...emptyWorkflow, plans: [planFixture], state: { selectedPlanId: "plan-1", selectedSceneIndex: 0, selectedVersionId: "hero-v2" }, versions: [versionFixture] };
    render(<EditorialVisualPanel postId="post-1" brandId="corvo" />);
    expect(screen.getByText("Pinned workshop prompt")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Model override"), { target: { value: "offline-fixture" } });
    fireEvent.change(screen.getByLabelText("Provider override"), { target: { value: "offline-fixture" } });
    fireEvent.change(screen.getByLabelText("Edit feedback"), { target: { value: "Change only the handle length." } });
    fireEvent.click(screen.getByRole("button", { name: "Edit selected version" }));
    await waitFor(() => expect(calls.requestEdit).toHaveBeenCalledWith({ postId: "post-1", operationKey: expect.any(String), expectedArticleSignature: "article-current", expectedPlanId: "plan-1", expectedSceneIndex: 0, expectedRefinedSceneSignature: stableInputSignature(null), expectedParentVersionId: "hero-v2", feedback: "Change only the handle length.", modelOverride: "offline-fixture", providerOverride: "offline-fixture" }));
    expect(calls.requestGeneration).not.toHaveBeenCalled();
  });
  it("pins the viewed article, refined scene and selected parent on generation and edit requests", async () => {
    const refinedScene = { ...scenes[1], action: "Tests the crossing before lowering it" };
    workflow = { ...emptyWorkflow, plans: [planFixture], state: { selectedPlanId: "plan-1", selectedSceneIndex: 1, refinedScene, selectedVersionId: "hero-v2" }, versions: [versionFixture] };
    render(<EditorialVisualPanel postId="post-1" brandId="corvo" />);
    const pins = { expectedArticleSignature: "article-current", expectedPlanId: "plan-1", expectedSceneIndex: 1, expectedRefinedSceneSignature: stableInputSignature(refinedScene) };
    fireEvent.click(screen.getByRole("button", { name: "Generate this concept" }));
    await waitFor(() => expect(calls.requestGeneration).toHaveBeenCalledWith({ postId: "post-1", operationKey: expect.any(String), ...pins }));
    fireEvent.change(screen.getByLabelText("Edit feedback"), { target: { value: "Change only the grip." } });
    fireEvent.click(screen.getByRole("button", { name: "Edit selected version" }));
    await waitFor(() => expect(calls.requestEdit).toHaveBeenCalledWith({ postId: "post-1", operationKey: expect.any(String), feedback: "Change only the grip.", ...pins, expectedParentVersionId: "hero-v2" }));
  });
  it("shows durable activity and budget, and cancels only work still queued", async () => {
    workflow = { ...emptyWorkflow, attempts: [
      { _id: "queued", stage: "generation", status: "queued" },
      { _id: "paused", stage: "planning", status: "queued", pauseReason: "planning-route-unqualified" },
      { _id: "running", stage: "edit", status: "running" },
      { _id: "failed", stage: "edit", status: "failed", error: "No output" },
      { _id: "uncertain", stage: "generation", status: "uncertain", error: "Reconcile first" },
    ] };
    render(<EditorialVisualPanel postId="post-1" brandId="corvo" />);
    expect(screen.getByText(/Spent \$1.00 · Reserved \$2.00 · Limit \$20.00/)).toBeInTheDocument();
    for (const label of ["Pending", "Paused", "Running", "Failed", "Uncertain"]) expect(screen.getByText(new RegExp(`· ${label}$`))).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Cancel queued request" })).toHaveLength(2);
    fireEvent.click(screen.getAllByRole("button", { name: "Cancel queued request" })[0]);
    await waitFor(() => expect(calls.cancelQueuedAttempt).toHaveBeenCalledWith({ attemptId: "queued" }));
    expect(calls.requestPlan).not.toHaveBeenCalled();
  });
  it("blocks every new request for an uncertain image outcome and offers no cancellation", () => {
    workflow = { ...emptyWorkflow, plans: [planFixture], state: { selectedPlanId: "plan-1", selectedSceneIndex: 0, selectedVersionId: "hero-v2" }, versions: [versionFixture], attempts: [{ _id: "uncertain", stage: "generation", status: "uncertain" }] };
    render(<EditorialVisualPanel postId="post-1" brandId="corvo" />);
    fireEvent.change(screen.getByLabelText("Edit feedback"), { target: { value: "Change the grip." } });
    for (const name of ["Plan visuals", "Generate this concept", "Edit selected version"]) expect(screen.getByRole("button", { name })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Cancel queued request" })).not.toBeInTheDocument();
    expect(screen.getByText(/Reconciliation is required before another request/)).toBeInTheDocument();
    for (const name of ["requestPlan", "requestGeneration", "requestEdit", "cancelQueuedAttempt"]) expect(calls[name]).not.toHaveBeenCalled();
  });
  it("keeps hero approval disabled when export preparation rejects", async () => {
    workflow = { ...emptyWorkflow, state: { selectedVersionId: "hero-v2" }, versions: [versionFixture] };
    calls.prepareHero.mockRejectedValue(new Error("decoder rejected"));
    render(<EditorialVisualPanel postId="post-1" brandId="corvo" />);
    fireEvent.click(screen.getByRole("button", { name: "Prepare final hero crop" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("decoder rejected");
    expect(screen.getByRole("button", { name: "Approve hero" })).toBeDisabled();
    expect(screen.queryByRole("img", { name: "Final hero crop preview" })).not.toBeInTheDocument();
    expect(calls.approveHero).not.toHaveBeenCalled();
  });
  it("shows article relevance changes and requires an explicit confirmation for the loaded article", async () => {
    workflow = { ...emptyWorkflow, state: { selectedVersionId: "hero-v2", relevanceReason: "The article's central claim changed." }, versions: [versionFixture] };
    render(<EditorialVisualPanel postId="post-1" brandId="corvo" />);
    expect(screen.getByText("The article's central claim changed.")).toBeInTheDocument();
    expect(calls.confirmRelevance).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Confirm hero still fits this article" }));
    await waitFor(() => expect(calls.confirmRelevance).toHaveBeenCalledWith({ postId: "post-1", versionId: "hero-v2", expectedArticleSignature: "article-current" }));
    expect(calls.approveHero).not.toHaveBeenCalled();
  });
  it("uploads an explicit reference and creates an empty brand profile without fabricating seed completion", async () => {
    profile = null; calls.uploadReference.mockResolvedValue({ referenceId: "new-reference" });
    const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]).buffer;
    const file = new File([bytes], "approved-raven.png", { type: "image/png" });
    Object.defineProperty(file, "arrayBuffer", { value: async () => bytes });
    render(<EditorialVisualPanel postId="post-1" brandId="corvo" />);
    expect(screen.getByRole("button", { name: "Plan visuals" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Reference image"), { target: { files: [file] } });
    expect(calls.uploadReference).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Upload reference" }));
    await waitFor(() => expect(calls.uploadReference).toHaveBeenCalledWith({ brandId: "corvo", fileName: "approved-raven.png", contentType: "image/png", bytes }));
    await screen.findByText(/1. identity · approved-raven.png/);
    fireEvent.change(screen.getByLabelText("Art direction"), { target: { value: "Tactile matte paper" } });
    fireEvent.change(screen.getByLabelText("Palette (Name = #RRGGBB)"), { target: { value: "Teal = #2E5B60" } });
    fireEvent.change(screen.getByLabelText("Default provider (brand owner)"), { target: { value: "digitalocean" } });
    fireEvent.change(screen.getByLabelText("Default model (brand owner)"), { target: { value: "gpt-image-2" } });
    fireEvent.click(screen.getByRole("button", { name: "Save brand visual profile" }));
    await waitFor(() => expect(calls.saveRevision).toHaveBeenCalledWith(expect.objectContaining({ expectedRevisionId: null, referenceBindings: [{ referenceId: "new-reference", role: "identity" }],
      defaultRoute: { provider: "digitalocean", model: "gpt-image-2", qualification: "unqualified" } })));
    expect(calls.requestPlan).not.toHaveBeenCalled();
  });
  it("keeps a failed reference upload unbound and does not retry it automatically", async () => {
    calls.uploadReference.mockRejectedValue(new Error("upload rejected"));
    const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]).buffer;
    const file = new File([bytes], "failed-reference.png", { type: "image/png" });
    Object.defineProperty(file, "arrayBuffer", { value: async () => bytes });
    render(<EditorialVisualPanel postId="post-1" brandId="corvo" />);
    fireEvent.change(screen.getByLabelText("Reference image"), { target: { files: [file] } });
    fireEvent.click(screen.getByRole("button", { name: "Upload reference" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("upload rejected");
    expect(screen.queryByText(/identity · failed-reference.png/)).not.toBeInTheDocument();
    expect(calls.uploadReference).toHaveBeenCalledTimes(1);
    expect(calls.saveRevision).not.toHaveBeenCalled();
  });
  it("shows actual seed status and saves only an explicit owner budget amount", async () => {
    const view = render(<EditorialVisualPanel postId="post-1" brandId="corvo" />);
    expect(screen.getByText(/Corvo archive: not imported · 1 of 2 assets verified/)).toBeInTheDocument();
    expect(screen.getByLabelText("Monthly visual budget in USD (brand owner)")).toHaveValue("");
    fireEvent.change(screen.getByLabelText("Monthly visual budget in USD (brand owner)"), { target: { value: "3.50" } });
    fireEvent.click(screen.getByRole("button", { name: "Save visual budget" }));
    await waitFor(() => expect(calls.setMonthlyBudget).toHaveBeenCalledWith({ brandId: "corvo", limitMicros: 3_500_000 }));
    seedStatus = { imported: true, assets: [{ referenceId: "one" }, { referenceId: "two" }], oneShotValidation: "not_tested", historicalModelId: null };
    view.rerender(<EditorialVisualPanel postId="post-1" brandId="corvo" />);
    expect(screen.getByText(/Corvo archive: imported · 2 of 2 assets verified/)).toBeInTheDocument();
    expect(screen.getByText(/Historical model unknown; candidate prompts remain untested/)).toBeInTheDocument();
    expect(calls.requestPlan).not.toHaveBeenCalled();
  });
  it("rejects invalid budget values without sending a mutation", async () => {
    render(<EditorialVisualPanel postId="post-1" brandId="corvo" />);
    for (const value of ["-1", "1.0000001", "NaN", "99999999999"]) {
      fireEvent.change(screen.getByLabelText("Monthly visual budget in USD (brand owner)"), { target: { value } });
      fireEvent.click(screen.getByRole("button", { name: "Save visual budget" }));
      expect(await screen.findByRole("alert")).toHaveTextContent(/nonnegative USD amount with at most six decimal places/);
      expect(calls.setMonthlyBudget).not.toHaveBeenCalled();
    }
  });
  it("renders the thrown backend message for a failed save instead of a generic sentence", async () => {
    calls.requestPlan.mockRejectedValue(new Error("Revision conflict: the saved plan changed. Reload."));
    render(<EditorialVisualPanel postId="post-1" brandId="corvo" />);
    fireEvent.click(screen.getByRole("button", { name: "Plan visuals" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Revision conflict: the saved plan changed. Reload.");
    expect(screen.queryByText(/This action could not be saved/)).not.toBeInTheDocument();
  });
  it("keeps a non-Error rejection on the honest fallback sentence", async () => {
    calls.requestPlan.mockRejectedValue("string rejection");
    render(<EditorialVisualPanel postId="post-1" brandId="corvo" />);
    fireEvent.click(screen.getByRole("button", { name: "Plan visuals" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/This action could not be saved/);
  });
  it("exposes the activity feed as a named region", () => {
    workflow = { ...emptyWorkflow, attempts: [{ _id: "attempt-1", stage: "generation", status: "queued" }] };
    render(<EditorialVisualPanel postId="post-1" brandId="corvo" />);
    expect(screen.getByRole("region", { name: "Visual activity" })).toBeInTheDocument();
  });
  it("selects persisted qualified routes from the inspector and demotes free-text overrides to advanced", async () => {
    workflow = { ...emptyWorkflow, plans: [planFixture], state: { selectedPlanId: "plan-1", selectedSceneIndex: 0 } };
    profile = { ...profileFixture, revision: { ...profileFixture.revision, defaultRoute: { provider: "digitalocean", model: "gpt-image-2", qualification: "unqualified" } } };
    routeAvailability = { imageRoutes: [
      { provider: "openai", model: "gpt-image-2", apiModelId: "gpt-image-2-2026-04-21", quality: "low", size: "1536x1024", outputFormat: "webp", generation: true, edit: true },
      { provider: "openai", model: "gpt-image-2", apiModelId: "gpt-image-2-2026-04-21", quality: "high", size: "1536x1024", outputFormat: "png", generation: true, edit: false },
    ], reason: null };
    calls.requestGeneration.mockResolvedValue("attempt-route-select");
    calls.executeImageAttempt.mockResolvedValue({ status: "completed", versionId: "hero-route-select", reason: null });
    render(<EditorialVisualPanel postId="post-1" brandId="corvo" />);
    const routeSelect = screen.getByLabelText("Generation route");
    expect(routeSelect).toHaveValue("");
    fireEvent.change(routeSelect, { target: { value: "openai:gpt-image-2" } });
    expect(screen.getByRole("button", { name: "Generate this concept" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Generate this concept" }));
    await waitFor(() => expect(calls.requestGeneration).toHaveBeenCalledWith(expect.objectContaining({ providerOverride: "openai", modelOverride: "gpt-image-2" })));
    // Selecting the brand default clears both overrides again.
    fireEvent.change(screen.getByLabelText("Generation route"), { target: { value: "" } });
    await waitFor(() => expect(screen.getByLabelText("Model override")).toHaveValue(""));
    expect(screen.getByLabelText("Provider override")).toHaveValue("");
  });
  it("shows a custom-override choice and keeps raw free-text fields as the advanced fallback", () => {
    workflow = { ...emptyWorkflow, plans: [planFixture], state: { selectedPlanId: "plan-1", selectedSceneIndex: 0 } };
    routeAvailability = { imageRoutes: [], reason: "no-qualified-route-and-cost-bound" };
    render(<EditorialVisualPanel postId="post-1" brandId="corvo" />);
    fireEvent.change(screen.getByLabelText("Model override"), { target: { value: "offline-fixture" } });
    fireEvent.change(screen.getByLabelText("Provider override"), { target: { value: "offline-fixture" } });
    expect(screen.getByLabelText("Generation route")).toHaveValue("custom");
  });
  it("points seed import at the operator guide instead of rendering shell commands", () => {
    render(<EditorialVisualPanel postId="post-1" brandId="corvo" />);
    expect(screen.getByText(/docs\/editorial-visuals\/seed-import\.md/)).toBeInTheDocument();
    expect(screen.queryByText(/node scripts\/import-visual-seed\.mjs/)).not.toBeInTheDocument();
    expect(screen.queryByText(/RESONATE_VISUAL_IMPORT_TOKEN/)).not.toBeInTheDocument();
    expect(calls.uploadReference).not.toHaveBeenCalled();
    expect(calls.requestPlan).not.toHaveBeenCalled();
  });
  it("shows the post exception editor for every corvo blog post, data-driven over arbitrary post counts", async () => {
    const secondPostContext = { title: "Second campaign post", blogSlug: "second-campaign-post", channelId: "corvo-blog" };
    const view = render(<EditorialVisualPanel postId="post-9" brandId="corvo" savedPostContext={secondPostContext} />);
    expect(screen.getByText("Post visual exception · none saved")).toBeInTheDocument();
    expect(screen.getByLabelText("Post exception guidance")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Apply approved article-7 hand exception" })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Post exception guidance"), { target: { value: "Keep this post on matte paper construction." } });
    fireEvent.click(screen.getByRole("button", { name: "Save post exception guidance" }));
    await waitFor(() => expect(calls.setPostException).toHaveBeenCalledWith({ postId: "post-9", expectedExceptionId: null, expectedPostContext: secondPostContext, guidance: "Keep this post on matte paper construction." }));
    for (const context of [{ ...secondPostContext, channelId: "corvo-linkedin" }, { ...secondPostContext, channelId: "freshproof-blog" }]) {
      view.rerender(<EditorialVisualPanel postId="post-9" brandId="corvo" savedPostContext={context} />);
      expect(screen.queryByLabelText("Post exception guidance")).not.toBeInTheDocument();
    }
    view.rerender(<EditorialVisualPanel postId="post-9" brandId="corvo" savedPostContext={secondPostContext} />);
    resolvedPost = { postExceptionId: null, postException: null, approvedSeedException: true };
    view.rerender(<EditorialVisualPanel postId="post-9" brandId="corvo" savedPostContext={secondPostContext} />);
    expect(screen.getByRole("button", { name: "Apply approved article-7 hand exception" })).toBeInTheDocument();
    expect(calls.applyCorvoArticle7Exception).not.toHaveBeenCalled();
    expect(calls.requestPlan).not.toHaveBeenCalled();
  });
  it("keeps two posts in one campaign visually independent with no cross-post state bleed", () => {
    const firstContext = { title: "First campaign post", blogSlug: "first-campaign-post", channelId: "corvo-blog" };
    const secondContext = { title: "Second campaign post", blogSlug: "second-campaign-post", channelId: "corvo-blog" };
    render(<>
      <div data-testid="first-post"><EditorialVisualPanel postId="post-9" brandId="corvo" savedPostContext={firstContext} /></div>
      <div data-testid="second-post"><EditorialVisualPanel postId="post-10" brandId="corvo" savedPostContext={secondContext} /></div>
    </>);
    const firstField = within(screen.getByTestId("first-post")).getByLabelText("Post exception guidance");
    const secondField = within(screen.getByTestId("second-post")).getByLabelText("Post exception guidance");
    fireEvent.change(firstField, { target: { value: "First post keeps the paper hand." } });
    expect(secondField).toHaveValue("");
    fireEvent.change(secondField, { target: { value: "Second post uses workshop lighting." } });
    expect(firstField).toHaveValue("First post keeps the paper hand.");
    expect(screen.getByText("First campaign post")).toBeInTheDocument();
    expect(screen.getByText("Second campaign post")).toBeInTheDocument();
    expect(calls.setPostException).not.toHaveBeenCalled();
  });
  it("applies the approved article-7 hand exception only where the backend reports it available", async () => {
    const savedPostContext = { title: "What Corvo Labs learned building an AI editorial workflow", blogSlug: "what-corvo-labs-learned-building-an-ai-editorial-workflow", channelId: "corvo-blog" };
    resolvedPost = { postExceptionId: null, postException: null, approvedSeedException: true };
    calls.applyCorvoArticle7Exception.mockResolvedValue({ postExceptionId: "exception-1", revision: 1 });
    const view = render(<EditorialVisualPanel postId="post-7" brandId="corvo" savedPostContext={savedPostContext} />);
    expect(screen.getByText(savedPostContext.title)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Apply approved article-7 hand exception" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Apply approved article-7 hand exception" }));
    await waitFor(() => expect(calls.applyCorvoArticle7Exception).toHaveBeenCalledWith({ postId: "post-7", expectedExceptionId: null, expectedPostContext: savedPostContext }));
    resolvedPost = { postExceptionId: "exception-1", postException: { _id: "exception-1", postId: "post-7", guidance: "Retain the approved photographic hand.", revision: 1, sourcePostTitle: savedPostContext.title, sourceBlogSlug: savedPostContext.blogSlug }, approvedSeedException: true };
    view.rerender(<EditorialVisualPanel postId="post-7" brandId="corvo" savedPostContext={savedPostContext} />);
    fireEvent.change(screen.getByLabelText("Post exception guidance"), { target: { value: "Keep the photographic hand; all surrounding human elements use matte paper." } });
    fireEvent.click(screen.getByRole("button", { name: "Save post exception guidance" }));
    await waitFor(() => expect(calls.setPostException).toHaveBeenCalledWith({ postId: "post-7", expectedExceptionId: "exception-1", expectedPostContext: savedPostContext, guidance: "Keep the photographic hand; all surrounding human elements use matte paper." }));
    view.rerender(<EditorialVisualPanel postId="post-7" brandId="corvo" savedPostContext={savedPostContext} savedContentChanged />);
    expect(screen.getByRole("button", { name: "Apply approved article-7 hand exception" })).toBeDisabled();
    expect(calls.requestPlan).not.toHaveBeenCalled();
  });
  it("keeps reflected prompts untested and presents profile proposals for human review", () => {
    workflow = { ...emptyWorkflow, reflections: [{ _id: "reflection-1", versionId: "hero-v2", candidatePrompt: "A restrained workshop silhouette.", validationStatus: "untested", profileChangeProposals: ["Review whether warmer light belongs in the palette."], lessonIds: [] }] };
    render(<EditorialVisualPanel postId="post-1" brandId="corvo" />);
    expect(screen.getByText("A restrained workshop silhouette.")).toBeInTheDocument();
    expect(screen.getByText(/Candidate prompt · untested/)).toBeInTheDocument();
    expect(screen.getByText(/Reflection is advisory and does not grant human approval/)).toBeInTheDocument();
    expect(screen.getByText("Review whether warmer light belongs in the palette.")).toBeInTheDocument();
    expect(calls.saveRevision).not.toHaveBeenCalled();
    expect(calls.requestGeneration).not.toHaveBeenCalled();
  });
});
