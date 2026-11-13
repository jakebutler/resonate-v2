import { registerSyncFixture, type SyncFixture } from "./registry";

/**
 * C5 visual-composer e2e fixture: the saved-post composer (`/?postId=…`) with
 * a corvo-blog post and an editorial-visuals workflow driven through its real
 * production path — planning and image dispatch run as Convex actions against
 * qualified routes, so the mock image/text provider lives at the action
 * boundary (`visualProviderActions:executeImageAttempt`,
 * `visualTextActions:executeTextAttempt`), exactly where the paid provider
 * transport sits in live use.
 *
 * The fixture keeps a small state machine (attempts, plan, versions, hero
 * export, approval) so the mock provider rejects garbage attempt ids instead
 * of accepting any call, and the panel's guards (pending, selection pending,
 * budget display) exercise for real. Export/version image bytes are served
 * from a local mock asset route so the browser genuinely decodes them — hero
 * approval requires a loaded export preview.
 */

export type EditorialVisualsFixture = {
  /** Every mutation and action udfPath, in wire order. */
  calls: string[];
};

type Scene = {
  title: string;
  subject: string;
  metaphor: string;
  action: string;
  reveal: string;
  articleConnection: string;
  articleAnchor: string;
};

type Version = {
  _id: string;
  parentVersionId: string | null;
  provider: string;
  model: string;
  feedback: string | null;
  width: number;
  height: number;
  input: {
    prompt: string;
    quality: string;
    size: string;
    outputFormat: string;
  };
  url: string;
  exportUrl: string | null;
  exportHash: string | null;
  exportMetadata: {
    width: number;
    height: number;
    bytes: number;
    format: string;
  } | null;
  approvedAt: number | null;
  approvedExportHash: string | null;
  approvedExportMetadataSignature: string | null;
};

type Attempt = { _id: string; stage: string; status: string };

type WorkflowState = {
  selectedPlanId: string | null;
  selectedSceneIndex: number | null;
  selectedVersionId: string | null;
  refinedScene: Scene | null;
  relevanceReason: string | null;
};

const MOCK_ASSET_PATH = "/e2e-mock-assets/hero-fixture.png";

// 1×1 PNG: the browser must actually decode the version/preview bytes for
// hero approval (`loaded` gate), so a data-less src is not enough.
const MOCK_ASSET_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

const scenes: Scene[] = [
  {
    title: "Workshop",
    subject: "Raven mechanic",
    metaphor: "Controlled testing",
    action: "Adjusts the wheel",
    reveal: "The hidden bend appears",
    articleConnection: "Tests reveal hidden limits",
    articleAnchor: "Test the actual work",
  },
  {
    title: "Bridge",
    subject: "Navigator",
    metaphor: "A safe crossing",
    action: "Lowers the bridge",
    reveal: "The far bank becomes visible",
    articleConnection: "Evidence connects decisions",
    articleAnchor: "Find the necessary evidence",
  },
  {
    title: "Garden",
    subject: "Gardener",
    metaphor: "Careful pruning",
    action: "Prunes a tangled branch",
    reveal: "A bud receives daylight",
    articleConnection: "Constraints create clarity",
    articleAnchor: "Keep the constraints visible",
  },
];

const imageRoutes = [
  {
    provider: "openai",
    model: "gpt-image-2",
    apiModelId: "gpt-image-2-2026-04-21",
    quality: "medium",
    size: "1536x1024",
    outputFormat: "webp",
    generation: true,
    edit: true,
  },
];

const post = {
  _id: "post-visual",
  userId: "fixture-editor",
  brandId: "corvo",
  channelId: "corvo-blog",
  platformId: "corvo-blog",
  title: "Fixture visual composer post",
  content:
    "Complete immutable 42% copy.\nNumber 1234 and https://example.com/source",
  timezone: "America/Los_Angeles",
  scheduledDate: "2030-10-07",
  scheduledTime: "09:00",
  approvalState: "unapproved",
  status: "draft",
  blogPublicationIntent: "draft",
  blogSlug: "fixture-visual-composer-post",
  coverImageAlt: "Fixture hero alt",
  createdAt: 1,
  updatedAt: 1,
};

function makeVersion(n: number, parent: string | null, feedback: string | null): Version {
  return {
    _id: `hero-v${n}`,
    parentVersionId: parent,
    provider: "openai",
    model: "gpt-image-2",
    feedback,
    width: 1536,
    height: 1024,
    input: {
      prompt: `Mock provider prompt ${n}`,
      quality: "medium",
      size: "1536x1024",
      outputFormat: "webp",
    },
    url: MOCK_ASSET_PATH,
    exportUrl: null,
    exportHash: null,
    exportMetadata: null,
    approvedAt: null,
    approvedExportHash: null,
    approvedExportMetadataSignature: null,
  };
}

registerSyncFixture<EditorialVisualsFixture>("editorial-visuals", (page) => {
  const calls: string[] = [];
  let attempts: Attempt[] = [];
  let plans: { _id: string; status: string; scenes: Scene[]; reasons: string[] }[] = [];
  let versions: Version[] = [];
  let state: WorkflowState = {
    selectedPlanId: null,
    selectedSceneIndex: null,
    selectedVersionId: null,
    refinedScene: null,
    relevanceReason: null,
  };
  let versionCounter = 0;
  let lastEditFeedback: string | null = null;

  // Serve the version/hero-preview bytes the browser decodes.
  void page.route("**" + MOCK_ASSET_PATH, (route) =>
    route.fulfill({ status: 200, contentType: "image/png", body: MOCK_ASSET_PNG }),
  );

  const workflow = () => ({
    articleSignature: "article-visual-fixture",
    state,
    attempts,
    plans,
    versions,
    reflections: [],
    budget: { limitMicros: 20_000_000 },
    month: { spentMicros: 0, reservedMicros: 0 },
  });

  function completeAttempt(attemptId: unknown) {
    const attempt = attempts.find((a) => a._id === attemptId && a.status === "queued");
    if (!attempt) throw new Error(`Mock provider received unknown attempt: ${String(attemptId)}`);
    attempt.status = "completed";
  }

  function runMockImageAttempt(attemptId: unknown): { status: string; versionId: string; reason: string | null } {
    const attempt = attempts.find((a) => a._id === attemptId);
    if (!attempt || !["generation", "edit"].includes(attempt.stage))
      throw new Error(`Mock image provider received non-image attempt: ${String(attemptId)}`);
    completeAttempt(attemptId);
    versionCounter += 1;
    const parent = attempt.stage === "edit" ? state.selectedVersionId : null;
    // The child version carries the feedback that produced it.
    const feedback = attempt.stage === "edit" ? lastEditFeedback : null;
    const version = makeVersion(versionCounter, parent, feedback);
    versions.push(version);
    state.selectedVersionId = version._id;
    return { status: "completed", versionId: version._id, reason: null };
  }

  return {
    fixture: { calls },
    handlers: {
      value: (path) => {
        if (path === "visualWorkflow:get") return workflow();
        if (path === "visualProfiles:getProfile")
          return {
            revision: {
              _id: "profile-visual-1",
              revision: 1,
              artDirection: "Layered matte paper",
              palette: [{ name: "Teal", color: "#2E5B60" }],
              mascotGuidance: "Approved raven identity",
              compositionGuidance: "Show the action",
              textPolicy: "Only necessary specified strings",
              heroChartPolicy: "Illustrative graphics",
              referenceBindings: [],
              defaultRoute: { provider: "openai", model: "gpt-image-2", qualification: "qualified" },
            },
            references: [],
          };
        if (path === "visualProviderConfig:getAvailability")
          return { imageRoutes, reason: null };
        if (path === "visualTextConfig:getAvailability")
          return { planning: true, reflection: true, reason: null };
        if (path === "visualProfiles:getSeedStatus")
          return { imported: true, assets: [{ referenceId: "seed-asset-1" }], oneShotValidation: "not_tested", historicalModelId: null };
        if (path === "publishing:listBrands") return [{ brandId: "corvo", name: "Corvo Labs" }];
        if (path === "publishing:getPostById") return post;
        if (path === "publishing:listCalendarItems")
          return [
            {
              post,
              intent: {
                _id: "intent-visual",
                scheduledDate: post.scheduledDate,
                scheduledTime: post.scheduledTime,
                timezone: post.timezone,
              },
              providerState: { status: "not-submitted" },
              attemptCount: 0,
            },
          ];
        if (path === "publishing:bufferLiveSubmissionEnabled") return { enabled: false };
        if (path === "series:list") return [];
        return null;
      },
      mutation: (path, args) => {
        calls.push(path);
        switch (path) {
          case "visualWorkflow:requestPlan": {
            attempts.push({ _id: "attempt-plan-1", stage: "planning", status: "queued" });
            return "attempt-plan-1";
          }
          case "visualWorkflow:selectScene": {
            state.selectedPlanId = (args as { planId: string }).planId;
            state.selectedSceneIndex = (args as { sceneIndex: number }).sceneIndex;
            state.refinedScene = (args as { refinedScene?: Scene }).refinedScene ?? null;
            return null;
          }
          case "visualWorkflow:requestGeneration": {
            attempts.push({ _id: "attempt-gen-1", stage: "generation", status: "queued" });
            return "attempt-gen-1";
          }
          case "visualWorkflow:requestEdit": {
            lastEditFeedback = (args as { feedback: string }).feedback;
            attempts.push({ _id: "attempt-edit-1", stage: "edit", status: "queued" });
            return "attempt-edit-1";
          }
          case "visualWorkflow:selectVersion": {
            state.selectedVersionId = (args as { versionId: string }).versionId;
            return null;
          }
          case "visualWorkflow:approveHero": {
            const { versionId, expectedExportHash, expectedExportMetadataSignature } =
              args as { versionId: string; expectedExportHash: string; expectedExportMetadataSignature: string };
            const version = versions.find((v) => v._id === versionId);
            if (!version) throw new Error(`Approve hero for unknown version: ${versionId}`);
            version.approvedAt = 1;
            version.approvedExportHash = expectedExportHash;
            version.approvedExportMetadataSignature = expectedExportMetadataSignature;
            return { approved: true };
          }
          case "visualWorkflow:setMonthlyBudget":
            return null;
          default:
            throw new Error(`Unexpected fixture mutation: ${path}`);
        }
      },
      action: (path, args) => {
        calls.push(path);
        switch (path) {
          // Mock text provider: completes the queued planning attempt and
          // saves the three-scene plan.
          case "visualTextActions:executeTextAttempt": {
            completeAttempt((args as { attemptId: string }).attemptId);
            plans.push({ _id: "plan-visual-1", status: "complete", scenes, reasons: [] });
            return { status: "completed", planId: "plan-visual-1", reflectionId: null, reason: null };
          }
          // Mock image provider: validates the attempt, stores an immutable
          // version, and auto-selects it — the panel's generation contract.
          case "visualProviderActions:executeImageAttempt":
            return runMockImageAttempt((args as { attemptId: string }).attemptId);
          case "visualExports:prepareHero": {
            const { versionId } = args as { versionId: string };
            const version = versions.find((v) => v._id === versionId);
            if (!version) throw new Error(`Prepare hero for unknown version: ${versionId}`);
            version.exportUrl = MOCK_ASSET_PATH;
            version.exportHash = "export-fixture-hash";
            version.exportMetadata = { width: 1600, height: 900, bytes: 98304, format: "webp" };
            return { versionId, exportHash: version.exportHash };
          }
          case "visualProfiles:uploadReference":
            return { referenceId: "reference-fixture-1" };
          default:
            throw new Error(`Unexpected fixture action: ${path}`);
        }
      },
    },
  } satisfies SyncFixture<EditorialVisualsFixture>;
});
