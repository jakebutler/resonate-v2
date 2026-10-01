import { describe, expect, it } from "vitest";
import { validateScenePlan, articleSignature, classifyArticleChange, canIssueLocalFixtureQuote, isOfflineContractRuntime } from "../visualWorkflow";

describe("editorial scene planning", () => {
  it("canonicalizes presentation quotes in the retained native scene anchors to exact article text", () => {
    const retained = {
  "article": "This private fictional draft exists only to verify the saved Resonate composer. It is unapproved, unscheduled, and must never be published.\n\nIn the fictional workshop, a builder tests a hand drill on a scrap board before working on an unfinished frame. The board remains on the bench as a record of that choice. This story describes no real company, customer, measurement, or research result.",
  "scenes": [
    {
      "action": "The builder carefully tests the hand drill on the scrap board",
      "articleAnchor": "\"In the fictional workshop, a builder tests a hand drill\"",
      "articleConnection": "This scene reflects the meticulous testing of tools, as described in this private fictional draft.",
      "metaphor": "The hand drill is a promise of creation",
      "reveal": "The scrap board bears marks of the builder's choices",
      "subject": "Builder in a workshop",
      "title": "Testing the Tool"
    },
    {
      "action": "The camera focuses on the worn surface of the scrap board",
      "articleAnchor": "\"The board remains on the bench as a record of that choice\"",
      "articleConnection": "The article emphasizes the significance of choices made in the workshop environment.",
      "metaphor": "The board represents the weight of unfinished projects",
      "reveal": "Each mark reveals the journey of thought and experiment",
      "subject": "Scrap board on the workbench",
      "title": "Mark of Decisions"
    },
    {
      "action": "The builder prepares to attach pieces to the frame",
      "articleAnchor": "\"before working on an unfinished frame\"",
      "articleConnection": "The narrative digs into the idea of unfinished work as a reflection of real efforts.",
      "metaphor": "An unfinished frame symbolizes potential and possibility",
      "reveal": "The incomplete structure hints at the futility and promise of creation",
      "subject": "Frame being constructed",
      "title": "The Unfinished Frame"
    }
  ]
};
    const scenes = structuredClone(retained.scenes);
    expect(validateScenePlan(scenes, retained.article)).toEqual({ valid: true, reasons: [] });
    expect(scenes.map(scene => scene.articleAnchor)).toEqual(retained.scenes.map(scene => scene.articleAnchor.slice(1, -1)));
    expect(scenes.every(scene => retained.article.includes(scene.articleAnchor))).toBe(true);
  });

  it("preserves genuine source quotes and rejects every nonexact or unmatched presentation anchor", () => {
    const stories = (articleAnchor: string) => [
      { title: "Repair", subject: "Raven mechanic", metaphor: "Inspection", action: "Removes damaged gear", reveal: "Missing tooth", articleConnection: "The source describes repair.", articleAnchor },
      { title: "Crossing", subject: "Bridge builder", metaphor: "Connection", action: "Lowers weighted basket", reveal: "Bending joint", articleConnection: "The source describes a test.", articleAnchor },
      { title: "Garden", subject: "Gardener", metaphor: "Growth", action: "Prunes tangled branch", reveal: "Sunlit bud", articleConnection: "The source describes a choice.", articleAnchor },
    ];
    const anchor = "repair the broken gear";
    const quoted = stories('"' + anchor + '"');
    expect(validateScenePlan(quoted, 'The source says "' + anchor + '" before acting.').valid).toBe(true);
    expect(quoted.every(scene => scene.articleAnchor === '"' + anchor + '"')).toBe(true);
    for (const [open, close] of [['"', '"'], ["'", "'"], ["“", "”"], ["‘", "’"]]) {
      const wrapped = stories(open + anchor + close);
      expect(validateScenePlan(wrapped, "Choose to " + anchor + " before acting.").valid).toBe(true);
      expect(wrapped.every(scene => scene.articleAnchor === anchor)).toBe(true);
    }
    for (const invalid of ['"' + anchor, anchor + '"', "'" + anchor + '"', '"Repair the broken gear"', '"repair the broken...gear"', '"repair the broken … gear"', '""' + anchor + '""']) {
      const scenes = stories(invalid);
      expect(validateScenePlan(scenes, "Choose to " + anchor + " before acting.")).toMatchObject({ valid: false, reasons: expect.arrayContaining(["Scene 1 lacks an exact article anchor"]) });
      expect(scenes.every(scene => scene.articleAnchor === invalid)).toBe(true);
    }
  });

  it("never classifies changed link targets, autolinks, or raw HTML identifiers as spelling fixes", () => {
    for (const content of ["Read [source](https://example.invalid/recieved).", "Read <https://example.invalid/recieved>.", '<div id="recieved">Stored anchor</div>', "Read https://example.invalid/recieved."]) {
      const before = { title: "Inspect first", content };
      expect(classifyArticleChange(before, { ...before, content: content.replace("recieved", "received") })).toBe("review-required");
    }
  });

  it("does not treat code identifiers or code spacing as verified spelling corrections", () => {
    const before = { title: "Inspect first", content: "Compare `recieved` with the stored identifier." };
    expect(classifyArticleChange(before, { ...before, content: "Compare `received` with the stored identifier." })).toBe("review-required");
    expect(classifyArticleChange({ ...before, content: "Use `a  b`." }, { ...before, content: "Use `a b`." })).toBe("review-required");
  });

  it("requires relevance review when markdown paragraph, heading, or list boundaries change", () => {
    const before = { title: "Inspect first", content: "# Inspect first\n\nEvidence matters.\n\n- Inspect the gear\n- Repair it" };
    expect(classifyArticleChange(before, { ...before, content: before.content.replace(/\n/g, " ") })).toBe("review-required");
    expect(classifyArticleChange(before, { ...before, content: before.content.replace("\n\nEvidence", "\nEvidence") })).toBe("review-required");
  });

  it("requires three complete article-bound stories, rejecting near-duplicates", () => {
    const article = "The raven inspects a machine and chooses to repair the broken gear.";
    const scene = { title: "Find the fault", subject: "raven in a workshop", metaphor: "inspection before action", action: "raven removes a broken gear", reveal: "repair exposes the cause of failure", articleConnection: "The inspection identifies a cause before committing to a repair.", articleAnchor: "repair the broken gear" };
    expect(validateScenePlan([scene, { ...scene, title: "Reveal the fault" }, { ...scene, title: "Inspect the fault" }], article)).toMatchObject({ valid: false });
    expect(validateScenePlan([scene], article)).toMatchObject({ valid: false });
  });
  it("still rejects identical Unicode stories and genuinely tokenless scene detail", () => {
    const article = "夜明けの工房で三つの異なる場面を検査して正しい道を選びます。";
    const scene = { title: "歯車を直す", subject: "工房の修理職人", metaphor: "欠けた歯車", action: "工具で歯車を取り替える", reveal: "機械の傷が見える", articleConnection: "本文の判断を具体的な行動に表す", articleAnchor: article };
    expect(validateScenePlan([scene, { ...scene, title: "作業を続ける" }, { ...scene, title: "故障を直す" }], article)).toMatchObject({ valid: false, reasons: expect.arrayContaining(["Scenes 1 and 2 tell nearly the same story"]) });
    const punctuationOnly = { ...scene, subject: "!!!", metaphor: "...", action: "???", reveal: "---" };
    expect(validateScenePlan([punctuationOnly, scene, { ...scene, title: "故障を直す" }], article)).toMatchObject({ valid: false, reasons: expect.arrayContaining(["Scene 1 lacks letter or number story detail"]) });
  });

  it("preserves verified typo and whitespace edits while requiring review for uncertain semantic changes", () => {
    const before = { title: "Inspect first", content: "The raven recieved evidence before acting." };
    expect(classifyArticleChange(before, { ...before, content: "The raven received evidence  before acting." })).toBe("copy-edit");
    expect(classifyArticleChange(before, { ...before, content: "The raven ignores evidence before acting." })).toBe("review-required");
    expect(articleSignature(before)).not.toBe(articleSignature({ ...before, content: "The raven ignores evidence before acting." }));
  });
});

describe("local offline fixture boundary", () => {
  it("requires every loopback, actor, route, and zero-cost clause independent of NODE_ENV", () => {
    const env = { NODE_ENV: "test", RESONATE_VISUAL_FIXTURE_MODE: "local-offline", RESONATE_VISUAL_FIXTURE_DEPLOYMENT: "anonymous-agent", RESONATE_VISUAL_FIXTURE_CONVEX_URL: "http://127.0.0.1:3210", CONVEX_SITE_URL: "http://127.0.0.1:3211", CONVEX_CLOUD_URL: "http://127.0.0.1:3210" };
    const quote = { provider: "offline-fixture", model: "offline-fixture", maximumMicros: 0 };
    expect(canIssueLocalFixtureQuote(env, "visual-rehearsal-only", quote)).toBe(true);
    for (const field of ["RESONATE_VISUAL_FIXTURE_MODE", "RESONATE_VISUAL_FIXTURE_DEPLOYMENT", "RESONATE_VISUAL_FIXTURE_CONVEX_URL", "CONVEX_SITE_URL", "CONVEX_CLOUD_URL"] as const) expect(canIssueLocalFixtureQuote({ ...env, [field]: "https://production.invalid" }, "visual-rehearsal-only", quote)).toBe(false);
    for (const maximumMicros of [1, -1, NaN]) expect(canIssueLocalFixtureQuote(env, "visual-rehearsal-only", { ...quote, maximumMicros })).toBe(false);
    expect(canIssueLocalFixtureQuote(env, "real-author", quote)).toBe(false);
    expect(canIssueLocalFixtureQuote(env, "visual-rehearsal-only", { ...quote, provider: "openai" })).toBe(false);
    expect(canIssueLocalFixtureQuote(env, "visual-rehearsal-only", { ...quote, model: "gpt-image-2" })).toBe(false);
    expect(canIssueLocalFixtureQuote({ NODE_ENV: "test" }, "visual-rehearsal-only", quote)).toBe(false);
    expect(isOfflineContractRuntime({ NODE_ENV: "test" })).toBe(true);
    expect(isOfflineContractRuntime(env)).toBe(false);
    expect(isOfflineContractRuntime({ NODE_ENV: "production" })).toBe(false);
  });
});
