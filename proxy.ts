import { clerkMiddleware, createRouteMatcher, currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const isPublicRoute = createRouteMatcher([
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/api/ops/validate-workflow",
]);
const bypassAuthForE2E = process.env.E2E_BYPASS_AUTH === "1";

function parseAllowedEmails(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

function isProductionEnv(): boolean {
  return process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production";
}

/**
 * Allowlist rollout mode.
 *
 * "log"     — evaluate the allowlist and log the outcome, but let every request
 *             through. Use this on first deploy to confirm email resolution
 *             works before enforcement can lock the operator out.
 * "enforce" — reject unauthorized requests. The default.
 *
 * Only RESONATE_ALLOWLIST_MODE=log opts into the permissive mode, so a typo
 * cannot accidentally disable enforcement.
 */
function isLogOnlyMode(): boolean {
  return process.env.RESONATE_ALLOWLIST_MODE?.trim().toLowerCase() === "log";
}

/**
 * Deny an authenticated-but-unauthorized request.
 *
 * Deliberately does NOT redirect to sign-in: the user already has a valid
 * session, so bouncing them to sign-in produces a redirect loop. Return a
 * terminal response instead.
 */
function denyRequest(req: Request, message: string, status: 403 | 503) {
  const pathname = new URL(req.url).pathname;
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: message }, { status });
  }
  return new NextResponse(message, {
    status,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

/**
 * Resolve the signed-in user's primary email.
 *
 * Prefers the session token claim (no network call). Falls back to the Clerk
 * Backend API only when the claim is absent, since `currentUser()` costs a
 * round-trip on every request. Returns null on any failure so the caller can
 * apply an explicit policy rather than throwing out of middleware.
 */
async function resolvePrimaryEmail(
  sessionClaims: Record<string, unknown> | null | undefined
): Promise<string | null> {
  const claimEmail =
    typeof sessionClaims?.email === "string"
      ? sessionClaims.email
      : typeof sessionClaims?.primary_email_address === "string"
        ? sessionClaims.primary_email_address
        : null;
  if (claimEmail) return claimEmail.trim().toLowerCase();

  try {
    const user = await currentUser();
    return user?.primaryEmailAddress?.emailAddress?.trim().toLowerCase() ?? null;
  } catch (error) {
    console.error("[proxy] Failed to resolve user email for allowlist check.", error);
    return null;
  }
}

const authProxy = clerkMiddleware(async (auth, req) => {
  if (isPublicRoute(req)) return;

  const { userId, sessionClaims, redirectToSignIn } = await auth();

  if (!userId) {
    return redirectToSignIn();
  }

  const allowedEmails = parseAllowedEmails(process.env.RESONATE_ALLOWED_EMAILS);
  const logOnly = isLogOnlyMode();

  // Fail closed in production: an unconfigured allowlist must not mean open access.
  if (isProductionEnv() && allowedEmails.length === 0) {
    console.warn(
      "[proxy] RESONATE_ALLOWED_EMAILS is unset or empty in production. Rejecting authenticated requests (fail closed)."
    );
    if (!logOnly) {
      return denyRequest(req, "Service unavailable: email allowlist not configured.", 503);
    }
  }

  // Outside production, an empty allowlist means "no restriction" so local work is unblocked.
  if (allowedEmails.length === 0) {
    return NextResponse.next();
  }

  const email = await resolvePrimaryEmail(sessionClaims as Record<string, unknown> | null);

  if (!email) {
    // Could not establish identity. Fail closed, but say so distinctly from a
    // genuine allowlist rejection — this usually means a Clerk lookup problem.
    console.error(
      `[proxy] Could not resolve primary email for authenticated session ${userId}.` +
        (logOnly ? " (log-only mode: allowing through)" : "")
    );
    if (logOnly) return NextResponse.next();
    return denyRequest(req, "Service unavailable: could not verify account email.", 503);
  }

  if (!allowedEmails.includes(email)) {
    console.warn(
      `[proxy] Email not on allowlist: ${email}.` +
        (logOnly ? " (log-only mode: allowing through)" : "")
    );
    if (logOnly) return NextResponse.next();
    return denyRequest(req, "Forbidden: email not authorized.", 403);
  }

  if (logOnly) {
    console.info(`[proxy] Allowlist check passed for ${email} (log-only mode).`);
  }

  return NextResponse.next();
});

export default bypassAuthForE2E
  ? function proxy() {
      return NextResponse.next();
    }
  : authProxy;

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
