import { NextRequest, NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";
import { fetchMutation, type NextjsOptions } from "convex/nextjs";
import type { FunctionArgs, FunctionReference, FunctionReturnType } from "convex/server";
import { internal } from "@/convex/_generated/api";

export const runtime = "nodejs";

/**
 * Runs an internal mutation with admin auth. fetchMutation's published types
 * are public-only (and omit the runtime-supported `adminToken` option); the
 * casts concentrate that gap here, behind the route's ops-secret check.
 */
async function runInternalMutation<M extends FunctionReference<"mutation", "internal">>(
  ref: M,
  args: FunctionArgs<M>,
  adminToken: string
): Promise<FunctionReturnType<M>> {
  return await fetchMutation(
    ref as unknown as FunctionReference<"mutation">,
    args as never,
    { adminToken } as unknown as NextjsOptions
  );
}

const VALID_BRANDS = new Set(["personal", "corvo", "lower-db", "freshproof"]);
const RATE_WINDOW_MS = 10 * 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 10;

/** Best-effort, per-instance rate limiting (single-process deployments). */
const rateBuckets = new Map<string, number[]>();

function isRateLimited(key: string): boolean {
  const now = Date.now();
  const recent = (rateBuckets.get(key) ?? []).filter(
    (timestamp) => now - timestamp < RATE_WINDOW_MS
  );
  recent.push(now);
  rateBuckets.set(key, recent);
  return recent.length > MAX_REQUESTS_PER_WINDOW;
}

/** Length-independent constant-time comparison (hash, then compare). */
function secretsMatch(provided: string, expected: string): boolean {
  const providedHash = createHash("sha256").update(provided).digest();
  const expectedHash = createHash("sha256").update(expected).digest();
  return timingSafeEqual(providedHash, expectedHash);
}

function bearerSecret(req: NextRequest): string {
  const header = req.headers.get("authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? "";
}

function clientKey(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown"
  );
}

async function auditRejection(input: {
  reason: string;
  attemptedBrand?: string;
  fileCount?: number;
}) {
  const adminToken = process.env.CONVEX_DEPLOY_KEY?.trim();
  if (!adminToken) {
    console.error("Cannot audit lab-import rejection: CONVEX_DEPLOY_KEY is unset.");
    return;
  }
  try {
    await runInternalMutation(
      internal.opsAudit.recordLabImportRejection,
      {
        brandId:
          input.attemptedBrand && VALID_BRANDS.has(input.attemptedBrand)
            ? (input.attemptedBrand as "corvo")
            : "corvo",
        reason: input.reason,
        attemptedBrand: input.attemptedBrand,
        fileCount: input.fileCount,
      },
      adminToken
    );
  } catch (error) {
    console.error(
      "Failed to audit lab-import rejection:",
      error instanceof Error ? error.message : String(error)
    );
  }
}

export async function POST(req: NextRequest) {
  const key = clientKey(req);

  let body: { brandId?: unknown; files?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const expected = process.env.V2_OPS_SECRET?.trim();
  const provided = bearerSecret(req);
  if (!expected || !provided || !secretsMatch(provided, expected)) {
    await auditRejection({
      reason: "invalid or missing bearer secret",
      attemptedBrand: typeof body.brandId === "string" ? body.brandId : undefined,
      fileCount: Array.isArray(body.files) ? body.files.length : undefined,
    });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (isRateLimited(key)) {
    await auditRejection({
      reason: "rate limited",
      attemptedBrand: typeof body.brandId === "string" ? body.brandId : undefined,
      fileCount: Array.isArray(body.files) ? body.files.length : undefined,
    });
    return NextResponse.json(
      { error: "Too many requests — retry later." },
      { status: 429 }
    );
  }

  const brandId = body.brandId;
  const files = body.files;
  if (typeof brandId !== "string" || !VALID_BRANDS.has(brandId)) {
    return NextResponse.json(
      { error: "brandId must be one of personal, corvo, lower-db, freshproof." },
      { status: 400 }
    );
  }
  if (
    !Array.isArray(files) ||
    files.some(
      (file) =>
        typeof file !== "object" ||
        file === null ||
        typeof (file as { name?: unknown }).name !== "string" ||
        typeof (file as { text?: unknown }).text !== "string"
    )
  ) {
    return NextResponse.json(
      { error: "files must be an array of { name, text } objects." },
      { status: 400 }
    );
  }

  // Internal functions require admin auth; without the deploy key the
  // endpoint fails closed rather than downgrading to a public mutation.
  const adminToken = process.env.CONVEX_DEPLOY_KEY?.trim();
  if (!adminToken) {
    console.error("Lab import unavailable: CONVEX_DEPLOY_KEY is unset.");
    return NextResponse.json(
      { error: "Lab import is not configured on this deployment." },
      { status: 500 }
    );
  }

  try {
    const result = await runInternalMutation(
      internal.corpora.importLabBundle,
      {
        brandId: brandId as "corvo",
        files: files as { name: string; text: string }[],
      },
      adminToken
    );
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Lab import failed.";
    await auditRejection({
      reason: `import failed: ${message}`,
      attemptedBrand: brandId,
      fileCount: files.length,
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
