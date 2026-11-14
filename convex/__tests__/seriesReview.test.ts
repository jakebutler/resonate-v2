import { describe, it, expect, vi, afterEach } from "vitest";
import { convexTest } from "convex-test";
import { createHash } from "node:crypto";
import schema from "../schema";
import { api } from "../_generated/api";
import { articleSignature, relevanceSignature, stableInputSignature } from "../../lib/visualWorkflow";
const modules = import.meta.glob("../**/*.ts");
afterEach(() => vi.restoreAllMocks());
async function fixture() {
  const t = convexTest(schema, modules);
  const user = t.withIdentity({ subject: "editor" });
  await user.mutation(api.publishing.seedMvpWorkspace, {});
  const seriesId = await user.mutation(api.series.create, {
    brandId: "corvo",
    title: "Exact 3-post review",
  });
  const ids = [];
  for (const channelId of ["corvo-blog", "linkedin", "linkedin"] as const) {
    ids.push(
      (
        await user.mutation(api.publishing.createPostWithIntent, {
          brandId: "corvo",
          channelId,
          title: `Final ${ids.length}`,
          content: `Complete 42% copy ${ids.length}.\nPreserved number 1234 and source https://example.com/evidence`,
          scheduledDate: "2030-10-07",
          scheduledTime: "09:00",
          timezone: "America/Los_Angeles",
        })
      ).postId,
    );
  }
  const [articleId, one, two] = ids;
  await user.mutation(api.series.attach, {
    seriesId,
    key: "one",
    articlePostId: articleId,
    companionPostIds: [one, two],
  });
  await t.run(async (ctx) => {
    const storageId = await ctx.storage.store(
      new Blob(["sanitized receipt fixture"]),
    );
    await ctx.db.patch(articleId, {
      blogExcerpt: "Exact excerpt",
      blogAuthor: "Fixture author",
      blogCategory: "Development",
      blogTags: ["fixture"],
      blogSlug: "exact-article",
      blogPublicationIntent: "draft",
      coverImageAlt: "Fixture still image",
      heroImageStorageId: storageId,
      preparedHero: {
        sourceStorageId: storageId,
        storageId,
        sha256: "fixture-sha",
        width: 1600,
        height: 900,
        byteLength: 25,
        mimeType: "image/webp",
        crop: "centre",
      },
    });
  });
  return { t, user, seriesId, articleId, one, two };
}
async function packet(
  f: Awaited<ReturnType<typeof fixture>>,
  postIds = [f.one, f.two],
) {
  await f.user.mutation(api.seriesReview.select, {
    seriesId: f.seriesId,
    postIds,
    expectedRevision: 0,
  });
  const id = await f.user.mutation(api.seriesReview.prepare, {
    seriesId: f.seriesId,
    expectedRevision: 1,
  });
  return id;
}
describe("selected immutable editorial approval", () => {
  it("stores full review and exactly two selected receipts while keeping the article untouched and held companions unsubmitted", async () => {
    const f = await fixture();
    const original = await f.t.run((ctx) => ctx.db.get(f.articleId));
    const fetch = vi.spyOn(globalThis, "fetch");
    const id = await packet(f);
    const review = await f.user.query(api.seriesReview.packet, {
      seriesId: f.seriesId,
    });
    expect(review.rows).toHaveLength(2);
    expect(review.rows[0].snapshot.finalContent).toContain("1234");
    expect(review.rows[0].snapshot.holds.length).toBeGreaterThan(0);
    expect(review.rows[0].snapshot.warnings).toContain(
      "No stored research/citation receipt: independently review factual claims before approving.",
    );
    expect(
      (
        await f.user.mutation(api.seriesReview.approve, {
          packetId: id,
          expectedSelectionRevision: 1,
        })
      ).approved,
    ).toBe(true);
    for (const postId of [f.one, f.two])
      expect((await f.t.run((ctx) => ctx.db.get(postId)))!.approvalState).toBe(
        "approved",
      );
    expect(await f.t.run((ctx) => ctx.db.get(f.articleId))).toEqual(original);
    const rows = await f.t.run((ctx) =>
      ctx.db.query("seriesReviewRows").collect(),
    );
    expect(rows.every((r) => r.actor === "editor" && r.approvedAt)).toBe(true);
    expect(
      await f.t.run((ctx) => ctx.db.query("v2PublishAttempts").collect()),
    ).toHaveLength(0);
    expect(fetch).not.toHaveBeenCalled();
    await f.user.mutation(api.publishing.updateContent, {
      postId: f.one,
      content: "Material corrected 43%",
    });
    expect((await f.t.run((ctx) => ctx.db.get(f.one)))!.approvalState).toBe(
      "unapproved",
    );
    expect((await f.t.run((ctx) => ctx.db.get(f.two)))!.approvalState).toBe(
      "approved",
    );
  });
  it("resolves source references and citations into readable display labels on the read path only", async () => {
    const f = await fixture();
    const ids = await f.t.run(async (ctx) => {
      const campaignId = await ctx.db.insert("campaigns", {
        userId: "editor",
        brandId: "corvo",
        title: "Freshproof launch campaign",
        status: "active",
        corpusIds: [],
        createdAt: 1,
        updatedAt: 1,
      });
      const ideaId = await ctx.db.insert("ideas", {
        userId: "editor",
        text: "Launch narrative idea",
        status: "idea",
        createdAt: 1,
        updatedAt: 1,
      });
      const briefId = await ctx.db.insert("v2ResearchBriefs", {
        userId: "editor",
        brandId: "corvo",
        topic: "Why verification receipts matter",
        audience: "Marketing team",
        thesis: "Receipts build trust",
        depth: "standard",
        riskLevel: "low",
        targetOutputs: ["post"],
        status: "outline-ready",
        provider: "fixture",
        createdAt: 1,
        updatedAt: 1,
      });
      const corpusId = await ctx.db.insert("corpora", {
        brandId: "corvo",
        origin: "paste",
        version: 7,
        status: "active",
        createdAt: 1,
      });
      const documentId = await ctx.db.insert("corpusDocuments", {
        corpusId,
        name: "Launch playbook",
        kind: "md",
      });
      await ctx.db.insert("corpusExcerpts", {
        corpusId,
        documentId,
        seq: 1,
        text: "One number or receipt only.",
        provenance: "fixture",
        sensitivity: "public-safe",
        reviewState: "accepted",
      });
      return { campaignId, ideaId, briefId, corpusId };
    });
    await f.t.run((ctx) =>
      ctx.db.patch(f.one, {
        sourceCampaignId: ids.campaignId,
        sourceIdeaId: ids.ideaId,
        sourceResearchBriefId: ids.briefId,
        sourceExcerptIds: [`corpus://corvo/${ids.corpusId}#excerpt-1`],
      }),
    );
    await packet(f, [f.one]);
    const view = await f.user.query(api.seriesReview.packet, {
      seriesId: f.seriesId,
    });
    const row = view.rows.find((r) => r.postId === f.one)!;
    expect(row.display.campaignTitle).toBe("Freshproof launch campaign");
    expect(row.display.ideaTitle).toBe("Launch narrative idea");
    expect(row.display.briefTopic).toBe("Why verification receipts matter");
    expect(row.display.citations).toEqual([
      {
        citation: `corpus://corvo/${ids.corpusId}#excerpt-1`,
        documentName: "Launch playbook",
        text: "One number or receipt only.",
      },
    ]);
    // Display labels are read-path only: renaming them cannot stale a packet.
    await f.t.run((ctx) => ctx.db.patch(ids.campaignId, { title: "Renamed" }));
    const still = await f.user.query(api.seriesReview.packet, {
      seriesId: f.seriesId,
    });
    const stillRow = still.rows.find((r) => r.postId === f.one)!;
    expect(stillRow.staleReason).toBeNull();
    expect(stillRow.display.campaignTitle).toBe("Renamed");
  });
  it.each([
    "copy",
    "selection",
    "membership",
    "ownership",
    "brand-access",
    "schedule",
  ])("writes zero approvals when %s changes", async (kind) => {
    const f = await fixture();
    const id = await packet(f);
    if (kind === "copy")
      await f.user.mutation(api.publishing.updateContent, {
        postId: f.two,
        content: "Changed",
      });
    if (kind === "selection")
      await f.user.mutation(api.seriesReview.select, {
        seriesId: f.seriesId,
        postIds: [f.one],
        expectedRevision: 1,
      });
    if (kind === "membership")
      await f.user.mutation(api.series.detach, {
        seriesId: f.seriesId,
        entryId: (
          await f.user.query(api.series.entries, {
            seriesId: f.seriesId,
            paginationOpts: { numItems: 10, cursor: null },
          })
        ).page[0]._id,
        postId: f.two,
      });
    if (kind === "ownership")
      await f.t.run((ctx) => ctx.db.patch(f.two, { userId: "other" }));
    if (kind === "brand-access")
      await f.t.run(async (ctx) => {
        const role = await ctx.db
          .query("v2BrandMemberships")
          .withIndex("by_user_and_brand", (q) =>
            q.eq("userId", "editor").eq("brandId", "corvo"),
          )
          .first();
        await ctx.db.delete(role!._id);
      });
    if (kind === "schedule")
      await f.user.mutation(api.publishing.reschedule, {
        postId: f.two,
        scheduledDate: "2030-10-08",
        scheduledTime: "09:00",
        timezone: "America/Los_Angeles",
      });
    if (kind === "brand-access")
      await expect(
        f.user.mutation(api.seriesReview.approve, {
          packetId: id,
          expectedSelectionRevision: 1,
        }),
      ).rejects.toThrow(/access/);
    else {
      const result = await f.user.mutation(api.seriesReview.approve, {
        packetId: id,
        expectedSelectionRevision: 1,
      });
      expect(result.approved).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    }
    for (const p of [f.one, f.two])
      expect((await f.t.run((ctx) => ctx.db.get(p)))!.approvalState).toBe(
        "unapproved",
      );
    expect(
      (
        await f.t.run((ctx) => ctx.db.query("seriesReviewRows").collect())
      ).every((row) => row.actor === undefined && row.approvedAt === undefined),
    ).toBe(true);
  });
  it("shows hero/alt/intent and source warnings, preserves receipts and date-only approvals, and rejects foreign packets/IDs", async () => {
    const f = await fixture();
    await f.t.run((ctx) =>
      ctx.db.patch(f.articleId, {
        sourceResearchBriefId: "unresolved-local-source",
      }),
    );
    const id = await packet(f, [f.articleId, f.one]);
    const view = await f.user.query(api.seriesReview.packet, {
      seriesId: f.seriesId,
    });
    expect(view.rows[0].snapshot.post.coverImageAlt).toBe(
      "Fixture still image",
    );
    expect(view.rows[0].snapshot.post.blogPublicationIntent).toBe("draft");
    expect(view.rows[0].heroUrl).toBeTruthy();
    expect(view.rows[0].snapshot.warnings).toContain(
      "Research brief is unavailable in this authorized workspace; review the original evidence.",
    );
    await f.user.mutation(api.seriesReview.approve, {
      packetId: id,
      expectedSelectionRevision: 1,
    });
    await f.user.mutation(api.publishing.reschedule, {
      postId: f.one,
      scheduledDate: "2030-10-08",
      scheduledTime: "10:00",
      timezone: "America/Los_Angeles",
    });
    expect((await f.t.run((ctx) => ctx.db.get(f.one)))!.approvalState).toBe(
      "approved",
    );
    expect(
      (await f.user.query(api.seriesReview.packet, { seriesId: f.seriesId }))
        .stale,
    ).toBe(true);
    const other = f.t.withIdentity({ subject: "other" });
    await expect(
      other.mutation(api.seriesReview.approve, {
        packetId: id,
        expectedSelectionRevision: 1,
      }),
    ).rejects.toThrow(/not found/);
    await expect(
      f.user.mutation(api.seriesReview.select, {
        seriesId: f.seriesId,
        postIds: [f.one, f.one],
        expectedRevision: 1,
      }),
    ).rejects.toThrow(/distinct/);
    const lower = (
      await f.user.mutation(api.publishing.createPostWithIntent, {
        brandId: "lower-db",
        channelId: "linkedin",
        title: "Other brand",
        content: "Owned outside series",
        timezone: "UTC",
      })
    ).postId;
    await expect(
      f.user.mutation(api.seriesReview.select, {
        seriesId: f.seriesId,
        postIds: [lower],
        expectedRevision: 1,
      }),
    ).rejects.toThrow(/mismatch/);
  });
  it("preserves delivery receipts/status while recording replay-safe approval and refuses viewers", async () => {
    const f = await fixture();
    await f.t.run((ctx) => ctx.db.patch(f.one, { status: "published" }));
    const before = await f.t.run((ctx) =>
      ctx.db.query("v2ProviderStates").collect(),
    );
    const id = await packet(f);
    await f.user.mutation(api.seriesReview.approve, {
      packetId: id,
      expectedSelectionRevision: 1,
    });
    expect((await f.t.run((ctx) => ctx.db.get(f.one)))!.status).toBe(
      "published",
    );
    expect(
      await f.t.run((ctx) => ctx.db.query("v2ProviderStates").collect()),
    ).toEqual(before);
    const again = await f.user.mutation(api.seriesReview.approve, {
      packetId: id,
      expectedSelectionRevision: 1,
    });
    expect(again.alreadyApproved).toBe(true);
    await f.t.run(async (ctx) => {
      const role = await ctx.db
        .query("v2BrandMemberships")
        .withIndex("by_user_and_brand", (q) =>
          q.eq("userId", "editor").eq("brandId", "corvo"),
        )
        .first();
      await ctx.db.patch(role!._id, { role: "viewer" });
    });
    await expect(
      f.user.mutation(api.publishing.setApproval, {
        postId: f.two,
        approvalState: "approved",
      }),
    ).rejects.toThrow(/Editor/);
  });
});

describe("visual-carrying batch approval", () => {
  /** Approved hero inserted straight into the visual workflow tables with every
   *  invariant buildPublicationVisuals/assertCurrentVisuals enforce, so the post
   *  is visual-carrying and its visual approval signature is computable. */
  async function withApprovedHero(
    f: Awaited<ReturnType<typeof fixture>>,
  ): Promise<void> {
    const { profileRevisionId } = await f.user.mutation(
      api.visualProfiles.saveRevision,
      {
        brandId: "corvo",
        expectedRevisionId: null,
        guidance: {
          artDirection: "Offline fixture direction",
          palette: [{ name: "Fixture teal", color: "#123456" }],
          mascotGuidance: "One raven",
          compositionGuidance: "Visible action",
          textPolicy: "No text",
          heroChartPolicy: "No charts",
        },
        referenceBindings: [],
        defaultRoute: { provider: "offline-fixture", model: "offline-fixture", qualification: "unqualified" },
      },
    );
    await f.t.run(async (ctx) => {
      const post = (await ctx.db.get(f.articleId))!;
      const pixels = new Uint8Array(8);
      const exportStorageId = await ctx.storage.store(
        new Blob([pixels], { type: "image/webp" }),
      );
      const storage = await ctx.db.system.get(exportStorageId);
      const hexHash = createHash("sha256").update(pixels).digest("hex");
      const exportMetadata = {
        width: 1600,
        height: 900,
        bytes: storage.size,
        format: "webp" as const,
        crop: "center",
      };
      const input = {
        article: {
          title: post.title,
          content: post.content,
          signature: articleSignature({ title: post.title, content: post.content }),
        },
        pins: { profileRevisionId, referenceIds: [], lessonIds: [], postExceptionId: null },
        references: [],
        scene: null,
        planId: null,
        parentVersionId: null,
        parentStorageId: null,
        prompt: "Offline fixture hero prompt",
        feedback: null,
        provider: "offline-fixture",
        model: "offline-fixture",
        size: "1600x900",
        outputFormat: "webp" as const,
      };
      const attemptId = await ctx.db.insert("v2VisualAttempts", {
        userId: post.userId,
        brandId: post.brandId,
        postId: f.articleId,
        stage: "generation",
        operationKey: "fixture-hero",
        input,
        inputSignature: stableInputSignature(input),
        status: "completed",
        quoteProvenance: "OFFLINE FIXTURE CONTRACT",
        createdAt: 1,
        updatedAt: 1,
      });
      const planId = await ctx.db.insert("v2VisualPlans", {
        userId: post.userId,
        brandId: post.brandId,
        postId: f.articleId,
        attemptId,
        input,
        scenes: [],
        status: "complete",
        reasons: [],
        createdAt: 1,
      });
      const quoteId = await ctx.db.insert("v2VisualDispatchQuotes", {
        attemptId,
        inputSignature: stableInputSignature(input),
        stage: "generation",
        provider: "offline-fixture",
        model: "offline-fixture",
        maximumMicros: 0,
        qualification: "offline-fixture",
        boundVerified: true,
        capabilityReceiptIds: [],
        provenance: "OFFLINE FIXTURE CONTRACT",
        createdAt: 1,
      });
      const versionId = await ctx.db.insert("v2VisualVersions", {
        userId: post.userId,
        brandId: post.brandId,
        postId: f.articleId,
        attemptId,
        planId,
        parentVersionId: null,
        feedback: null,
        input,
        storageId: exportStorageId,
        sha256: hexHash,
        contentType: "image/webp",
        width: 1600,
        height: 900,
        bytes: storage.size,
        provider: "offline-fixture",
        model: "offline-fixture",
        createdAt: 1,
        exportStorageId,
        exportHash: hexHash,
        approvedExportHash: hexHash,
        exportMetadata,
        approvedExportMetadataSignature: stableInputSignature(exportMetadata),
        approvedAlt: "Fixture approved hero",
        approvedBy: post.userId,
        approvedAt: 1,
        approvedRelevanceSignature: relevanceSignature({ title: post.title, content: post.content }),
      });
      await ctx.db.patch(attemptId, { quoteId, resultVersionId: versionId });
      await ctx.db.insert("v2VisualStates", {
        userId: post.userId,
        brandId: post.brandId,
        postId: f.articleId,
        selectedVersionId: versionId,
        updatedAt: 1,
      });
    });
  }

  it("approves a visual-carrying blog post through batch review", async () => {
    const f = await fixture();
    await withApprovedHero(f);
    const id = await packet(f, [f.articleId]);
    const result = await f.user.mutation(api.seriesReview.approve, {
      packetId: id,
      expectedSelectionRevision: 1,
    });
    expect(result.approved).toBe(true);
    expect(
      (await f.t.run((ctx) => ctx.db.get(f.articleId)))!.approvalState,
    ).toBe("approved");
  });

  it("fails closed when the packet row is missing its review signature", async () => {
    const f = await fixture();
    await withApprovedHero(f);
    const id = await packet(f, [f.articleId]);
    // Legacy row written before signatures were captured.
    await f.t.run(async (ctx) => {
      for (const row of await ctx.db
        .query("seriesReviewRows")
        .collect())
        await ctx.db.patch(row._id, { visualSignature: undefined });
    });
    await expect(
      f.user.mutation(api.seriesReview.approve, {
        packetId: id,
        expectedSelectionRevision: 1,
      }),
    ).rejects.toThrow(
      "Review the current article and visual snapshot before final approval",
    );
    expect(
      (await f.t.run((ctx) => ctx.db.get(f.articleId)))!.approvalState,
    ).toBe("unapproved");
  });

  it("fails closed when the visuals change after the packet was prepared", async () => {
    const f = await fixture();
    await withApprovedHero(f);
    const id = await packet(f, [f.articleId]);
    await f.t.run(async (ctx) => {
      const state = await ctx.db
        .query("v2VisualStates")
        .withIndex("by_post", (q) => q.eq("postId", f.articleId))
        .unique();
      const version = await ctx.db.get(state!.selectedVersionId!);
      await ctx.db.patch(version!._id, { approvedAlt: "Changed after review" });
    });
    await expect(
      f.user.mutation(api.seriesReview.approve, {
        packetId: id,
        expectedSelectionRevision: 1,
      }),
    ).rejects.toThrow("Reviewed visuals changed; reload before final approval");
    expect(
      (await f.t.run((ctx) => ctx.db.get(f.articleId)))!.approvalState,
    ).toBe("unapproved");
  });
});

describe("evidence-marker hold", () => {
  it("blocks batch approval of marker rows until they are explicitly confirmed", async () => {
    const f = await fixture();
    await f.t.run(async (ctx) => {
      await ctx.db.patch(f.one, {
        content:
          "Draft copy with a live placeholder [EVIDENCE: corpus://corvo/c1#excerpt-1].",
      });
    });
    const id = await packet(f);

    const review = await f.user.query(api.seriesReview.packet, {
      seriesId: f.seriesId,
    });
    const markerRow = review.rows.find((r: { postId: string }) => r.postId === f.one);
    expect(markerRow?.snapshot.requiresMarkerConfirmation).toBe(true);
    expect(markerRow?.snapshot.warnings).toContain(
      "Evidence markers remain in the final copy. Check the source passages and publication formatting.",
    );

    // The hold fails the row closed; nothing is approved as a side effect.
    const result = await f.user.mutation(api.seriesReview.approve, {
      packetId: id,
      expectedSelectionRevision: 1,
    });
    expect(result.approved).toBe(false);
    expect(result.errors).toEqual([
      {
        postId: f.one,
        reason:
          "Evidence markers remain in the final copy; confirm this row explicitly to approve it.",
      },
    ]);
    expect(
      (await f.t.run((ctx) => ctx.db.get(f.one)))!.approvalState,
    ).toBe("unapproved");

    // Confirming the marker row releases the hold and the approval lands.
    const confirmed = await f.user.mutation(api.seriesReview.approve, {
      packetId: id,
      expectedSelectionRevision: 1,
      markerConfirmations: [f.one],
    });
    expect(confirmed.approved).toBe(true);
    expect((await f.t.run((ctx) => ctx.db.get(f.one)))!.approvalState).toBe(
      "approved",
    );
  });
});
