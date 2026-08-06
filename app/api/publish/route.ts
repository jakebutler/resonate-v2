import { NextRequest, NextResponse } from "next/server";
import { createBlogPostPR, BlogPostContractError } from "@/lib/github";
import { enrichPublishImageAlts } from "@/lib/imageAlt";
import { auth } from "@clerk/nextjs/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";

function asTrimmedString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function normalizeBlogSlug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function isScheduleTrigger(value: unknown): value is "frontmatter" | "pr-body" {
  return value === "frontmatter" || value === "pr-body";
}

async function loadApprovedPostForPublish(
  postId: string
): Promise<{ post: Doc<"v2Posts"> } | { error: string; status: number }> {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL?.trim();
  if (!convexUrl) {
    return { error: "Convex is not configured.", status: 503 };
  }

  const { getToken } = await auth();
  const token = await getToken({ template: "convex" });
  if (!token) {
    return { error: "Unauthorized", status: 401 };
  }

  const client = new ConvexHttpClient(convexUrl);
  client.setAuth(token);

  const post = await client.query(api.publishing.getPostById, { postId });
  if (!post) {
    return { error: "Post not found or access denied.", status: 403 };
  }
  if (post.approvalState !== "approved") {
    return { error: "Post is not approved for publishing.", status: 403 };
  }

  return { post };
}

function coverImagesFromPost(post: Doc<"v2Posts">) {
  const heroSourceUrl = post.heroImageUrl?.trim();
  if (!heroSourceUrl) return undefined;
  return [
    {
      sourceUrl: heroSourceUrl,
      alt: `Cover image for ${post.title}`,
      isCover: true as const,
    },
  ];
}

function missingServerPublishFields(post: Doc<"v2Posts">): string[] {
  const missing: string[] = [];
  if (!post.blogExcerpt?.trim()) missing.push("excerpt");
  if (!post.blogAuthor?.trim()) missing.push("author");
  if (!post.blogCategory?.trim()) missing.push("category");
  if (!(post.blogTags?.length ?? 0)) missing.push("tags");
  if (!post.heroImageUrl?.trim() && !post.heroImageStorageId) missing.push("hero image");
  return missing;
}

export async function POST(req: NextRequest) {
  if (process.env.E2E_BYPASS_AUTH !== "1") {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const body = await req.json();
  const {
    postId: rawPostId,
    scheduledDate: clientScheduledDate,
    scheduledTime: clientScheduledTime,
    timezone: clientTimezone,
    scheduleTrigger,
    status,
    subtitle,
    featured,
    coverImageAlt: clientCoverImageAlt,
  } = body;

  const postId = asTrimmedString(rawPostId);
  if (!postId) {
    return NextResponse.json(
      {
        error:
          "postId is required. Blog PRs can only be opened for an approved calendar post.",
      },
      { status: 400 }
    );
  }

  const gate = await loadApprovedPostForPublish(postId);
  if ("error" in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const post = gate.post;
  const missingFields = missingServerPublishFields(post);
  if (missingFields.length > 0) {
    return NextResponse.json(
      {
        error: `Approved post is missing required blog metadata: ${missingFields.join(", ")}.`,
      },
      { status: 400 }
    );
  }

  const title = post.title;
  const content = post.content;
  const scheduledDate = post.scheduledDate ?? clientScheduledDate;
  const scheduledTime = post.scheduledTime ?? clientScheduledTime;
  const timezone = post.timezone ?? clientTimezone;
  const excerpt = post.blogExcerpt!.trim();
  const author = post.blogAuthor!.trim();
  const tags = post.blogTags ?? [];
  const category = post.blogCategory!.trim();
  const rawSlug = post.blogSlug?.trim();
  const slug = rawSlug ? normalizeBlogSlug(rawSlug) : undefined;
  if (rawSlug && !slug) {
    return NextResponse.json(
      { error: "blogSlug must contain at least one URL-safe alphanumeric character." },
      { status: 400 }
    );
  }
  const images = coverImagesFromPost(post);
  const coverImageAlt =
    asTrimmedString(clientCoverImageAlt) ?? `Cover image for ${post.title}`;

  if (
    (subtitle !== undefined && typeof subtitle !== "string") ||
    (scheduledTime !== undefined && typeof scheduledTime !== "string") ||
    (timezone !== undefined && typeof timezone !== "string") ||
    (scheduleTrigger !== undefined && !isScheduleTrigger(scheduleTrigger)) ||
    (featured !== undefined && typeof featured !== "boolean") ||
    (clientCoverImageAlt !== undefined && typeof clientCoverImageAlt !== "string")
  ) {
    return NextResponse.json(
      {
        error:
          "Optional publish metadata must use strings, booleans, and schedule trigger values.",
      },
      { status: 400 }
    );
  }

  try {
    const altTextResult = await enrichPublishImageAlts({
      title,
      excerpt,
      coverImageAlt,
      images,
    });

    const result = await createBlogPostPR({
      title,
      content,
      scheduledDate,
      scheduledTime,
      timezone,
      scheduleTrigger,
      status,
      subtitle,
      excerpt,
      author,
      tags,
      category,
      slug,
      featured,
      coverImageAlt: altTextResult.coverImageAlt ?? coverImageAlt,
      images: altTextResult.images ?? images,
    });
    return NextResponse.json({
      prUrl: result.prUrl,
      branchName: result.branchName,
      sanitizedResponse: result.sanitizedResponse,
    });
  } catch (err) {
    if (err instanceof BlogPostContractError) {
      return NextResponse.json(
        { error: err.message, issues: err.issues },
        { status: 400 }
      );
    }
    console.error("GitHub publish error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Publish failed" },
      { status: 500 }
    );
  }
}
