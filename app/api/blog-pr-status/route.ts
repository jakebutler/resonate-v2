import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { fetchBlogPrStatus } from "@/lib/github";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

export async function POST(req: NextRequest) {
  if (process.env.E2E_BYPASS_AUTH !== "1") {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  let body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON request body." }, { status: 400 }); }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "A request object is required." }, { status: 400 });
  }
  const { prUrl, postId } = body as { prUrl?: string; postId?: string };
  if (postId !== undefined && (typeof postId !== "string" || !postId.trim())) {
    return NextResponse.json({ error: "A valid postId is required." }, { status: 400 });
  }

  if (postId) {
    const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL?.trim();
    const { getToken } = await auth();
    const token = await getToken({ template: "convex" });
    if (!convexUrl || !token) return NextResponse.json({ error: "Authenticated publication workspace is required." }, { status: 403 });
    const client = new ConvexHttpClient(convexUrl); client.setAuth(token);
    try {
      const review = await client.query(api.publishing.getApprovalReview, { postId: postId as Id<"v2Posts"> });
      if (review.hasVisuals) return NextResponse.json(await client.action(api.visualPublication.refreshPr, { postId: postId as Id<"v2Posts"> }));
    } catch { return NextResponse.json({ error: "Recorded publication state requires review." }, { status: 403 }); }
  }

  if (!prUrl || typeof prUrl !== "string") {
    return NextResponse.json({ error: "prUrl is required" }, { status: 400 });
  }

  try {
    const status = await fetchBlogPrStatus(prUrl);
    return NextResponse.json(status);
  } catch (error) {
    const message = error instanceof Error ? error.message : "PR status check failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
