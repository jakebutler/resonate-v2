import { describe, expect, it } from "vitest";
import {
  buildDraftStageAgentPrompt,
  buildOutlineAgentPrompt,
  buildResearchAgentPrompt,
  extractUrls,
  formatWorkflowTimestamp,
  formatWorkflowTitle,
  getNextDraftStage,
  getStageAgentLabel,
  isPublishedCardVisible,
  runDraftStageCheck,
  runIdeaStageCheck,
  summarizeTextPreview,
} from "@/lib/workflow";

describe("workflow helpers", () => {
  it("blocks thin ideas from advancing into research", () => {
    const result = runIdeaStageCheck({
      currentStage: "idea",
      nextStage: "research",
      text: "Too short",
    });

    expect(result.ready).toBe(false);
    expect(result.issues).toEqual([
      "The idea still reads like a fragment instead of a workable prompt.",
      "Adding a title or slightly more context would make research direction clearer.",
    ]);
    expect(result.recommendedAction).toBe("Research Agent");
  });

  it("allows research when the idea is short but has enough context via a title", () => {
    const result = runIdeaStageCheck({
      currentStage: "idea",
      nextStage: "research",
      title: "Migration risk register",
      text: "This has enough context to steer research even if it is still concise.",
    });

    expect(result.ready).toBe(true);
    expect(result.recommendedAction).toBe("advance");
  });

  it("blocks outline creation when research inputs are incomplete", () => {
    const result = runIdeaStageCheck({
      currentStage: "research",
      nextStage: "outline",
      title: "AI migration lessons",
      text: "Explain why AI migrations fail after the prototype stage.",
      researchObjective: "   ",
      researchNotes: "A few fragments only.",
      references: [],
    });

    expect(result.ready).toBe(false);
    expect(result.issues).toEqual([
      "Research notes are still thin for spawning a strong first draft.",
      "A research objective is missing, so the downstream draft lacks a clear angle.",
      "No references are attached yet, which makes the draft harder to ground.",
    ]);
    expect(result.recommendedAction).toBe("Outline Agent");
  });

  it("allows well-researched ideas to spawn outline drafts", () => {
    const result = runIdeaStageCheck({
      currentStage: "research",
      nextStage: "outline",
      title: "AI migration lessons",
      text: "Why most AI migrations stall after the prototype.",
      researchObjective: "Explain why operational constraints matter more than model choice.",
      researchNotes:
        "Teams often underinvest in evaluation, workflow changes, and ownership transfer. Strong drafts need specific examples, constraints, and objections to address.",
      references: [{ url: "https://example.com/report", addedBy: "user" }],
    });

    expect(result.ready).toBe(true);
  });

  it("blocks copyedit when a blog draft lacks title, length, and structure", () => {
    const result = runDraftStageCheck({
      currentStage: "outline",
      nextStage: "copyedit",
      type: "blog",
      content: "Short notes only",
    });

    expect(result.ready).toBe(false);
    expect(result.issues).toEqual([
      "The post still needs a working title.",
      "The draft is still very short for a copyedit pass.",
      "The content still looks like notes instead of a structured draft.",
    ]);
    expect(result.recommendedAction).toBe("Copyedit Agent");
  });

  it("allows copyedit when a linkedin draft has enough structure and length", () => {
    const result = runDraftStageCheck({
      currentStage: "outline",
      nextStage: "copyedit",
      type: "linkedin",
      content: `${"A".repeat(180)}\n\n${"B".repeat(120)}`,
    });

    expect(result.ready).toBe(true);
  });

  it("blocks seo when placeholders remain or blog headings are missing", () => {
    const result = runDraftStageCheck({
      currentStage: "copyedit",
      nextStage: "seo",
      type: "blog",
      title: "Operational AI systems",
      content: "TODO tighten this draft before review.",
    });

    expect(result.ready).toBe(false);
    expect(result.issues).toEqual([
      "Placeholder notes are still present in the draft.",
      "The draft is missing section structure that usually exists before SEO review.",
    ]);
    expect(result.recommendedAction).toBe("SEO Agent");
  });

  it("uses the discoverability agent label for linkedin seo checks", () => {
    const result = runDraftStageCheck({
      currentStage: "copyedit",
      nextStage: "seo",
      type: "linkedin",
      title: "Optional",
      content: "A clean linkedin draft without placeholders",
    });

    expect(result.ready).toBe(true);
    expect(getStageAgentLabel("seo", "linkedin")).toBe("Discoverability Agent");
  });

  it("blocks final review when content is thin and title is missing", () => {
    const result = runDraftStageCheck({
      currentStage: "seo",
      nextStage: "final",
      type: "blog",
      content: "A compact draft",
    });

    expect(result.ready).toBe(false);
    expect(result.issues).toEqual([
      "The content is still thin for a final editorial pass.",
      "A final edit should have a title in place.",
    ]);
    expect(result.recommendedAction).toBe("Final Edit Agent");
  });

  it("allows final review for a substantial linkedin draft", () => {
    const result = runDraftStageCheck({
      currentStage: "seo",
      nextStage: "final",
      type: "linkedin",
      content: `${"A".repeat(180)}\n\n${"B".repeat(140)}`,
    });

    expect(result.ready).toBe(true);
  });

  it("blocks publishing when schedule or placeholders are missing", () => {
    const result = runDraftStageCheck({
      currentStage: "final",
      nextStage: "published",
      type: "blog",
      title: "A post",
      content: "TODO: finish this section before publishing.",
    });

    expect(result.ready).toBe(false);
    expect(result.issues).toContain("A publish date is still missing.");
  });

  it("allows publishing when schedule exists and placeholders are resolved", () => {
    const result = runDraftStageCheck({
      currentStage: "final",
      nextStage: "published",
      type: "blog",
      title: "A post",
      content: "Final publish-ready body",
      scheduledDate: "2026-03-15",
    });

    expect(result.ready).toBe(true);
    expect(result.recommendedAction).toBe("advance");
  });

  it("hides published cards more than one week old", () => {
    const now = Date.parse("2026-03-11T12:00:00.000Z");
    const stalePublishedAt = Date.parse("2026-03-03T11:59:59.000Z");
    const freshPublishedAt = Date.parse("2026-03-04T12:00:00.000Z");

    expect(isPublishedCardVisible(stalePublishedAt, now)).toBe(false);
    expect(isPublishedCardVisible(freshPublishedAt, now)).toBe(true);
    expect(isPublishedCardVisible(undefined, now)).toBe(true);
  });

  it("formats workflow titles, timestamps, urls, previews, and next stages", () => {
    expect(formatWorkflowTitle("  Explicit title  ", "ignored")).toBe("Explicit title");
    expect(
      formatWorkflowTitle(
        undefined,
        `${"This is the first line of content that is deliberately long enough to be trimmed".repeat(2)}\nSecond line`
      )
    ).toHaveLength(73);
    expect(formatWorkflowTitle(undefined, "   ")).toBe("Untitled");
    expect(formatWorkflowTimestamp(undefined)).toBe("Not yet");
    expect(formatWorkflowTimestamp(Date.parse("2026-03-11T12:00:00.000Z"))).toMatch(
      /Mar \d{1,2}, \d{1,2}:\d{2} (AM|PM)/
    );
    expect(
      extractUrls(
        "Source https://example.com/one, repeated https://example.com/one and https://example.com/two!"
      )
    ).toEqual(["https://example.com/one", "https://example.com/two"]);
    expect(summarizeTextPreview("   A  spaced   preview  ")).toBe("A spaced preview");
    expect(summarizeTextPreview("X".repeat(20), 10)).toBe("XXXXXXXXXX…");
    expect(getNextDraftStage("outline")).toBe("copyedit");
    expect(getNextDraftStage("published")).toBeNull();
  });

  it("returns the expected agent labels across stages", () => {
    expect(getStageAgentLabel("idea")).toBe("Workflow Agent");
    expect(getStageAgentLabel("research")).toBe("Research Agent");
    expect(getStageAgentLabel("outline")).toBe("Outline Agent");
    expect(getStageAgentLabel("copyedit")).toBe("Copyedit Agent");
    expect(getStageAgentLabel("seo", "blog")).toBe("SEO Agent");
    expect(getStageAgentLabel("seo", "linkedin")).toBe("Discoverability Agent");
    expect(getStageAgentLabel("final")).toBe("Final Edit Agent");
    expect(getStageAgentLabel("published")).toBe("Publish Readiness Agent");
  });

  it("builds research, outline, and draft-stage prompts from the provided context", () => {
    const researchPrompt = buildResearchAgentPrompt({
      title: "Signals from the board",
      text: "Ideas can branch into multiple posts.",
      references: [{ url: "https://example.com/one", addedBy: "user" }],
    });
    const outlinePrompt = buildOutlineAgentPrompt({
      type: "blog",
      title: "Signals from the board",
      text: "Ideas can branch into multiple posts.",
      researchNotes: "Use examples from real editorial planning systems.",
      references: [{ url: "https://example.com/one", addedBy: "user" }],
    });
    const linkedinOutlinePrompt = buildOutlineAgentPrompt({
      type: "linkedin",
      text: "Ideas can branch into multiple posts.",
    });
    const copyeditPrompt = buildDraftStageAgentPrompt({
      type: "blog",
      targetStage: "copyedit",
      title: "Signals from the board",
      content: "## Draft\n\nCurrent body.",
      ideaTitle: "Signals from the board",
      ideaText: "Ideas can branch into multiple posts.",
      references: [{ url: "https://example.com/one", title: "Example", addedBy: "user" }],
    });
    const linkedinSeoPrompt = buildDraftStageAgentPrompt({
      type: "linkedin",
      targetStage: "seo",
      content: "Current post body",
      ideaText: "Ideas can branch into multiple posts.",
    });
    const finalPrompt = buildDraftStageAgentPrompt({
      type: "blog",
      targetStage: "final",
      content: "Current post body",
      ideaText: "Ideas can branch into multiple posts.",
    });
    const publishPrompt = buildDraftStageAgentPrompt({
      type: "blog",
      targetStage: "published",
      content: "Current post body",
      ideaText: "Ideas can branch into multiple posts.",
      scheduledDate: "2026-03-15",
    });

    expect(researchPrompt).toContain("## Research Objective");
    expect(outlinePrompt).toContain("Turn the idea and research context into a strong first blog draft");
    expect(outlinePrompt).toContain("https://example.com/one");
    expect(linkedinOutlinePrompt).toContain("Turn the idea and research context into a strong LinkedIn post draft.");
    expect(copyeditPrompt).toContain("Revise the draft for clarity, structure, and factual hygiene");
    expect(copyeditPrompt).toContain("Example (https://example.com/one)");
    expect(linkedinSeoPrompt).toContain("Improve discoverability for LinkedIn with a stronger hook");
    expect(finalPrompt).toContain("Produce a publication-ready final edit with stronger flow and cleaner phrasing.");
    expect(publishPrompt).toContain("Perform a final publish-readiness sweep and remove unresolved placeholders.");
  });
});
