import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createBlogPostPR, BlogPostContractError, blogDestination } from "@/lib/github";
import { blogEditorialFingerprint, blogExportPreview, missingBlogEditorialFields } from "@/lib/blogContract";
import { scheduleToUtcIso } from "@/lib/providerAdapters";
import { auth } from "@clerk/nextjs/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";

async function loadPost(postId: string) {
  const { userId, getToken } = await auth();
  if (!userId) throw new Error("Unauthorized");
  const token = await getToken({ template: "convex" });
  const url = process.env.NEXT_PUBLIC_CONVEX_URL?.trim();
  if (!token || !url) throw new Error("Publishing connection unavailable");
  const client = new ConvexHttpClient(url);
  client.setAuth(token);
  const post = await client.query(api.publishing.getPostById, { postId });
  if (!post || post.channelId !== "corvo-blog") throw new Error("Blog post not found or access denied");
  return { post: post as Doc<"v2Posts">, client };
}

export async function GET(req: NextRequest) {
  try {
    const { post } = await loadPost(req.nextUrl.searchParams.get("postId") ?? "");
    let dueAt: string | null = null;
    try { if (post.scheduledDate && post.scheduledTime) dueAt = scheduleToUtcIso({scheduledDate:post.scheduledDate,scheduledTime:post.scheduledTime,timezone:post.timezone}); } catch { /* Invalid schedules remain visibly unverified. */ }
    return NextResponse.json({ ...blogExportPreview(post), ...blogDestination(post), dueAt });
  } catch {
    return NextResponse.json({ error: "Export preview unavailable" }, { status: 403 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body || typeof body.postId !== "string" || !body.postId.trim()) {
      return NextResponse.json({ error: "postId is required" }, { status: 400 });
    }
    if (Object.keys(body).some(key => key !== "postId")) {
      return NextResponse.json({ error: "Publish overrides are not accepted. Save and approve metadata in the composer." }, { status: 400 });
    }
    const { post, client } = await loadPost(body.postId);
    if (post.approvalState !== "approved" || post.contentFingerprint !== blogEditorialFingerprint(post)) {
      return NextResponse.json({ error: "Save and approve the current blog export version before opening a PR." }, { status: 403 });
    }
    const missing = missingBlogEditorialFields(post);
    if (missing.length) return NextResponse.json({ error: `Review required: ${missing.join(", ")}` }, { status: 400 });
    if (!post.scheduledDate || !post.scheduledTime) return NextResponse.json({ error: "Save a date, time and timezone before export." }, { status: 400 });
    scheduleToUtcIso({ scheduledDate: post.scheduledDate, scheduledTime: post.scheduledTime, timezone: post.timezone });
    const hero = await client.action(api.blogHero.getApprovedBytes, {postId: post._id});
    const schedule = JSON.stringify([post.scheduledDate, post.scheduledTime, post.timezone]);
    const key = createHash("sha256").update(`${post._id}:${post.contentFingerprint}:${schedule}`).digest("hex");
    const result = await createBlogPostPR({
      beforeRemoteWrite: async () => { await client.mutation(api.publishing.claimBlogExport, {postId: post._id, fingerprint: post.contentFingerprint, schedule, key}); },
      preparedHero: {bytes: Buffer.from(hero.base64, "base64"), sha256: hero.sha256},
      exportIdentity: String(post._id),
      title: post.title, content: post.content,
      scheduledDate: post.scheduledDate, scheduledTime: post.scheduledTime, timezone: post.timezone,
      scheduleTrigger: "pr-body", status: post.blogPublicationIntent!,
      excerpt: post.blogExcerpt!, author: post.blogAuthor!, tags: post.blogTags!,
      category: post.blogCategory!, slug: post.blogSlug,
      coverImageAlt: post.coverImageAlt!,
      images: [{ sourceUrl: post.heroImageUrl!, alt: post.coverImageAlt!, isCover: true }],
    });
    await client.mutation(api.publishing.recordGithubPr, {postId: post._id, result: {
      prUrl: result.prUrl, branchName: result.branchName, artifact: result.sanitizedResponse.artifact,
      prNumber: result.sanitizedResponse.number, prStatus: "open", exportClaimKey: key, sanitizedResponse: result.sanitizedResponse,
    }});
    return NextResponse.json(result);
  } catch (err) {
    // Never serialize raw provider responses or credentials.
    const contract = err instanceof BlogPostContractError;
    return NextResponse.json({ ...(contract ? { issues: err.issues } : {}), error: contract ? err.message : "Blog export failed; review connection and saved metadata." }, { status: contract ? 400 : err instanceof Error && err.message === "Unauthorized" ? 401 : 500 });
  }
}
