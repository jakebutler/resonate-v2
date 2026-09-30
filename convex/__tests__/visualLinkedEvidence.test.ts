// @vitest-environment node
/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { anyApi } from "convex/server";
import { describe, expect, it } from "vitest";
import schema from "../schema";
import { assertCurrentLinkedEvidence } from "../visualLinkedEvidence";

const modules = import.meta.glob("../**/*.ts");
const api = anyApi;
const table = "| label | value | unit | population | denominator | citation |\n|---|---|---|---|---|---|\n| Alpha | 12 | cases | Reviewed set | 80 labels | Fixture report Table 2 |\n| Beta | 20 | cases | Reviewed set | 80 labels | Fixture report Table 2 |";
async function setup() {
  const t = convexTest(schema, modules);
  await t.run(async ctx => {
    await ctx.db.insert("v2BrandMemberships", { userId: "linked-owner", brandId: "corvo", role: "owner", createdAt: 1, updatedAt: 1 });
  });
  const user = t.withIdentity({ subject: "linked-owner" });
  const brief = await user.mutation(api.research.saveResearchBrief, { brandId: "corvo", topic: "Fictional reviewed results", audience: "Fixture readers", thesis: "Compare exact stored results", depth: "standard", riskLevel: "low", targetOutputs: ["blog"], provider: "offline-fixture", sources: [{ id: "fixture-report", title: "Fictional report", url: "https://fictional.invalid/report", evidenceLabel: "primary-source", status: "accepted", raw: { excerpt: table, ignoredPrivatePayload: "DO NOT COPY RAW" } }] });
  const claimMap = await user.mutation(api.research.saveClaimMap, { researchBriefId: brief.researchBriefId, brandId: "corvo", topic: "Fictional results", thesis: "Exact reviewed comparison", provider: "offline-fixture", claims: [{ id: "reviewed-comparison", text: table, sourceIds: ["fixture-report"], evidenceLabel: "primary-source", confidence: "high", status: "accepted", raw: { unrelated: "DO NOT COPY CLAIM RAW" } }] });
  const { postId } = await user.mutation(api.publishing.createPostWithIntent, { brandId: "corvo", channelId: "corvo-blog", title: "LOCAL FIXTURE — Linked evidence", content: `## Results\n\n${table}`, sourceResearchBriefId: brief.researchBriefId });
  return { t, user, postId, briefId: brief.researchBriefId, claimMapId: claimMap.claimMapId };
}

describe("linked visual evidence", () => {
  it("applies linked freshness only to owned referenced sources when a publication supplies a bounded source list", async () => {
    const { t, user, postId, briefId } = await setup();
    const snapshot = await user.query(api.visualLinkedEvidence.getSnapshot, { postId });
    const saved = await user.mutation(api.visualLinkedEvidence.importLinkedEvidence, { postId, expectedSnapshotHash: snapshot.snapshotHash, expectedSourceId: null });
    const unrelated = await user.mutation(api.visualFigures.attachEvidence, { postId, key: "other-evidence", expectedSourceId: null, name: "Other.md", format: "markdown", purpose: "claim-trace", content: table });
    await t.run(async ctx => {
      const source = (await ctx.db.query("v2ResearchSources").withIndex("by_brief", q => q.eq("researchBriefId", briefId)).first())!;
      await ctx.db.patch(source._id, { status: "rejected", updatedAt: source.updatedAt + 1 });
    });
    await expect(t.run(async ctx => assertCurrentLinkedEvidence(ctx, (await ctx.db.get(postId))!, []))).resolves.toBeNull();
    await expect(t.run(async ctx => assertCurrentLinkedEvidence(ctx, (await ctx.db.get(postId))!, [unrelated.sourceId]))).resolves.toBeNull();
    await expect(t.run(async ctx => assertCurrentLinkedEvidence(ctx, (await ctx.db.get(postId))!, [saved.sourceId]))).rejects.toThrow("Linked evidence changed after import");
    await expect(t.run(async ctx => assertCurrentLinkedEvidence(ctx, (await ctx.db.get(postId))!, Array(7).fill(saved.sourceId)))).rejects.toThrow("At most six");
  });

  it("blocks the current-import read gate when accepted research changes before explicit reimport", async () => {
    const { t, user, postId, briefId } = await setup();
    const snapshot = await user.query(api.visualLinkedEvidence.getSnapshot, { postId });
    const saved = await user.mutation(api.visualLinkedEvidence.importLinkedEvidence, { postId, expectedSnapshotHash: snapshot.snapshotHash, expectedSourceId: null });
    expect(await user.query(api.visualLinkedEvidence.getCurrentImport, { postId })).toMatchObject({ sourceId: saved.sourceId, revision: 1, snapshotHash: snapshot.snapshotHash });
    await t.run(async ctx => {
      const source = (await ctx.db.query("v2ResearchSources").withIndex("by_brief", q => q.eq("researchBriefId", briefId)).first())!;
      await ctx.db.patch(source._id, { status: "rejected", updatedAt: source.updatedAt + 1 });
    });
    await expect(user.query(api.visualLinkedEvidence.getCurrentImport, { postId })).rejects.toThrow("Linked evidence changed after import");
    expect((await user.query(api.visualFigures.getSource, { sourceId: saved.sourceId })).content).toBe(snapshot.content);
  });

  it("returns null for routine missing or legacy unsupported links while retaining ownership checks", async () => {
    for (const link of ["unlinked", "legacy", "missing-persisted"] as const) {
      const { t, user, postId, briefId } = await setup();
      await t.run(async ctx => {
        if (link === "unlinked") await ctx.db.patch(postId, { sourceResearchBriefId: undefined });
        if (link === "legacy") await ctx.db.patch(postId, { sourceResearchBriefId: "brief-local-legacy-unpersisted" });
        if (link === "missing-persisted") await ctx.db.delete(briefId);
      });
      await expect(user.query(api.visualLinkedEvidence.getSnapshot, { postId })).resolves.toBeNull();
      await expect(t.withIdentity({ subject: "other-owner" }).query(api.visualLinkedEvidence.getSnapshot, { postId })).rejects.toThrow("Post not found");
    }
  });

  it("reuses only accepted public-safe exact passages from the saved post's owned attached campaign corpus", async () => {
    const { t, user, postId } = await setup();
    const fixture = await t.run(async ctx => {
      const corpusId = await ctx.db.insert("corpora", { brandId: "corvo", origin: "paste", version: 7, status: "active", createdAt: 1 });
      const documentId = await ctx.db.insert("corpusDocuments", { corpusId, name: "Stored fixture.md", kind: "md" });
      const excerptId = await ctx.db.insert("corpusExcerpts", { corpusId, documentId, seq: 1, text: table, provenance: "Local stored fixture passage", sensitivity: "public-safe", reviewState: "accepted" });
      const campaignId = await ctx.db.insert("campaigns", { userId: "linked-owner", brandId: "corvo", title: "Owned fixture campaign", status: "active", corpusIds: [corpusId], createdAt: 1, updatedAt: 1 });
      await ctx.db.patch(postId, { sourceResearchBriefId: undefined, sourceCampaignId: campaignId, sourceExcerptIds: [`corpus://corvo/${corpusId}#excerpt-1`] });
      return { corpusId, excerptId, campaignId };
    });
    const snapshot = await user.query(api.visualLinkedEvidence.getSnapshot, { postId });
    expect(snapshot.records).toEqual([expect.objectContaining({ kind: "corpus-excerpt", id: fixture.excerptId, eligible: true, status: "accepted", text: table })]);
    const imported = await user.mutation(api.visualLinkedEvidence.importLinkedEvidence, { postId, expectedSnapshotHash: snapshot.snapshotHash, expectedSourceId: null });
    expect((await user.mutation(api.visualFigures.planFigures, { postId })).candidateIds).toHaveLength(1);
    await t.run(ctx => ctx.db.patch(fixture.excerptId, { sensitivity: "internal-only" }));
    const internal = await user.query(api.visualLinkedEvidence.getSnapshot, { postId });
    expect(internal.records[0]).toMatchObject({ eligible: false, text: "" });
    expect(internal.content).not.toContain("Alpha");
    await expect(user.mutation(api.visualLinkedEvidence.importLinkedEvidence, { postId, expectedSnapshotHash: internal.snapshotHash, expectedSourceId: imported.sourceId })).rejects.toThrow("No accepted linked evidence");
    await t.run(ctx => ctx.db.patch(fixture.campaignId, { userId: "other-owner" }));
    await expect(user.query(api.visualLinkedEvidence.getSnapshot, { postId })).rejects.toThrow("Linked campaign is unavailable or unauthorized");
  });

  it("denies foreign posts, viewers, and foreign or cross-brand linked source chains without copying data", async () => {
    for (const change of ["foreign-post", "viewer", "foreign-brief", "wrong-brand-source", "foreign-map", "foreign-claim"] as const) {
      const { t, user, postId, briefId, claimMapId } = await setup();
      await t.run(async ctx => {
        if (change === "foreign-post") await ctx.db.patch(postId, { userId: "other-owner" });
        if (change === "viewer") {
          const membership = (await ctx.db.query("v2BrandMemberships").withIndex("by_user_and_brand", q => q.eq("userId", "linked-owner").eq("brandId", "corvo")).unique())!;
          await ctx.db.patch(membership._id, { role: "viewer" });
        }
        if (change === "foreign-brief") await ctx.db.patch(briefId, { userId: "other-owner" });
        if (change === "wrong-brand-source") {
          const source = (await ctx.db.query("v2ResearchSources").withIndex("by_brief", q => q.eq("researchBriefId", briefId)).first())!;
          await ctx.db.patch(source._id, { brandId: "lower-db" });
        }
        if (change === "foreign-map") await ctx.db.patch(claimMapId, { userId: "other-owner" });
        if (change === "foreign-claim") {
          const claim = (await ctx.db.query("v2Claims").withIndex("by_claim_map", q => q.eq("claimMapId", claimMapId)).first())!;
          await ctx.db.patch(claim._id, { userId: "other-owner" });
        }
      });
      if (change === "viewer") {
        const snapshot = await user.query(api.visualLinkedEvidence.getSnapshot, { postId });
        await expect(user.mutation(api.visualLinkedEvidence.importLinkedEvidence, { postId, expectedSnapshotHash: snapshot.snapshotHash, expectedSourceId: null })).rejects.toThrow("Linked evidence write access denied");
      } else await expect(user.query(api.visualLinkedEvidence.getSnapshot, { postId })).rejects.toThrow(/not found|unavailable|unauthorized|ambiguous/);
      expect(await t.run(ctx => ctx.db.query("v2FigureSources").collect())).toEqual([]);
    }
  });

  it("atomically rejects changed post links and claim/source review state after the viewed snapshot", async () => {
    for (const change of ["post-link", "claim-status", "source-status", "claim-text"] as const) {
      const { t, user, postId, briefId, claimMapId } = await setup();
      const snapshot = await user.query(api.visualLinkedEvidence.getSnapshot, { postId });
      await t.run(async ctx => {
        if (change === "post-link") {
          const brief = (await ctx.db.get(briefId))!;
          const { _id, _creationTime, ...fields } = brief; void _id; void _creationTime;
          const otherId = await ctx.db.insert("v2ResearchBriefs", { ...fields, topic: "Different explicitly linked research" });
          await ctx.db.patch(postId, { sourceResearchBriefId: otherId });
        } else if (change === "source-status") {
          const source = (await ctx.db.query("v2ResearchSources").withIndex("by_brief", q => q.eq("researchBriefId", briefId)).first())!;
          await ctx.db.patch(source._id, { status: "rejected", updatedAt: source.updatedAt + 1 });
        } else {
          const claim = (await ctx.db.query("v2Claims").withIndex("by_claim_map", q => q.eq("claimMapId", claimMapId)).first())!;
          await ctx.db.patch(claim._id, change === "claim-status" ? { status: "unsupported", updatedAt: claim.updatedAt + 1 } : { text: table.replace("12", "13"), updatedAt: claim.updatedAt + 1 });
        }
      });
      await expect(user.mutation(api.visualLinkedEvidence.importLinkedEvidence, { postId, expectedSnapshotHash: snapshot.snapshotHash, expectedSourceId: null })).rejects.toThrow("Linked research changed");
      expect(await t.run(ctx => ctx.db.query("v2FigureSources").collect())).toEqual([]);
    }
  });

  it("keeps reimport stable, creates immutable revisions and invalidates accepted figures after a reviewed source revision", async () => {
    const { t, user, postId, claimMapId } = await setup();
    const first = await user.query(api.visualLinkedEvidence.getSnapshot, { postId });
    const args = { postId, expectedSnapshotHash: first.snapshotHash, expectedSourceId: first.expectedSourceId };
    const imported = await user.mutation(api.visualLinkedEvidence.importLinkedEvidence, args);
    expect(await user.mutation(api.visualLinkedEvidence.importLinkedEvidence, args)).toEqual(imported);
    const plan = await user.mutation(api.visualFigures.planFigures, { postId });
    const candidate = await user.query(api.visualFigures.getCandidate, { candidateId: plan.candidateIds[0] });
    await user.mutation(api.visualFigures.acceptCandidate, { candidateId: candidate._id, expectedDataSignature: candidate.dataSignature, expectedPresentationSignature: candidate.presentationSignature });
    await t.run(async ctx => {
      await ctx.db.patch(postId, { approvalState: "approved" });
      const claim = (await ctx.db.query("v2Claims").withIndex("by_claim_map", q => q.eq("claimMapId", claimMapId)).first())!;
      await ctx.db.patch(claim._id, { text: table.replace("12", "13"), updatedAt: claim.updatedAt + 1 });
    });
    const next = await user.query(api.visualLinkedEvidence.getSnapshot, { postId });
    await expect(user.mutation(api.visualLinkedEvidence.importLinkedEvidence, { postId, expectedSnapshotHash: next.snapshotHash, expectedSourceId: null })).rejects.toThrow("Evidence changed");
    const revised = await user.mutation(api.visualLinkedEvidence.importLinkedEvidence, { postId, expectedSnapshotHash: next.snapshotHash, expectedSourceId: imported.sourceId });
    expect(revised.revision).toBe(2);
    expect((await user.query(api.visualFigures.getSource, { sourceId: imported.sourceId })).content).toBe(first.content);
    const current = await user.query(api.visualFigures.getWorkspace, { postId });
    expect(current.states[0].status).toBe("needs-review");
    expect((await user.query(api.publishing.getPostById, { postId })).approvalState).toBe("unapproved");
  });

  it("retains unreviewed and rejected records only for inspection and reports prose with no exact structured rows", async () => {
    const { t, user, postId, briefId, claimMapId } = await setup();
    await t.run(async ctx => {
      const source = (await ctx.db.query("v2ResearchSources").withIndex("by_brief", q => q.eq("researchBriefId", briefId)).first())!;
      await ctx.db.patch(source._id, { raw: { excerpt: "A generic reviewed passage without measurements." } });
      const claim = (await ctx.db.query("v2Claims").withIndex("by_claim_map", q => q.eq("claimMapId", claimMapId)).first())!;
      await ctx.db.patch(claim._id, { status: "unreviewed", text: "UNREVIEWED NUMBERS MUST NOT BECOME TRACE\n" + table });
    });
    const snapshot = await user.query(api.visualLinkedEvidence.getSnapshot, { postId });
    expect(snapshot.records.find((record: { kind: string }) => record.kind === "claim")).toMatchObject({ status: "unreviewed", eligible: false });
    expect(snapshot.content).not.toContain("UNREVIEWED NUMBERS");
    const imported = await user.mutation(api.visualLinkedEvidence.importLinkedEvidence, { postId, expectedSnapshotHash: snapshot.snapshotHash, expectedSourceId: null });
    expect((await user.query(api.visualFigures.getSource, { sourceId: imported.sourceId })).parseErrors).toContain("No exact structured rows in accepted linked content; text remains available for inspection");
    expect((await user.mutation(api.visualFigures.planFigures, { postId })).candidateIds).toEqual([]);
    await t.run(async ctx => {
      const source = (await ctx.db.query("v2ResearchSources").withIndex("by_brief", q => q.eq("researchBriefId", briefId)).first())!;
      await ctx.db.patch(source._id, { status: "rejected" });
    });
    const rejected = await user.query(api.visualLinkedEvidence.getSnapshot, { postId });
    expect(rejected.records.every((record: { eligible: boolean }) => !record.eligible)).toBe(true);
    await expect(user.mutation(api.visualLinkedEvidence.importLinkedEvidence, { postId, expectedSnapshotHash: rejected.snapshotHash, expectedSourceId: imported.sourceId })).rejects.toThrow("No accepted linked evidence");
  });

  it("reuses reviewed linked research as an immutable exact figure trace without raw payloads or new research", async () => {
    const { user, postId, briefId } = await setup();
    const snapshot = await user.query(api.visualLinkedEvidence.getSnapshot, { postId });
    expect(snapshot.records).toEqual(expect.arrayContaining([expect.objectContaining({ kind: "claim", status: "accepted", eligible: true, text: table }), expect.objectContaining({ kind: "source-excerpt", status: "accepted", eligible: true, text: table })]));
    expect(snapshot.content).toContain(table);
    expect(snapshot.content).toContain(briefId);
    expect(snapshot.content).not.toMatch(/DO NOT COPY/);
    const saved = await user.mutation(api.visualLinkedEvidence.importLinkedEvidence, { postId, expectedSnapshotHash: snapshot.snapshotHash, expectedSourceId: snapshot.expectedSourceId });
    expect(saved).toMatchObject({ revision: 1, snapshotHash: snapshot.snapshotHash });
    const source = await user.query(api.visualFigures.getSource, { sourceId: saved.sourceId });
    expect(source).toMatchObject({ key: "linked-research", content: snapshot.content, purpose: "claim-trace", format: "markdown" });
    expect(source.parseErrors).toEqual([]);
    expect((await user.mutation(api.visualFigures.planFigures, { postId })).candidateIds).toHaveLength(1);
  });
});
