import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { fetchBlogPrStatus } from "@/lib/github";

export async function POST(req: NextRequest) {
  if (process.env.E2E_BYPASS_AUTH !== "1") {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const body = await req.json();
  const { prUrl } = body as { prUrl?: string };

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
