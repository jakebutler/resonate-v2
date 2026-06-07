import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const description =
    typeof body.description === "string" ? body.description.trim() : "";
  const scheduledDate =
    typeof body.scheduledDate === "string" ? body.scheduledDate.trim() : "";

  const issues: string[] = [];
  if (!title) issues.push("YouTube placeholder validation requires a title.");
  if (title.length > 100) issues.push("YouTube title should stay under 100 characters.");
  if (!description) {
    issues.push("YouTube placeholder validation requires a description/script.");
  }
  if (description.length > 5000) {
    issues.push("YouTube description should stay under 5,000 characters.");
  }
  if (!scheduledDate) {
    issues.push("A scheduled date is required to validate the scheduling handoff.");
  }

  return NextResponse.json({
    ok: issues.length === 0,
    mode: "placeholder",
    provider: "youtube",
    credentialStatus: "placeholder-only",
    uploadEndpoint:
      "https://developers.google.com/youtube/v3/guides/uploading_a_video",
    issues,
    message:
      issues.length === 0
        ? "YouTube placeholder scheduling payload is valid. Real OAuth/upload credentials are still required before production posting."
        : "YouTube placeholder scheduling payload needs changes before it can represent a valid scheduled post.",
  });
}
