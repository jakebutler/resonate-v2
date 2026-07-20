import { NextResponse } from "next/server";

export function allowMockAi(): boolean {
  return process.env.RESONATE_ALLOW_MOCK_AI === "1";
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
