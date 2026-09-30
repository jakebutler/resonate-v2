"use client";

import { useCallback, useMemo, useRef } from "react";
import { useAuth } from "@clerk/nextjs";
import { ConvexProviderWithAuth, ConvexReactClient } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";

function useE2EBypassAuth() {
  const fetchAccessToken = useCallback(async () => {
    // A deliberately unsigned token for intercepted .test WebSockets only.
    // Real Convex endpoints retain the prior null token under E2E bypass.
    if (process.env.NEXT_PUBLIC_CONVEX_URL !== "https://convex.test") return null;
    const now = Math.floor(Date.now() / 1000);
    return `${btoa('{"alg":"none"}')}.${btoa(JSON.stringify({sub:"fixture-editor",iat:now,exp:now+3600}))}.fixture`;
  }, []);
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
      <ConvexProviderWithAuth client={clientRef.current} useAuth={useE2EBypassAuth}>
        {children}
      </ConvexProviderWithAuth>
    );
  }

  return (
    <ConvexProviderWithClerk client={clientRef.current} useAuth={useAuth}>
      {children}
    </ConvexProviderWithClerk>
  );
}
