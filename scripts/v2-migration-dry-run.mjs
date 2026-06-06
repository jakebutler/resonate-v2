#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

function parseArgs(args) {
  const options = {
    defaultBrandId: "corvo",
    timezone: "America/Los_Angeles",
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--input") {
      options.input = args[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--out") {
      options.out = args[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--brand") {
      options.defaultBrandId = args[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--timezone") {
      options.timezone = args[index + 1];
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!options.input) {
    throw new Error("--input is required");
  }
  return options;
}

function buildPlan(input, options) {
  const posts = Array.isArray(input.posts) ? input.posts : [];
  const capturedIdeas = Array.isArray(input.capturedIdeas) ? input.capturedIdeas : [];
  const capturedIdeaEntries = Array.isArray(input.capturedIdeaEntries)
    ? input.capturedIdeaEntries
    : [];
  const capturedIdeaPostLinks = Array.isArray(input.capturedIdeaPostLinks)
    ? input.capturedIdeaPostLinks
    : [];
  const workflowIdeas = Array.isArray(input.ideas) ? input.ideas : [];
  const workflowDrafts = Array.isArray(input.workflowDrafts) ? input.workflowDrafts : [];
  const settings = Array.isArray(input.settings) ? input.settings : [];
  const warnings = [];
  const skipped = [];

  const capturedLinksByPostId = capturedIdeaPostLinks.reduce((acc, link) => {
    if (!link.postId || !link.ideaId) {
      warnings.push("Skipped captured idea post link without postId or ideaId.");
      skipped.push(`capturedIdeaPostLinks:${link._id ?? "(missing id)"}`);
      return acc;
    }
    acc[link.postId] = [...(acc[link.postId] ?? []), link];
    return acc;
  }, {});
  const workflowDraftByPostId = workflowDrafts.reduce((acc, draft) => {
    if (draft.postId) acc[draft.postId] = draft;
    return acc;
  }, {});

  const v2Posts = posts.flatMap((post) => {
    if ((post.type !== "blog" && post.type !== "linkedin") || !post.content?.trim()) {
      warnings.push(`Skipped post ${post._id ?? "(missing id)"}: unsupported type or missing content`);
      skipped.push(`posts:${post._id ?? "(missing id)"}`);
      return [];
    }
    const workflowDraft = workflowDraftByPostId[post._id];
    return [
      {
        legacyPostId: post._id,
        brandId: options.defaultBrandId,
        channelId: post.type === "blog" ? "corvo-blog" : "linkedin",
        title: post.title?.trim() || post.content.trim().slice(0, 80),
        content: post.content.trim(),
        status: post.status === "published" ? "published" : post.status === "scheduled" ? "scheduled" : "draft",
        approvalState: post.status === "published" ? "approved" : "unapproved",
        scheduledDate: post.scheduledDate,
        scheduledTime: post.scheduledTime,
        timezone: options.timezone,
        externalUrl: post.externalUrl,
        prUrl: post.githubPrUrl,
        providerState: post.githubPrUrl
          ? "github-pr"
          : post.externalUrl
            ? "external-url"
            : post.status === "published"
              ? "ambiguous"
              : "none",
        sourceLegacyCapturedIdeaId: capturedLinksByPostId[post._id]?.[0]?.ideaId,
        sourceLegacyWorkflowIdeaId: workflowDraft?.ideaId,
        sourceLegacyWorkflowDraftId: workflowDraft?._id,
        editableInSingleComposer: true,
        sourceLegacyTable: "posts",
      },
    ];
  });

  const entriesByIdeaId = capturedIdeaEntries.reduce((acc, entry) => {
    if (!entry.ideaId) {
      warnings.push("Skipped captured idea entry without ideaId.");
      skipped.push(`capturedIdeaEntries:${entry._id ?? "(missing id)"}`);
      return acc;
    }
    acc[entry.ideaId] = [...(acc[entry.ideaId] ?? []), entry];
    return acc;
  }, {});
  const v2Ideas = capturedIdeas.flatMap((idea) => {
    const entries = (entriesByIdeaId[idea._id] ?? []).sort(
      (a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0)
    );
    const text =
      entries.map((entry) => entry.content?.trim()).filter(Boolean).join("\n\n") ||
      idea.latestEntryPreview?.trim();
    if (!text) {
      warnings.push(`Skipped captured idea ${idea._id ?? "(missing id)"}: missing idea text`);
      skipped.push(`capturedIdeas:${idea._id ?? "(missing id)"}`);
      return [];
    }
    return [
      {
        legacyIdeaId: idea._id,
        brandId: options.defaultBrandId,
        title: idea.sourceTitle?.trim() || undefined,
        text,
        tags: Array.isArray(idea.tags) ? idea.tags.filter(Boolean) : [],
        sourceUrl: idea.sourceUrl,
        status: ["inbox", "reviewing", "ready", "used", "archived"].includes(idea.status)
          ? idea.status
          : "inbox",
        entryCount: entries.length,
        linkedLegacyPostIds: capturedIdeaPostLinks
          .filter((link) => link.ideaId === idea._id && link.postId)
          .map((link) => link.postId),
        sourceLegacyTable: "capturedIdeas",
      },
    ];
  });
  const v2WorkflowIdeas = workflowIdeas.flatMap((idea) => {
    const text = [idea.text, idea.researchObjective, idea.researchNotes]
      .map((value) => value?.trim())
      .filter(Boolean)
      .join("\n\n");
    if (!text) {
      warnings.push(`Skipped workflow idea ${idea._id ?? "(missing id)"}: missing workflow idea text`);
      skipped.push(`ideas:${idea._id ?? "(missing id)"}`);
      return [];
    }
    const drafts = workflowDrafts.filter((draft) => draft.ideaId === idea._id);
    return [
      {
        legacyIdeaId: idea._id,
        brandId: options.defaultBrandId,
        title: idea.title?.trim() || undefined,
        text,
        tags: [],
        sourceUrl: idea.references?.find((reference) => reference.url)?.url,
        status:
          idea.status === "archived"
            ? "archived"
            : idea.status === "research"
              ? "ready"
              : idea.status === "idea"
                ? "reviewing"
                : "inbox",
        entryCount: 1,
        linkedLegacyPostIds: drafts.map((draft) => draft.postId).filter(Boolean),
        sourceLegacyTable: "ideas",
      },
    ];
  });
  const allIdeas = [...v2Ideas, ...v2WorkflowIdeas];
  const ambiguous = v2Posts
    .filter((post) => post.providerState === "ambiguous")
    .map((post) => `posts:${post.legacyPostId ?? "(missing id)"}`);
  const imported = [
    ...v2Posts.map((post) => `posts:${post.legacyPostId ?? "(missing id)"}`),
    ...allIdeas.map((idea) => `${idea.sourceLegacyTable}:${idea.legacyIdeaId ?? "(missing id)"}`),
  ];

  return {
    generatedAt: new Date().toISOString(),
    mode: "dry-run",
    summary: {
      rawRecords:
        posts.length +
        capturedIdeas.length +
        capturedIdeaEntries.length +
        capturedIdeaPostLinks.length +
        workflowIdeas.length +
        workflowDrafts.length +
        settings.length,
      archivedPosts: posts.length,
      archivedIdeas: capturedIdeas.length,
      archivedIdeaEntries: capturedIdeaEntries.length,
      archivedIdeaPostLinks: capturedIdeaPostLinks.length,
      archivedWorkflowIdeas: workflowIdeas.length,
      archivedWorkflowDrafts: workflowDrafts.length,
      archivedSettings: settings.length,
      v2PostCandidates: v2Posts.length,
      v2IdeaCandidates: allIdeas.length,
      imported: imported.length,
      skipped: skipped.length,
      ambiguous: ambiguous.length,
      failed: 0,
      warnings: warnings.length,
    },
    archive: {
      posts,
      capturedIdeas,
      capturedIdeaEntries,
      capturedIdeaPostLinks,
      ideas: workflowIdeas,
      workflowDrafts,
      settings,
    },
    v2Candidates: { posts: v2Posts, ideas: allIdeas },
    records: {
      imported,
      skipped,
      ambiguous,
      failed: [],
    },
    warnings,
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const inputPath = path.resolve(options.input);
  const raw = JSON.parse(await readFile(inputPath, "utf8"));
  const plan = buildPlan(raw, options);
  const outPath = path.resolve(
    options.out ??
      `docs/archive/resonate-v1-migration-dry-run-${new Date().toISOString().slice(0, 10)}.json`
  );

  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, `${JSON.stringify(plan, null, 2)}\n`);
  console.log(
    JSON.stringify(
      {
        mode: plan.mode,
        output: outPath,
        summary: plan.summary,
        warnings: plan.warnings,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
