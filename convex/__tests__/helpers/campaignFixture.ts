import { api } from "../../_generated/api";
import type { convexTest } from "convex-test";
import sharp from "sharp";

/**
 * Campaign fixture harness (spec deliverable C1): one call seeds a brand,
 * corpus, and a gate-passed, materialized campaign batch — the state the
 * campaign loop reaches after corpus → ideas → shape → drafts → gate →
 * materialize. The loop driver then carries the batch through per-draft
 * approval until `getCampaignQueue.allApproved`.
 *
 * Every step runs through the real public mutations (mock-ack gated where the
 * product gates it), so a fixture that builds is itself evidence the offline
 * lifecycle works end to end.
 */

export type FixtureIdentity = { subject: string; name: string };

export const FIXTURE_USER: FixtureIdentity = { subject: "user-fixture-jake", name: "Jake" };
export const FIXTURE_OTHER_USER: FixtureIdentity = {
  subject: "user-fixture-other",
  name: "Other Fixture User",
};

type TestHarness = ReturnType<typeof convexTest>;
type AsUser = ReturnType<TestHarness["withIdentity"]>;

export type CampaignFixtureOptions = {
  /** Default "corvo". */
  brandId?: string;
  /** Owner identity; default FIXTURE_USER. */
  user?: FixtureIdentity;
  /** Shape preset; default "standard" (pillar + hook + 2 satellites + recap). */
  preset?: "seed" | "standard" | "deep";
  title?: string;
};

export type FixtureQueueEntry = {
  postId: string;
  seq: number;
  role: string;
  channel: string;
  title: string;
  approvalState: string;
  status: string;
  scheduledDate: string | null;
  scheduledTime: string | null;
};

export type FixtureQueue = {
  queue: FixtureQueueEntry[];
  approvedCount: number;
  totalCount: number;
  nextSeq: number | null;
  allApproved: boolean;
  materialized: boolean;
  unreviewedCitationCount: number;
};

export type CampaignFixture = {
  t: TestHarness;
  asUser: AsUser;
  /** Second owner of the brand, for cross-user assertions. */
  otherUser: AsUser;
  brandId: string;
  campaignId: string;
  shapeId: string;
  corpusId: string;
  /** Materialized posts in slot-sequence order. */
  queue: FixtureQueue;
  gateRun: {
    passed: boolean;
    draftSetFingerprint?: string;
    blockingFailures: { id: string }[];
  };
  materialize: { materialized: boolean; draftCount?: number; unreviewedExcerptCount?: number; reason?: string };
};

/** Public-safe corpus excerpts; suggestIdeas quotes only these (D-17). */
function fixtureExcerpts() {
  return [1, 2, 3, 4, 5].map((n) => ({
    text: `Fixture finding ${n}: grounding drafts in cited excerpts reduces fact drift across channels.`,
    provenance: `p.${n}`,
    sensitivity: "public-safe" as const,
  }));
}

/**
 * One call from empty harness to a gate-passed, materialized batch. Throws
 * with the gate's blocking failures if the placeholder drafts do not pass —
 * a fixture must never silently hand a test a batch the gate would reject.
 */
export async function campaignFixture(
  t: TestHarness,
  options: CampaignFixtureOptions = {}
): Promise<CampaignFixture> {
  const user = options.user ?? FIXTURE_USER;
  const brandId = options.brandId ?? "corvo";
  const preset = options.preset ?? "standard";
  const title = options.title ?? "Verification campaign";
  const now = Date.now();

  await t.run(async (ctx) => {
    await ctx.db.insert("v2Brands", {
      brandId,
      name: `${brandId} brand`,
      description: "Campaign fixture brand",
      createdAt: now,
      updatedAt: now,
    });
    for (const identity of [user, FIXTURE_OTHER_USER]) {
      await ctx.db.insert("v2BrandMemberships", {
        userId: identity.subject,
        brandId,
        role: "owner",
        createdAt: now,
        updatedAt: now,
      });
    }
  });

  const asUser = t.withIdentity(user);
  const otherUser = t.withIdentity(FIXTURE_OTHER_USER);

  const corpus = await asUser.mutation(api.corpora.createCorpusVersion, {
    brandId,
    origin: "upload",
    documents: [{ name: "fixture-corpus.md", kind: "md", excerpts: fixtureExcerpts() }],
  });
  const corpusId = corpus.corpusId as never;

  const { campaignId } = await asUser.mutation(api.campaigns.createCampaign, {
    brandId,
    title,
  });
  await asUser.mutation(api.campaigns.attachCorpus, { campaignId, corpusId });

  // Mock-grounded suggestions (D-21): a server-issued token per generation.
  const suggestAck = await asUser.mutation(api.mockAck.requestMockAcknowledgment, { campaignId });
  await asUser.mutation(api.campaigns.suggestIdeas, {
    campaignId,
    mockAckToken: suggestAck.token,
  });

  // Promote the suggestions into the working set so the preset's default
  // linking fills every slot (D-11: incomplete slots block acceptance).
  const session = await asUser.query(api.campaigns.getCampaignSession, { campaignId });
  if (!session || session.suggested.length === 0) {
    throw new Error("campaignFixture: suggestIdeas produced no suggestions to promote.");
  }
  for (const entry of session.suggested) {
    await asUser.mutation(api.campaigns.addIdeaToCampaign, {
      campaignId,
      ideaId: entry.idea!._id as never,
    });
  }

  const { shapeId } = await asUser.mutation(api.shapes.proposeShape, { campaignId, preset });
  await asUser.mutation(api.shapes.acceptShape, { shapeId });

  const generateAck = await asUser.mutation(api.mockAck.requestMockAcknowledgment, { campaignId });
  await asUser.mutation(api.draftSet.generateDraftSet, {
    campaignId,
    mockAckToken: generateAck.token,
  });

  const gateRun = await asUser.mutation(api.cohesion.runCohesionGate, { campaignId });
  if (!gateRun.passed) {
    throw new Error(
      `campaignFixture: cohesion gate blocked the batch (${gateRun.blockingFailures
        .map((failure) => failure.id)
        .join(", ")})`
    );
  }

  const materialize = await asUser.mutation(api.queue.materializeDraftSet, { campaignId });

  const queue = (await asUser.query(api.queue.getCampaignQueue, { campaignId })) as FixtureQueue;

  return {
    t,
    asUser,
    otherUser,
    brandId,
    campaignId,
    shapeId: shapeId as never,
    corpusId,
    queue,
    gateRun,
    materialize,
  };
}

/**
 * Approves the materialized batch in slot-sequence order through the same
 * per-draft mutation the approval queue uses, until the campaign queue
 * reports every draft approved. Corvo-blog drafts first get the editorial
 * metadata review the approval mutation requires (the same preparation the
 * existing queue tests perform — excerpt, author, hero image, prepared hero).
 * Capped at one pass over the queue so a mutation that fails to flip approval
 * state surfaces as a named error, not an infinite loop.
 */
export async function driveCampaignToApproval(
  fixture: Pick<CampaignFixture, "asUser" | "campaignId" | "brandId">
): Promise<CampaignFixture["queue"]> {
  const { asUser, campaignId, brandId } = fixture;
  let queue = (await asUser.query(
    api.queue.getCampaignQueue,
    { campaignId: campaignId as never }
  )) as FixtureQueue;
  const reviewedBlogPosts = new Set<string>();
  for (let guard = 0; guard < queue.totalCount + 1; guard += 1) {
    if (queue.allApproved) return queue;
    const next = queue.queue.find((entry) => entry.approvalState !== "approved");
    if (!next) {
      throw new Error("driveCampaignToApproval: no next unapproved draft but allApproved is false.");
    }
    if (next.channel === "corvo-blog" && !reviewedBlogPosts.has(next.postId)) {
      await reviewBlogMetadata(asUser, brandId, next.postId);
      reviewedBlogPosts.add(next.postId);
    }
    await asUser.mutation(api.publishing.setApproval, {
      postId: next.postId as never,
      approvalState: "approved",
    });
    queue = (await asUser.query(
      api.queue.getCampaignQueue,
      { campaignId: campaignId as never }
    )) as FixtureQueue;
  }
  throw new Error(
    `driveCampaignToApproval: approval did not converge after ${queue.totalCount} steps (allApproved still false).`
  );
}

/**
 * Reviews the blog editorial metadata a corvo-blog draft needs before the
 * approval mutation will accept it: blog fields, a hero image upload, and a
 * reviewed prepared hero. Mirrors the preparation in convex/__tests__/queue.test.ts.
 * Needs Node >= 22: under Node 20 the jsdom crypto.subtle rejects the
 * ArrayBuffer the upload action receives (see PR #144's findings ledger).
 */
async function reviewBlogMetadata(
  asUser: AsUser,
  brandId: string,
  postId: string
): Promise<void> {
  const bytes = await sharp({
    create: { width: 1600, height: 900, channels: 3, background: "#345678" },
  }).png().toBuffer();
  const { storageId: source } = await asUser.action(api.v2Storage.uploadImage, {
    brandId: brandId as never,
    bytes: Uint8Array.from(bytes).buffer,
    contentType: "image/png",
    fileName: "SPECULATIVE-fixture-blog-hero.png",
  });
  await asUser.mutation(api.publishing.updateBlogMetadata, {
    postId: postId as never,
    metadata: {
      blogPublicationIntent: "draft",
      coverImageAlt: "Fixture blog hero",
      blogExcerpt: "Fixture excerpt",
      blogAuthor: "Editor",
      blogCategory: "strategy",
      blogTags: ["test"],
      heroImageStorageId: source,
    },
  });
  await asUser.action(api.blogHero.prepare, { postId: postId as never, crop: "centre" });
}
