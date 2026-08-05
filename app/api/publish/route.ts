import { NextRequest, NextResponse } from "next/server";
import { createBlogPostPR, BlogPostContractError } from "@/lib/github";
import { enrichPublishImageAlts } from "@/lib/imageAlt";
import { auth } from "@clerk/nextjs/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function coalesceString(
  server: string | undefined,
  client: string | undefined
): string | undefined {
  const normalizedServer = server?.trim();
  if (normalizedServer) return normalizedServer;
  const normalizedClient = client?.trim();
  return normalizedClient || server;
}

function coalesceTags(server: string[] | undefined, client: string[] | undefined): string[] {
  if (server && server.length > 0) return server;
  if (client && client.length > 0) return client;
  return server ?? client ?? [];
}

function isImageAssetArray(
  value: unknown
): value is Array<{ sourceUrl: string; alt?: string; isCover?: boolean }> {
  return (
    Array.isArray(value) &&
    value.every((entry) => {
      if (!entry || typeof entry !== "object") return false;

      const candidate = entry as {
        sourceUrl?: unknown;
        alt?: unknown;
        isCover?: unknown;
      };

      return (
        typeof candidate.sourceUrl === "string" &&
        (candidate.alt === undefined || typeof candidate.alt === "string") &&
        (candidate.isCover === undefined || typeof candidate.isCover === "boolean")
      );
    })
  );
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

export async function POST(req: NextRequest) {
  if (process.env.E2E_BYPASS_AUTH !== "1") {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const body = await req.json();
  const {
    postId,
    title: clientTitle,
    content: clientContent,
    scheduledDate: clientScheduledDate,
    scheduledTime: clientScheduledTime,
    timezone: clientTimezone,
    scheduleTrigger,
    status,
    subtitle,
    excerpt: clientExcerpt,
    author: clientAuthor,
    tags: clientTags,
    category: clientCategory,
    slug: clientSlug,
    featured,
    coverImageAlt: clientCoverImageAlt,
    images: clientImages,
  } = body;

  let title = clientTitle;
  let content = clientContent;
  let scheduledDate = clientScheduledDate;
  let scheduledTime = clientScheduledTime;
  let timezone = clientTimezone;
  let excerpt = clientExcerpt;
  let author = clientAuthor;
  let tags = clientTags;
  let category = clientCategory;
  let slug = clientSlug;
  let coverImageAlt = clientCoverImageAlt;
  let images = clientImages;

  if (typeof postId === "string" && postId.trim()) {
    const gate = await loadApprovedPostForPublish(postId.trim());
    if ("error" in gate) {
      return NextResponse.json({ error: gate.error }, { status: gate.status });
    }

    const post = gate.post;
    title = post.title;
    content = post.content;
    scheduledDate = post.scheduledDate ?? scheduledDate;
    scheduledTime = post.scheduledTime ?? scheduledTime;
    timezone = post.timezone ?? timezone;
    excerpt = coalesceString(post.blogExcerpt, excerpt);
    author = coalesceString(post.blogAuthor, author);
    tags = coalesceTags(post.blogTags, tags);
    category = coalesceString(post.blogCategory, category);
    slug = coalesceString(post.blogSlug, slug);
    const postImages = coverImagesFromPost(post);
    if (postImages) {
      images = postImages;
      coverImageAlt = coverImageAlt ?? `Cover image for ${post.title}`;
    }
  } else if (postId !== undefined && postId !== null) {
    return NextResponse.json({ error: "postId must be a string when provided." }, { status: 400 });
  } else {
    console.warn(
      "[/api/publish] Ungated publish: no postId provided; using client-supplied title/content."
    );
  }

  if (!title || !content) {
    return NextResponse.json({ error: "title and content are required" }, { status: 400 });
  }

  if (
    (subtitle !== undefined && typeof subtitle !== "string") ||
    (excerpt !== undefined && typeof excerpt !== "string") ||
    (author !== undefined && typeof author !== "string") ||
    (scheduledTime !== undefined && typeof scheduledTime !== "string") ||
    (timezone !== undefined && typeof timezone !== "string") ||
    (scheduleTrigger !== undefined && !isScheduleTrigger(scheduleTrigger)) ||
    (tags !== undefined && !isStringArray(tags)) ||
    (category !== undefined && typeof category !== "string") ||
    (slug !== undefined && typeof slug !== "string") ||
    (featured !== undefined && typeof featured !== "boolean") ||
    (coverImageAlt !== undefined && typeof coverImageAlt !== "string") ||
    (images !== undefined && !isImageAssetArray(images))
  ) {
    return NextResponse.json(
      {
        error:
          "Optional publish metadata must use strings, booleans, string arrays, and image asset objects.",
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
