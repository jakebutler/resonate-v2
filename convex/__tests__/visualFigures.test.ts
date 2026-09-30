// @vitest-environment node
/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import schema from "../schema";
import { api } from "../_generated/api";
import { hashVisualBytes } from "../../lib/visualProfile";
import { fingerprintPostContent } from "../../lib/domain";

const modules = import.meta.glob("../**/*.ts");
const OWNER = { subject: "figure-owner" }, FOREIGN = { subject: "figure-foreign" }, VIEWER = { subject: "figure-viewer" };
const figureApi = api.visualFigures;
const citedNumeric = (content: string) => content.split("\n").map(line => line.trim().startsWith("|") ? line + (line.includes("| value |") ? " citation |" : /^\|[-:| ]+\|$/u.test(line) ? "---|" : " Evaluation report, Table 2 |") : line).join("\n");
const content = citedNumeric("## Results\n\n| label | value | unit | population | denominator |\n|---|---|---|---|---|\n| Alpha | 12 | cases | Reviewed set | 80 labels |\n| Beta | 20 | cases | Reviewed set | 80 labels |");
async function harness(article = content) {
  const t = convexTest(schema, modules);
  await t.run(async ctx => {
    for (const [userId, brandId, role] of [[OWNER.subject, "corvo", "owner"], [FOREIGN.subject, "lower-db", "owner"], [VIEWER.subject, "corvo", "viewer"]] as const) {
      await ctx.db.insert("v2BrandMemberships", { userId, brandId, role, createdAt: Date.now(), updatedAt: Date.now() });
    }
  });
  const user = t.withIdentity(OWNER);
  const { postId } = await user.mutation(api.publishing.createPostWithIntent, { brandId: "corvo", channelId: "corvo-blog", title: "Evidence", content: article });
  return { t, user, postId };
}
describe("persistent evidence-bound figures", () => {
  it.each([
    { name: "published", status: "published", blogPrStatus: "merged" },
    { name: "pr-created", status: "pr-created", blogPrStatus: "open" },
    { name: "submitted", status: "submitted", blogPrStatus: "open" },
    { name: "merged", status: "draft", blogPrStatus: "merged" },
  ] as const)("rejects figure writes in $name lifecycle while preserving inspection and saved state", async lifecycle => {
    const article = "## Flow\n\n| from | to | relation |\n|---|---|---|\n| Reader | Editor | sends feedback |\n\n## Discussion\n\nUnrelated copy.";
    for (const operation of ["accept", "edit", "move", "remove", "attach", "plan", "decline"] as const) {
      const { t, user, postId } = await harness(article);
      const plan = await user.mutation(figureApi.planFigures, { postId });
      const candidate = await user.query(figureApi.getCandidate, { candidateId: plan.candidateIds[0] });
      const review = { candidateId: candidate._id, expectedDataSignature: candidate.dataSignature, expectedPresentationSignature: candidate.presentationSignature };
      if (operation === "move" || operation === "remove") await user.mutation(figureApi.acceptCandidate, review);
      await t.run(ctx => ctx.db.patch(postId, {
        status: lifecycle.status, blogPrStatus: lifecycle.blogPrStatus, approvalState: "approved",
        prUrl: "https://github.com/fictional/fixture/pull/1", branchName: "blog/fictional-lifecycle",
      }));
      const before = {
        post: await user.query(api.publishing.getPostById, { postId }),
        workspace: await user.query(figureApi.getWorkspace, { postId }),
        history: await user.query(figureApi.getReviewHistory, { postId }),
        publication: await user.query(figureApi.getPublicationFigures, { postId }),
      };
      const source = before.workspace.sources[0];
      expect(await user.query(figureApi.getSource, { sourceId: source._id })).toEqual(source);
      expect(await user.query(figureApi.getCandidate, { candidateId: candidate._id })).toEqual(candidate);
      const actions = {
        accept: () => user.mutation(figureApi.acceptCandidate, review),
        edit: () => user.mutation(figureApi.editCandidate, { ...review, palette: { background: "#ece9e2", ink: "#22272b", accent: "#c2612c" } }),
        move: () => user.mutation(figureApi.moveFigure, { ...review, insertionAnchor: "## Discussion" }),
        remove: () => user.mutation(figureApi.removeFigure, { candidateId: candidate._id }),
        attach: () => user.mutation(figureApi.attachEvidence, { postId, key: "lifecycle-evidence", expectedSourceId: null, name: "evidence.md", format: "markdown", purpose: "claim-trace", content: article }),
        plan: () => user.mutation(figureApi.planFigures, { postId }),
        decline: () => user.mutation(figureApi.declineCandidate, { candidateId: candidate._id }),
      };
      await expect(actions[operation]()).rejects.toThrow("Separate publishing transition required before figure changes");
      expect({
        post: await user.query(api.publishing.getPostById, { postId }),
        workspace: await user.query(figureApi.getWorkspace, { postId }),
        history: await user.query(figureApi.getReviewHistory, { postId }),
        publication: await user.query(figureApi.getPublicationFigures, { postId }),
      }).toEqual(before);
    }
  });

  it.each(["draft", "scheduled"] as const)("preserves permitted %s figure writes and scheduling metadata", async status => {
    const article = "## Flow\n\n| from | to | relation |\n|---|---|---|\n| Reader | Editor | sends feedback |\n\n## Discussion\n\nUnrelated copy.";
    const { t, user, postId } = await harness(article);
    const schedule = { scheduledDate: "2026-10-02", scheduledTime: "12:30", timezone: "America/Los_Angeles" };
    await t.run(ctx => ctx.db.patch(postId, { status, ...schedule }));
    await user.mutation(figureApi.attachEvidence, { postId, key: "lifecycle-evidence", expectedSourceId: null, name: "evidence.md", format: "markdown", purpose: "claim-trace", content: article });
    const plan = await user.mutation(figureApi.planFigures, { postId });
    const candidate = await user.query(figureApi.getCandidate, { candidateId: plan.candidateIds[0] });
    const review = (current: typeof candidate) => ({ candidateId: current._id, expectedDataSignature: current.dataSignature, expectedPresentationSignature: current.presentationSignature });
    await user.mutation(figureApi.acceptCandidate, review(candidate));
    const edited = await user.mutation(figureApi.editCandidate, { ...review(candidate), palette: { background: "#ece9e2", ink: "#22272b", accent: "#c2612c" } });
    expect(edited.candidateId).not.toBe(candidate._id);
    const editedCandidate = await user.query(figureApi.getCandidate, { candidateId: edited.candidateId });
    await user.mutation(figureApi.acceptCandidate, review(editedCandidate));
    const moved = await user.mutation(figureApi.moveFigure, { ...review(editedCandidate), insertionAnchor: "## Discussion" });
    expect(await user.query(figureApi.getPublicationFigures, { postId })).toHaveLength(1);
    await user.mutation(figureApi.removeFigure, { candidateId: moved.candidateId });
    expect(await user.query(figureApi.getPublicationFigures, { postId })).toEqual([]);
    const next = await user.mutation(figureApi.planFigures, { postId });
    await user.mutation(figureApi.declineCandidate, { candidateId: next.candidateIds[0] });
    expect((await user.query(figureApi.getWorkspace, { postId })).states[0].status).toBe("declined");
    expect(await user.query(api.publishing.getPostById, { postId })).toMatchObject({ status, ...schedule, content: article });
    expect((await user.query(figureApi.getReviewHistory, { postId })).map(event => event.decision)).toEqual(["declined", "removed", "moved", "accepted", "edited", "accepted"]);
  });

  it("rejects bare, malformed and case-variant internal figure protocols even when there are no accepted figures", async () => {
    const { user, postId } = await harness("No supported figure evidence.");
    for (const token of ["resonate-figure://", "resonate-figure://-x", "Resonate-Figure://bad", "resonate-figure:/bad", "resonate-figure:%2F%2Fbad"]) {
      await user.mutation(api.publishing.updateContent, { postId, content: `No supported figure evidence.\n\n![Unapproved](${token})` });
      await expect(user.query(figureApi.getPublicationFigures, { postId })).rejects.toThrow(/malformed|unapproved|ambiguous/);
    }
  });

  it("invalidates every bound figure when a trace head changes even if all represented table facts are unchanged", async () => {
    const article = content + "\n\n## Later results\n\n" + content.slice(content.indexOf("| label")).replaceAll("Alpha", "Gamma").replaceAll("Beta", "Delta");
    const { t, user, postId } = await harness(article);
    const imported = await user.mutation(figureApi.attachEvidence, { postId, key: "claim-trace", expectedSourceId: null, name: "trace.md", format: "markdown", purpose: "claim-trace", content: article });
    const plan = await user.mutation(figureApi.planFigures, { postId });
    const candidates = await Promise.all(plan.candidateIds.map(candidateId => user.query(figureApi.getCandidate, { candidateId })));
    for (const candidate of candidates) await user.mutation(figureApi.acceptCandidate, { candidateId: candidate._id, expectedDataSignature: candidate.dataSignature, expectedPresentationSignature: candidate.presentationSignature });
    await t.run(ctx => ctx.db.patch(postId, { approvalState: "approved" }));
    await user.mutation(figureApi.attachEvidence, { postId, key: "claim-trace", expectedSourceId: imported.sourceId, name: "trace.md", format: "markdown", purpose: "claim-trace", content: "Unrelated provenance note\n\n" + article });
    expect((await user.query(figureApi.getWorkspace, { postId })).states.every(state => state.status === "needs-review")).toBe(true);
    expect((await user.query(api.publishing.getPostById, { postId }))?.approvalState).toBe("unapproved");
    await expect(user.query(figureApi.getPublicationFigures, { postId })).rejects.toThrow(/review/);
    const first = candidates[0];
    await expect(user.mutation(figureApi.acceptCandidate, { candidateId: first._id, expectedDataSignature: first.dataSignature, expectedPresentationSignature: first.presentationSignature })).rejects.toThrow(/version|changed/);
    for (const candidate of candidates) await user.mutation(figureApi.removeFigure, { candidateId: candidate._id });
    expect(await user.query(figureApi.getPublicationFigures, { postId })).toEqual([]);
    const next = await user.mutation(figureApi.planFigures, { postId });
    expect(next.candidateIds).toHaveLength(2);
  });

  it("rebinds a semantic edit to exact evidence beyond the three proposed candidates and deduplicates equivalent table formatting", async () => {
    const tables = [0, 1, 2, 3].map(index => `## Flow ${index}\n\n| from | to | relation |\n|---|---|---|\n| Reader ${index} | Editor ${index} | feedback ${index} |`);
    const article = tables[0] + "\n\n## Repeated formatting\n\n|from|to|relation|\n|---|---|---|\n|Reader 0|Editor 0|feedback 0|\n\n" + tables.slice(1).join("\n\n");
    const { user, postId } = await harness(article);
    const plan = await user.mutation(figureApi.planFigures, { postId });
    const candidates = await Promise.all(plan.candidateIds.map(candidateId => user.query(figureApi.getCandidate, { candidateId })));
    expect(new Set(candidates.map(candidate => JSON.stringify(candidate.spec.rows))).size).toBe(3);
    const first = candidates[0];
    const edited = await user.mutation(figureApi.editCandidate, { candidateId: first._id, expectedDataSignature: first.dataSignature, expectedPresentationSignature: first.presentationSignature, rows: [["Reader 3", "Editor 3", "feedback 3"]] });
    expect((await user.query(figureApi.getCandidate, { candidateId: edited.candidateId })).spec.rows).toEqual([["Reader 3", "Editor 3", "feedback 3"]]);
    expect((await user.query(api.publishing.getPostById, { postId }))?.content).toBe(article);
  });

  it("keeps an accepted revision and final approval stable for an empty or identical edit", async () => {
    const { t, user, postId } = await harness("## Flow\n\n| from | to | relation |\n|---|---|---|\n| Reader | Editor | sends feedback |");
    const plan = await user.mutation(figureApi.planFigures, { postId });
    const candidate = await user.query(figureApi.getCandidate, { candidateId: plan.candidateIds[0] });
    const review = { candidateId: candidate._id, expectedDataSignature: candidate.dataSignature, expectedPresentationSignature: candidate.presentationSignature };
    await user.mutation(figureApi.acceptCandidate, review);
    await t.run(async ctx => {
      await ctx.db.patch(postId, { approvalState: "approved" });
      const intent = await ctx.db.query("v2PublishingIntents").withIndex("by_post", q => q.eq("postId", postId)).first();
      await ctx.db.patch(intent!._id, { approvalState: "approved" });
    });
    const history = await user.query(figureApi.getReviewHistory, { postId });
    expect(await user.mutation(figureApi.editCandidate, review)).toEqual({ candidateId: candidate._id });
    expect(await user.mutation(figureApi.editCandidate, { ...review, rows: candidate.spec.rows, palette: { background: candidate.spec.presentation.background, ink: candidate.spec.presentation.ink, accent: candidate.spec.presentation.accent }, insertionAnchor: candidate.spec.insertionAnchor })).toEqual({ candidateId: candidate._id });
    expect((await user.query(api.publishing.getPostById, { postId }))?.approvalState).toBe("approved");
    expect((await user.query(figureApi.getWorkspace, { postId })).states[0].status).toBe("accepted");
    expect(await user.query(figureApi.getReviewHistory, { postId })).toEqual(history);
    expect(await t.run(ctx => ctx.db.query("v2FigureCandidates").withIndex("by_post", q => q.eq("postId", postId)).take(4))).toHaveLength(1);
  });

  it("inserts source-derived captions as literal paragraphs even when a population starts with Markdown block markers", async () => {
    for (const population of ["~~~ Corpus", "- Corpus", "+ Corpus", "= Corpus", "> Corpus", "1. Corpus"]) {
      const article = content.replaceAll("Reviewed set", population);
      const { user, postId } = await harness(article);
      await user.mutation(figureApi.attachEvidence, { postId, key: "claim-trace", expectedSourceId: null, name: "trace.md", format: "markdown", purpose: "claim-trace", content: article });
      const plan = await user.mutation(figureApi.planFigures, { postId });
      const candidate = await user.query(figureApi.getCandidate, { candidateId: plan.candidateIds[0] });
      await user.mutation(figureApi.acceptCandidate, { candidateId: candidate._id, expectedDataSignature: candidate.dataSignature, expectedPresentationSignature: candidate.presentationSignature });
      const inserted = (await user.query(api.publishing.getPostById, { postId }))!.content;
      expect(inserted).not.toMatch(/\n\n(?:~~~ Corpus|- Corpus|\+ Corpus|= Corpus|> Corpus|1\. Corpus)/u);
      expect(await user.query(figureApi.getPublicationFigures, { postId })).toHaveLength(1);
      await user.mutation(figureApi.removeFigure, { candidateId: candidate._id });
      expect((await user.query(api.publishing.getPostById, { postId }))?.content).toBe(article);
    }
  });

  it("rejects structural anchors and revalidates accepted sibling evidence atomically before figure writes", async () => {
    const article = "## Flow\n\n| from | to | relation |\n|---|---|---|\n| Reader | Editor | sends feedback |\n\n## Timeline\n\n| date | event |\n|---|---|\n| 2026-01-01 | Draft |\n| 2026-02-01 | Review |\n\n## Discussion\n\nUnrelated copy.\n\n| name | note |\n|---|---|\n| Ordinary | Unsuitable anchor |\n\n- List item\n\n```text\nCode anchor\n```\n\n<!--\nComment anchor\n-->\n\n<div>\nHTML anchor\n</div>";
    const { t, user, postId } = await harness(article);
    const plan = await user.mutation(figureApi.planFigures, { postId });
    const first = await user.query(figureApi.getCandidate, { candidateId: plan.candidateIds[0] });
    const second = await user.query(figureApi.getCandidate, { candidateId: plan.candidateIds[1] });
    const review = (candidate: typeof first) => ({ candidateId: candidate._id, expectedDataSignature: candidate.dataSignature, expectedPresentationSignature: candidate.presentationSignature });
    await user.mutation(figureApi.acceptCandidate, review(first));
    for (const insertionAnchor of ["| Reader | Editor | sends feedback |", "| Ordinary | Unsuitable anchor |", "- List item", "```text", "Code anchor", "<!--", "Comment anchor", "<div>", "HTML anchor"]) {
      await expect(user.mutation(figureApi.editCandidate, { ...review(second), insertionAnchor })).rejects.toThrow(/top-level|structure|table|safe insertion/);
    }
    await user.mutation(figureApi.acceptCandidate, review(second));
    const inserted = (await user.query(api.publishing.getPostById, { postId }))!.content;
    await expect(user.mutation(figureApi.moveFigure, { ...review(second), insertionAnchor: "Code anchor" })).rejects.toThrow(/top-level|structure|safe insertion/);
    expect((await user.query(api.publishing.getPostById, { postId }))!.content).toBe(inserted);
    const changed = inserted.replace("| Reader | Editor | sends feedback |", "| Reader | Editor | causes approval |");
    await t.run(ctx => ctx.db.patch(postId, { content: changed }));
    await expect(user.mutation(figureApi.moveFigure, { ...review(second), insertionAnchor: "## Discussion" })).rejects.toThrow(/Sibling figure evidence/);
    expect((await user.query(api.publishing.getPostById, { postId }))!.content).toBe(changed);
    await user.mutation(api.publishing.updateContent, { postId, content: changed });
    expect((await user.query(figureApi.getWorkspace, { postId })).states.find(state => state.selectedCandidateId === first._id)?.status).toBe("needs-review");
    await user.mutation(figureApi.removeFigure, { candidateId: first._id });
    expect(await user.query(figureApi.getPublicationFigures, { postId })).toHaveLength(1);
  });

  it("returns no public candidates when a reader-visible numeric table contains a row the strict parser cannot represent", async () => {
    const complete = content + "\n| Gamma | 30 | cases | Reviewed set | 80 labels | Evaluation report, Table 2 |\n| Delta | 40 | cases | Reviewed set | 80 labels | Evaluation report, Table 2 |";
    const row = "| Gamma | 30 | cases | Reviewed set | 80 labels | Evaluation report, Table 2 |";
    for (const broken of [row.slice(0, -1), row.slice(1), row.replace("Gamma", "Gamma\\|Other")]) {
      const article = complete.replace(row, broken);
      const { user, postId } = await harness(article);
      await user.mutation(figureApi.attachEvidence, { postId, key: "claim-trace", expectedSourceId: null, name: "trace.md", format: "markdown", purpose: "claim-trace", content: article });
      const plan = await user.mutation(figureApi.planFigures, { postId });
      expect(plan.candidateIds).toEqual([]);
      expect(plan.reasons.join(" ")).toMatch(/complete table|blank line|unsupported table row/);
      expect((await user.query(api.publishing.getPostById, { postId }))?.content).toBe(article);
    }
  });

  it("denies foreign and viewer mutations across figure APIs and rejects unknown or duplicate article tokens", async () => {
    const article = "## Flow\n\n| from | to | relation |\n|---|---|---|\n| Reader | Editor | sends feedback |";
    const { t, user, postId } = await harness(article);
    const plan = await user.mutation(figureApi.planFigures, { postId });
    const candidate = await user.query(figureApi.getCandidate, { candidateId: plan.candidateIds[0] });
    const review = { candidateId: candidate._id, expectedDataSignature: candidate.dataSignature, expectedPresentationSignature: candidate.presentationSignature };
    const foreign = t.withIdentity(FOREIGN);
    for (const action of [() => foreign.mutation(figureApi.planFigures, { postId }), () => foreign.query(figureApi.getWorkspace, { postId }), () => foreign.query(figureApi.getPublicationFigures, { postId }), () => foreign.query(figureApi.getReviewHistory, { postId }), () => foreign.mutation(figureApi.acceptCandidate, review), () => foreign.mutation(figureApi.editCandidate, review), () => foreign.mutation(figureApi.moveFigure, { ...review, insertionAnchor: "## Flow" }), () => foreign.mutation(figureApi.removeFigure, { candidateId: candidate._id })]) await expect(action()).rejects.toThrow(/Post not found/);
    await user.mutation(figureApi.acceptCandidate, review);
    const inserted = (await user.query(api.publishing.getPostById, { postId }))!.content;
    await user.mutation(api.publishing.updateContent, { postId, content: inserted + "\n\n![Unapproved](resonate-figure://unknownID)" });
    await expect(user.query(figureApi.getPublicationFigures, { postId })).rejects.toThrow(/unapproved or ambiguous/);
    await user.mutation(api.publishing.updateContent, { postId, content: inserted + `\n\n![Duplicate](resonate-figure://${candidate._id})` });
    await expect(user.query(figureApi.getPublicationFigures, { postId })).rejects.toThrow(/unapproved or ambiguous/);
    await user.mutation(api.publishing.updateContent, { postId, content: inserted.replace("sends feedback", "causes approval") });
    expect((await user.query(figureApi.getWorkspace, { postId })).states[0].status).toBe("needs-review");
    expect((await user.query(api.publishing.getPostById, { postId }))?.approvalState).toBe("unapproved");
    await t.run(ctx => ctx.db.patch(postId, { userId: VIEWER.subject }));
    const viewer = t.withIdentity(VIEWER);
    for (const action of [() => viewer.mutation(figureApi.planFigures, { postId }), () => viewer.mutation(figureApi.acceptCandidate, review), () => viewer.mutation(figureApi.editCandidate, review), () => viewer.mutation(figureApi.moveFigure, { ...review, insertionAnchor: "## Flow" }), () => viewer.mutation(figureApi.removeFigure, { candidateId: candidate._id })]) await expect(action()).rejects.toThrow(/write access denied/);
  });

  it("supersedes prior unused proposals and preserves immutable review decisions without implicitly reviving declined figures", async () => {
    const { user, postId } = await harness("## Flow\n\n| from | to | relation |\n|---|---|---|\n| Reader | Editor | sends feedback |");
    const oldPlan = await user.mutation(figureApi.planFigures, { postId });
    const old = await user.query(figureApi.getCandidate, { candidateId: oldPlan.candidateIds[0] });
    const next = await user.mutation(figureApi.planFigures, { postId });
    await expect(user.mutation(figureApi.acceptCandidate, { candidateId: old._id, expectedDataSignature: old.dataSignature, expectedPresentationSignature: old.presentationSignature })).rejects.toThrow(/superseded/);
    const selected = await user.query(figureApi.getCandidate, { candidateId: next.candidateIds[0] });
    await user.mutation(figureApi.declineCandidate, { candidateId: selected._id });
    await expect(user.mutation(figureApi.editCandidate, { candidateId: selected._id, expectedDataSignature: selected.dataSignature, expectedPresentationSignature: selected.presentationSignature, palette: { background: "#ECE9E2", ink: "#22272B", accent: "#C2612C" } })).rejects.toThrow(/declined/);
    const history = await user.query(figureApi.getReviewHistory, { postId });
    expect(history.map(event => event.decision).sort()).toEqual(["declined", "superseded"]);
    expect(history.every(event => event.actorId === OWNER.subject && /^[a-f0-9]{64}$/u.test(event.postContentSha256))).toBe(true);
    expect((await user.query(api.publishing.getPostById, { postId }))?.content).not.toContain("resonate-figure://");
  });

  it("binds the publication manifest to the exact article and immutable/current evidence revisions plus acceptance provenance", async () => {
    const { user, postId } = await harness();
    const trace = await user.mutation(figureApi.attachEvidence, { postId, key: "claim-trace", expectedSourceId: null, name: "private-trace.md", format: "markdown", purpose: "claim-trace", content });
    const plan = await user.mutation(figureApi.planFigures, { postId });
    const candidate = await user.query(figureApi.getCandidate, { candidateId: plan.candidateIds[0] });
    await user.mutation(figureApi.acceptCandidate, { candidateId: candidate._id, expectedDataSignature: candidate.dataSignature, expectedPresentationSignature: candidate.presentationSignature });
    const snapshot = await user.query(api.publishing.getPostById, { postId });
    const [figure] = await user.query(figureApi.getPublicationFigures, { postId });
    expect(figure.postId).toBe(postId);
    expect(figure.postContentSha256).toBe(await hashVisualBytes(new TextEncoder().encode(snapshot!.content).buffer));
    expect(figure.postContentFingerprint).toBe(fingerprintPostContent({ title: snapshot!.title, content: snapshot!.content, linkedinFirstComment: snapshot!.linkedinFirstComment }));
    expect(figure.acceptedBy).toBe(OWNER.subject);
    expect(figure.acceptedAt).toEqual(expect.any(Number));
    expect(figure.evidenceSources.find(source => source.purpose === "article")?.currentSha256).toBe(figure.postContentSha256);
    const source = await user.query(figureApi.getSource, { sourceId: trace.sourceId });
    expect(figure.evidenceSources.find(source => source.purpose === "claim-trace")).toEqual({ sourceId: source._id, sha256: source.sha256, revision: 1, purpose: "claim-trace", currentSourceId: source._id, currentSha256: source.sha256, currentRevision: 1 });
  });

  it("rejects self-colliding, partial-line and sibling anchors atomically", async () => {
    const article = "## Flow\n\n| from | to | relation |\n|---|---|---|\n| Reader | Editor | sends feedback |\n\n## Timeline\n\n| date | event |\n|---|---|\n| 2026-01-01 | Draft |\n| 2026-02-01 | Review |\n\nEach arrow represents the relationship stated in its source row.";
    const { user, postId } = await harness(article);
    const plan = await user.mutation(figureApi.planFigures, { postId });
    const first = await user.query(figureApi.getCandidate, { candidateId: plan.candidateIds[0] });
    const review = (candidate: typeof first) => ({ candidateId: candidate._id, expectedDataSignature: candidate.dataSignature, expectedPresentationSignature: candidate.presentationSignature });
    const self = await user.mutation(figureApi.editCandidate, { ...review(first), insertionAnchor: first.spec.presentation.caption });
    const selfCandidate = await user.query(figureApi.getCandidate, { candidateId: self.candidateId });
    await expect(user.mutation(figureApi.acceptCandidate, review(selfCandidate))).rejects.toThrow(/anchor.*exactly once/);
    await expect(user.mutation(figureApi.editCandidate, { ...review(selfCandidate), insertionAnchor: "arrow represents" })).rejects.toThrow(/whole line/);
    const reset = await user.mutation(figureApi.editCandidate, { ...review(selfCandidate), insertionAnchor: "## Flow" });
    const current = await user.query(figureApi.getCandidate, { candidateId: reset.candidateId });
    await user.mutation(figureApi.acceptCandidate, review(current));
    const inserted = (await user.query(api.publishing.getPostById, { postId }))!.content;
    const second = await user.query(figureApi.getCandidate, { candidateId: plan.candidateIds[1] });
    const collision = await user.mutation(figureApi.editCandidate, { ...review(second), insertionAnchor: "## Flow" });
    const colliding = await user.query(figureApi.getCandidate, { candidateId: collision.candidateId });
    await expect(user.mutation(figureApi.acceptCandidate, review(colliding))).rejects.toThrow(/another.*figure|already used/);
    expect((await user.query(api.publishing.getPostById, { postId }))!.content).toBe(inserted);
    expect(await user.query(figureApi.getPublicationFigures, { postId })).toHaveLength(1);
  });

  it("recovers explicit removal and reinsertion after a manually deleted block, while rejecting partial or duplicate tokens", async () => {
    const article = "## Flow\n\n| from | to | relation |\n|---|---|---|\n| Reader | Editor | sends feedback |";
    const { user, postId } = await harness(article);
    const plan = await user.mutation(figureApi.planFigures, { postId });
    const candidate = await user.query(figureApi.getCandidate, { candidateId: plan.candidateIds[0] });
    const reviewed = { candidateId: candidate._id, expectedDataSignature: candidate.dataSignature, expectedPresentationSignature: candidate.presentationSignature };
    await user.mutation(figureApi.acceptCandidate, reviewed);
    await user.mutation(api.publishing.updateContent, { postId, content: article });
    expect((await user.query(figureApi.getWorkspace, { postId })).states[0].status).toBe("needs-review");
    await user.mutation(figureApi.acceptCandidate, reviewed);
    expect(await user.query(figureApi.getPublicationFigures, { postId })).toHaveLength(1);
    await user.mutation(api.publishing.updateContent, { postId, content: article + `\n\n![Changed](resonate-figure://${candidate._id})` });
    await expect(user.mutation(figureApi.removeFigure, { candidateId: candidate._id })).rejects.toThrow(/partial or duplicate/);
    await user.mutation(api.publishing.updateContent, { postId, content: article });
    await user.mutation(figureApi.removeFigure, { candidateId: candidate._id });
    expect((await user.query(api.publishing.getPostById, { postId }))?.content).toBe(article);
    expect((await user.query(figureApi.getWorkspace, { postId })).states[0].status).toBe("removed");
    expect(await user.query(figureApi.getPublicationFigures, { postId })).toEqual([]);
  });

  it("reloads the selected edited revision of an unused proposal rather than resurfacing its superseded original", async () => {
    const { user, postId } = await harness("## Flow\n\n| from | to | relation |\n|---|---|---|\n| Reader | Editor | sends feedback |");
    const plan = await user.mutation(figureApi.planFigures, { postId });
    const original = await user.query(figureApi.getCandidate, { candidateId: plan.candidateIds[0] });
    const edited = await user.mutation(figureApi.editCandidate, {
      candidateId: original._id, expectedDataSignature: original.dataSignature, expectedPresentationSignature: original.presentationSignature,
      palette: { background: "#ECE9E2", ink: "#22272B", accent: "#C2612C" },
    });
    const reload = await user.query(figureApi.getWorkspace, { postId });
    expect(reload.candidates.map(candidate => candidate._id)).toEqual([edited.candidateId]);
    expect(reload.states[0].selectedCandidateId).toBe(edited.candidateId);
    expect(reload.states[0].status).toBe("proposed");
  });
  it("limits all families together, preserves inserted candidates on rerun, and omits repeated representations", async () => {
    const article = content + "\n\n## Flow\n\n| from | to | relation |\n|---|---|---|\n| Reader | Editor | sends feedback |\n\n## Sequence\n\n| order | from | to | message |\n|---|---|---|---|\n| 1 | Reader | Editor | Feedback |\n| 2 | Editor | Reader | Reply |\n\n## Timeline\n\n| date | event |\n|---|---|\n| 2026-01-01 | Draft |\n| 2026-02-01 | Review |";
    const { user, postId } = await harness(article);
    await user.mutation(figureApi.attachEvidence, { postId, key: "claim-trace", expectedSourceId: null, name: "trace.md", format: "markdown", purpose: "claim-trace", content });
    const firstPlan = await user.mutation(figureApi.planFigures, { postId });
    expect(firstPlan.candidateIds).toHaveLength(3);
    const first = await user.query(figureApi.getCandidate, { candidateId: firstPlan.candidateIds[0] });
    await user.mutation(figureApi.acceptCandidate, { candidateId: first._id, expectedDataSignature: first.dataSignature, expectedPresentationSignature: first.presentationSignature });
    const acceptedContent = (await user.query(api.publishing.getPostById, { postId }))!.content;
    const secondPlan = await user.mutation(figureApi.planFigures, { postId });
    expect(secondPlan.candidateIds).toHaveLength(2);
    const workspace = await user.query(figureApi.getWorkspace, { postId });
    expect(workspace.candidates.filter(candidate => secondPlan.candidateIds.includes(candidate._id)).map(candidate => candidate.spec.family)).toEqual(["flow", "sequence"]);
    expect(workspace.candidates).toHaveLength(3);
    expect((await user.query(api.publishing.getPostById, { postId }))?.content).toBe(acceptedContent);
    expect((await user.query(figureApi.getPublicationFigures, { postId }))[0].candidateId).toBe(first._id);
  });
  it("creates immutable evidence-validated edits, requires review, and moves or removes only the selected inserted revision", async () => {
    const article = content + "\n\n## Discussion\n\nRead the results carefully.";
    const { user, postId } = await harness(article);
    await user.mutation(figureApi.attachEvidence, { postId, key: "claim-trace", expectedSourceId: null, name: "trace.md", format: "markdown", purpose: "claim-trace", content });
    const plan = await user.mutation(figureApi.planFigures, { postId });
    const first = await user.query(figureApi.getCandidate, { candidateId: plan.candidateIds[0] });
    const reviewed = { candidateId: first._id, expectedDataSignature: first.dataSignature, expectedPresentationSignature: first.presentationSignature };
    await user.mutation(figureApi.acceptCandidate, reviewed);
    await expect(user.mutation(figureApi.editCandidate, { ...reviewed, rows: [["Invented", "90", "cases", "Reviewed set", "80 labels"]] })).rejects.toThrow(/exact current article evidence/);
    const edit = await user.mutation(figureApi.editCandidate, { ...reviewed, palette: { background: "#ECE9E2", ink: "#22272B", accent: "#C2612C" } });
    expect(edit.candidateId).not.toBe(first._id);
    expect((await user.query(figureApi.getCandidate, { candidateId: first._id })).svgSha256).toBe(first.svgSha256);
    await expect(user.query(figureApi.getPublicationFigures, { postId })).rejects.toThrow(/review/);
    const second = await user.query(figureApi.getCandidate, { candidateId: edit.candidateId });
    const secondReview = { candidateId: second._id, expectedDataSignature: second.dataSignature, expectedPresentationSignature: second.presentationSignature };
    await user.mutation(figureApi.acceptCandidate, secondReview);
    const moved = await user.mutation(figureApi.moveFigure, { ...secondReview, insertionAnchor: "## Discussion" });
    const afterMove = (await user.query(api.publishing.getPostById, { postId }))!.content;
    expect(afterMove.indexOf(`resonate-figure://${moved.candidateId}`)).toBeGreaterThan(afterMove.indexOf("## Discussion"));
    expect(await user.query(figureApi.getPublicationFigures, { postId })).toHaveLength(1);
    await user.mutation(figureApi.removeFigure, { candidateId: moved.candidateId });
    expect((await user.query(api.publishing.getPostById, { postId }))?.content).toBe(article);
    expect(await user.query(figureApi.getPublicationFigures, { postId })).toEqual([]);
    expect((await user.query(figureApi.getCandidate, { candidateId: first._id })).svgSha256).toBe(first.svgSha256);
  });
  it("requires current source evidence and unique insertion anchors, preserving unrelated copy edits but clearing approval on represented data edits", async () => {
    const { t, user, postId } = await harness();
    const attached = await user.mutation(figureApi.attachEvidence, {
      postId, key: "claim-trace", expectedSourceId: null, name: "trace.md", format: "markdown", purpose: "claim-trace", content,
    });
    const plan = await user.mutation(figureApi.planFigures, { postId });
    const preview = await user.query(figureApi.getCandidate, { candidateId: plan.candidateIds[0] });
    const review = { candidateId: preview._id, expectedDataSignature: preview.dataSignature, expectedPresentationSignature: preview.presentationSignature };
    await expect(user.mutation(figureApi.acceptCandidate, { ...review, expectedPresentationSignature: "stale" })).rejects.toThrow(/preview changed/);
    await t.run(ctx => ctx.db.patch(postId, { content: content + "\n\n## Results" }));
    await expect(user.mutation(figureApi.acceptCandidate, review)).rejects.toThrow(/anchor.*exactly once/);
    await t.run(ctx => ctx.db.patch(postId, { content }));
    await user.mutation(figureApi.acceptCandidate, review);
    const inserted = (await user.query(api.publishing.getPostById, { postId }))!.content;
    await user.mutation(api.publishing.updateContent, { postId, content: "Unrelated introduction\n\n" + inserted });
    expect(await user.query(figureApi.getPublicationFigures, { postId })).toHaveLength(1);
    await t.run(ctx => ctx.db.patch(postId, { approvalState: "approved" }));
    await user.mutation(figureApi.attachEvidence, {
      postId, key: "claim-trace", expectedSourceId: attached.sourceId, name: "trace.md", format: "markdown", purpose: "claim-trace", content: content.replace("12", "13"),
    });
    await expect(user.query(figureApi.getPublicationFigures, { postId })).rejects.toThrow(/review|evidence changed/);
    expect((await user.query(api.publishing.getPostById, { postId }))?.approvalState).toBe("unapproved");
    expect((await user.query(figureApi.getWorkspace, { postId })).states[0].status).toBe("needs-review");
  });
  it("inserts only an explicitly accepted current candidate with caption and source, while declining changes no article bytes", async () => {
    const { user, postId } = await harness();
    await user.mutation(figureApi.attachEvidence, {
      postId, key: "claim-trace", expectedSourceId: null, name: "trace.md", format: "markdown", purpose: "claim-trace", content,
    });
    const plan = await user.mutation(figureApi.planFigures, { postId });
    const candidateId = plan.candidateIds[0];
    await user.mutation(figureApi.declineCandidate, { candidateId });
    expect((await user.query(api.publishing.getPostById, { postId }))?.content).toBe(content);
    const next = await user.mutation(figureApi.planFigures, { postId });
    const preview = await user.query(figureApi.getCandidate, { candidateId: next.candidateIds[0] });
    const review = { candidateId: preview._id, expectedDataSignature: preview.dataSignature, expectedPresentationSignature: preview.presentationSignature };
    await user.mutation(figureApi.acceptCandidate, review);
    const accepted = await user.query(api.publishing.getPostById, { postId });
    expect(accepted?.content).toContain(`resonate-figure://${next.candidateIds[0]}`);
    expect(accepted?.content).toContain("Reviewed set: values in cases; denominator: 80 labels.");
    expect(accepted?.content).toContain("Source: Evaluation report, Table 2.");
    expect(accepted?.approvalState).toBe("unapproved");
    expect((await user.query(figureApi.getPublicationFigures, { postId }))[0].candidateId).toBe(next.candidateIds[0]);
    await user.mutation(figureApi.acceptCandidate, review);
    expect((await user.query(api.publishing.getPostById, { postId }))?.content).toBe(accepted?.content);
  });
  it("persists actual SVG candidates from article plus claim-trace evidence and reloads them independently", async () => {
    const { t, user, postId } = await harness();
    expect((await user.mutation(figureApi.planFigures, { postId })).candidateIds).toEqual([]);
    await user.mutation(figureApi.attachEvidence, {
      postId, key: "claim-trace", expectedSourceId: null, name: "trace.md", format: "markdown", purpose: "claim-trace", content,
    });
    const plan = await user.mutation(figureApi.planFigures, { postId });
    expect(plan.candidateIds).toHaveLength(1);
    const workspace = await t.withIdentity(OWNER).query(figureApi.getWorkspace, { postId });
    expect(workspace.plan?._id).toBe(plan.planId);
    expect(workspace.candidates[0].svg).toContain("<svg");
    expect(workspace.candidates[0].svgSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(workspace.candidates[0].spec.family).toBe("bars");
    expect((await user.query(api.publishing.getPostById, { postId }))?.content).toBe(content);
    await expect(t.withIdentity(FOREIGN).query(figureApi.getCandidate, { candidateId: plan.candidateIds[0] })).rejects.toThrow(/Post not found/);
  });
  it("persists immutable exact source versions, reuses equal imports and denies guessed foreign source IDs or viewer writes", async () => {
    const { t, user, postId } = await harness();
    const first = await user.mutation(figureApi.attachEvidence, {
      postId, key: "claim-trace", expectedSourceId: null, name: "claim-trace.md", format: "markdown", purpose: "claim-trace", content,
    });
    const reloaded = await t.withIdentity(OWNER).query(figureApi.getSource, { sourceId: first.sourceId });
    expect(reloaded.content).toBe(content);
    expect(reloaded.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(await user.mutation(figureApi.attachEvidence, {
      postId, key: "claim-trace", expectedSourceId: first.sourceId, name: "claim-trace.md", format: "markdown", purpose: "claim-trace", content,
    })).toEqual(first);
    const second = await user.mutation(figureApi.attachEvidence, {
      postId, key: "claim-trace", expectedSourceId: first.sourceId, name: "claim-trace.md", format: "markdown", purpose: "claim-trace", content: content.replace("12", "13"),
    });
    expect(second.sourceId).not.toBe(first.sourceId);
    expect((await user.query(figureApi.getSource, { sourceId: first.sourceId })).content).toBe(content);
    await expect(t.withIdentity(FOREIGN).query(figureApi.getSource, { sourceId: first.sourceId })).rejects.toThrow(/Post not found/);
    await t.run(ctx => ctx.db.patch(postId, { userId: VIEWER.subject }));
    await expect(t.withIdentity(VIEWER).mutation(figureApi.attachEvidence, {
      postId, key: "claim-trace", expectedSourceId: second.sourceId, name: "claim-trace.md", format: "markdown", purpose: "claim-trace", content,
    })).rejects.toThrow(/write access denied/);
  });
});
