import { NextResponse } from "next/server";

export function allowMockAi(): boolean {
  if (process.env.RESONATE_ALLOW_MOCK_AI !== "1") return false;
  // Unit/integration tests may set the flag under a leaked VERCEL_ENV; allow them.
  if (process.env.VITEST === "true") return true;
  // Never serve fabricated AI content from production runtimes, even if the
  // override flag is accidentally set in a Production env.
  if (
    process.env.VERCEL_ENV === "production" ||
    process.env.NODE_ENV === "production"
  ) {
    return false;
  }
  return true;
}

export function missingPioneerKeyResponse() {
  return NextResponse.json(
    { error: "PIONEER_API_KEY is not configured." },
    { status: 503 }
  );
}

export function pioneerUpstreamErrorResponse(detail?: string) {
  return NextResponse.json(
    {
      error: "Upstream PioneerAI request failed.",
      ...(detail ? { detail } : {}),
    },
    { status: 502 }
  );
}
