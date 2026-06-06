import { NextRequest, NextResponse } from "next/server";
import { createBlogPostPR } from "@/lib/github";
import { enrichPublishImageAlts } from "@/lib/imageAlt";
import { auth } from "@clerk/nextjs/server";

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
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

export async function POST(req: NextRequest) {
  if (process.env.E2E_BYPASS_AUTH !== "1") {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const body = await req.json();
  const {
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
    featured,
    coverImageAlt,
    images,
  } = body;

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
    console.error("GitHub publish error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Publish failed" },
      { status: 500 }
    );
  }
}
