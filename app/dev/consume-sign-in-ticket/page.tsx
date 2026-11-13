"use client";

/**
 * Demo-walkthrough helper: consumes a single-use Clerk sign-in token via the
 * documented `ticket` strategy — the exact consumption flow e2e/global-setup.ts
 * uses for authenticated sessions (V4). Tokens are minted out-of-band by an
 * operator holding the dev-instance secret key and expire in minutes; this
 * page only consumes them.
 */

import { Suspense, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useClerk } from "@clerk/nextjs";

function ConsumeSignInTicketForm() {
  const clerk = useClerk();
  const params = useSearchParams();

  useEffect(() => {
    // clerk.client is populated only once the ClerkProvider has loaded the
    // client; the context re-renders with loaded=true when it is ready.
    if (!clerk.loaded) return;
    const ticket = params.get("ticket");
    if (!ticket) {
      window.location.href = "/sign-in";
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const signIn = await clerk.client.signIn.create({ strategy: "ticket", ticket });
        if (signIn.status !== "complete" || !signIn.createdSessionId) {
          throw new Error(`sign-in status=${signIn.status}`);
        }
        await clerk.setActive({ session: signIn.createdSessionId });
        window.location.href = "/";
      } catch (error) {
        if (!cancelled) {
          document.body.innerText = `Sign-in failed: ${String(error)}`;
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clerk, clerk.loaded, params]);

  return <p>Signing in…</p>;
}

export default function ConsumeSignInTicketPage() {
  return (
    <Suspense fallback={<p>Loading…</p>}>
      <ConsumeSignInTicketForm />
    </Suspense>
  );
}
