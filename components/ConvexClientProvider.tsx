"use client";

import { useCallback, useMemo, useRef } from "react";
import { useAuth } from "@clerk/nextjs";
import { ConvexProviderWithAuth, ConvexReactClient } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";

function useE2EBypassAuth() {
  const fetchAccessToken = useCallback(async () => null, []);
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
