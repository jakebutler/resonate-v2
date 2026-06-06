import { describe, expect, it } from "vitest";
import { buildV2MigrationDryRunPlan, type LegacyConvexExport } from "@/lib/v2Migration";

describe("v2 migration dry-run planner", () => {
  const legacyExport: LegacyConvexExport = {
    posts: [
      {
        _id: "post_blog_1",
        type: "blog",
        title: "Migration Notes",
        content: "A published blog post.",
        status: "published",
        scheduledDate: "2026-03-04",
        externalUrl: "https://www.corvolabs.com/blog/migration-notes",
        githubPrUrl: "https://github.com/jakebutler/corvolabs-dot-com/pull/10",
      },
      {
        _id: "post_linkedin_1",
        type: "linkedin",
        content: "Scheduled LinkedIn copy.",
        status: "scheduled",
        scheduledDate: "2026-03-05",
        scheduledTime: "09:00",
      },
      {
        _id: "post_ambiguous_1",
        type: "linkedin",
        content: "Published without an external URL.",
        status: "published",
      },
    ],
    capturedIdeas: [
      {
        _id: "idea_1",
        status: "ready",
        tags: ["migration", "v2"],
        sourceUrl: "https://example.com/source",
        sourceTitle: "Source Article",
        latestEntryPreview: "Fallback preview",
      },
    ],
    capturedIdeaEntries: [
      {
        _id: "entry_2",
        ideaId: "idea_1",
        content: "Second note.",
        createdAt: 2,
      },
      {
        _id: "entry_1",
        ideaId: "idea_1",
        content: "First note.",
        createdAt: 1,
      },
    ],
    capturedIdeaPostLinks: [
      {
        _id: "idea_link_1",
        ideaId: "idea_1",
        postId: "post_linkedin_1",
      },
    ],
    ideas: [
      {
        _id: "workflow_idea_1",
        title: "Workflow idea",
        text: "Move this workflow idea into the v2 idea model.",
        status: "research",
        references: [
          {
            url: "https://example.com/workflow-source",
            title: "Workflow source",
            addedBy: "user",
          },
        ],
      },
    ],
    workflowDrafts: [
      {
        _id: "draft_1",
        ideaId: "workflow_idea_1",
        postId: "post_blog_1",
        stage: "copyedit",
      },
    ],
    settings: [
      {
        blogEnabled: true,
        blogFrequency: "weekly",
        linkedinEnabled: true,
        linkedinFrequency: "weekly",
      },
    ],
  };

  it("archives raw v1 rows and produces v2 post and idea candidates", () => {
    const plan = buildV2MigrationDryRunPlan(legacyExport, {
      now: "2026-06-06T00:00:00.000Z",
    });

    expect(plan.mode).toBe("dry-run");
    expect(plan.summary).toMatchObject({
      rawRecords: 10,
      archivedPosts: 3,
      archivedIdeas: 1,
      archivedIdeaEntries: 2,
      archivedIdeaPostLinks: 1,
      archivedWorkflowIdeas: 1,
      archivedWorkflowDrafts: 1,
      archivedSettings: 1,
      v2PostCandidates: 3,
      v2IdeaCandidates: 2,
      imported: 5,
      skipped: 0,
      ambiguous: 1,
      failed: 0,
      warnings: 0,
    });
    expect(plan.archive.posts[0]).toBe(legacyExport.posts?.[0]);
    expect(plan.v2Candidates.posts[0]).toMatchObject({
      legacyPostId: "post_blog_1",
      brandId: "corvo",
      channelId: "corvo-blog",
      status: "published",
      approvalState: "approved",
      prUrl: "https://github.com/jakebutler/corvolabs-dot-com/pull/10",
    });
    expect(plan.v2Candidates.posts[1]).toMatchObject({
      channelId: "linkedin",
      status: "scheduled",
      approvalState: "unapproved",
      scheduledTime: "09:00",
      sourceLegacyCapturedIdeaId: "idea_1",
      editableInSingleComposer: true,
    });
    expect(plan.v2Candidates.posts[2]).toMatchObject({
      legacyPostId: "post_ambiguous_1",
      providerState: "ambiguous",
    });
    expect(plan.v2Candidates.ideas[0]).toMatchObject({
      legacyIdeaId: "idea_1",
      brandId: "corvo",
      title: "Source Article",
      text: "First note.\n\nSecond note.",
      status: "ready",
      entryCount: 2,
      linkedLegacyPostIds: ["post_linkedin_1"],
    });
    expect(plan.v2Candidates.ideas[1]).toMatchObject({
      legacyIdeaId: "workflow_idea_1",
      sourceLegacyTable: "ideas",
      status: "ready",
      sourceUrl: "https://example.com/workflow-source",
      linkedLegacyPostIds: ["post_blog_1"],
    });
    expect(plan.records.ambiguous).toEqual(["posts:post_ambiguous_1"]);
  });

  it("skips invalid rows while preserving them in the raw archive", () => {
    const plan = buildV2MigrationDryRunPlan({
      posts: [
        {
          _id: "empty_post",
          type: "blog",
          content: " ",
          status: "draft",
        },
      ],
      capturedIdeas: [
        {
          _id: "empty_idea",
          status: "inbox",
        },
      ],
      ideas: [
        {
          _id: "empty_workflow_idea",
          text: "",
          status: "idea",
        },
      ],
    });

    expect(plan.archive.posts).toHaveLength(1);
    expect(plan.archive.capturedIdeas).toHaveLength(1);
    expect(plan.v2Candidates.posts).toHaveLength(0);
    expect(plan.v2Candidates.ideas).toHaveLength(0);
    expect(plan.warnings).toEqual([
      "Skipped post empty_post: missing content",
      "Skipped captured idea empty_idea: missing idea text",
      "Skipped workflow idea empty_workflow_idea: missing workflow idea text",
    ]);
    expect(plan.records.skipped).toEqual([
      "posts:empty_post",
      "capturedIdeas:empty_idea",
      "ideas:empty_workflow_idea",
    ]);
  });
});
