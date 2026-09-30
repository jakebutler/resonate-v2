import { describe, expect, it } from "vitest";
import { validateScenePlan, articleSignature, classifyArticleChange, canIssueLocalFixtureQuote, isOfflineContractRuntime } from "../visualWorkflow";

describe("editorial scene planning", () => {
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
