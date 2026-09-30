"use client";

import { createContext, useCallback, useContext, useMemo, useRef } from "react";
import { useAuth } from "@clerk/nextjs";
import { ConvexProviderWithAuth, ConvexReactClient } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { localFixtureTokenUrl } from "@/lib/localFixtureAuth";

const FixtureTokenUrl = createContext<string | undefined>(undefined);

function useE2EBypassAuth() {
  const tokenUrl = useContext(FixtureTokenUrl);
  const fetchAccessToken = useCallback(async () => {
    if (!tokenUrl) return null;
    try {
      const response = await fetch(tokenUrl, { cache: "no-store", credentials: "omit", redirect: "error" });
      if (!response.ok) return null;
      const body: unknown = await response.json();
      if (!body || typeof body !== "object" || !("token" in body) || typeof body.token !== "string" || body.token.length > 8192) return null;
      return body.token;
    } catch { return null; }
  }, [tokenUrl]);
  return useMemo(
    () => ({
      isLoading: false,
      isAuthenticated: true,
      fetchAccessToken,
    }),
    [fetchAccessToken]
  );
}

export function ConvexClientProvider({
  children,
  url,
  bypassAuth = false,
}: {
  children: React.ReactNode;
  url?: string;
  bypassAuth?: boolean;
}) {
  const clientRef = useRef<ConvexReactClient | null>(null);

  if (!url) {
    throw new Error("Missing required environment variable: NEXT_PUBLIC_CONVEX_URL");
  }

  if (!clientRef.current) {
    clientRef.current = new ConvexReactClient(url);
  }

  if (bypassAuth) {
    // Keep an auth-capable provider so `useConvexAuth` works under E2E bypass
    // (plain ConvexProvider throws during prerender of research/calendar).
    return (
      <FixtureTokenUrl.Provider value={localFixtureTokenUrl({
        runtime: process.env.NODE_ENV, bypass: bypassAuth, convexUrl: url,
        tokenUrl: process.env.NEXT_PUBLIC_VISUAL_FIXTURE_TOKEN_URL, vercel: Boolean(process.env.NEXT_PUBLIC_VERCEL_ENV || process.env.VERCEL),
      })}>
        <ConvexProviderWithAuth client={clientRef.current} useAuth={useE2EBypassAuth}>
          {children}
        </ConvexProviderWithAuth>
      </FixtureTokenUrl.Provider>
    );
  }

  return (
    <ConvexProviderWithClerk client={clientRef.current} useAuth={useAuth}>
      {children}
    </ConvexProviderWithClerk>
  );
}
