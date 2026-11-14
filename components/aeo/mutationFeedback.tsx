"use client";

import { useCallback, useRef, useState } from "react";
import type { ReactMutation } from "convex/react";
import type { OptimisticLocalStore } from "convex/browser";
import type { FunctionArgs, FunctionReference } from "convex/server";
import { Button } from "@/components/ui/button";
import { tokens } from "@/components/shell/tokens";
import { cn } from "@/lib/utils";

/**
 * The mutation-feedback pattern for the /aeo surface: every client mutation
 * reports pending / success / failure, a failure shows a visible alert with a
 * Retry, and optimistic UI rolls back because Convex rolls its local query
 * patch back when the mutation rejects. The hook never swallows a rejection —
 * it converts it into rendered state.
 */

export type AeoMutationState =
  | { status: "idle" }
  | { status: "pending" }
  | { status: "success" }
  | { status: "error"; message: string };

const ERROR_FALLBACK =
  "The change could not be saved. Nothing was lost — try again.";

export function useAeoMutation<
  Mutation extends FunctionReference<"mutation">,
>(
  mutation: ReactMutation<Mutation>,
  /** Applied on every run; Convex rolls it back when the mutation rejects. */
  optimisticUpdate?: (
    localStore: OptimisticLocalStore,
    args: FunctionArgs<Mutation>
  ) => void
) {
  const [state, setState] = useState<AeoMutationState>({ status: "idle" });
  const lastArgs = useRef<FunctionArgs<Mutation> | null>(null);

  const run = useCallback(
    async (
      args: FunctionArgs<Mutation>,
      onSuccess?: (result: unknown) => void
    ) => {
      lastArgs.current = args;
      setState({ status: "pending" });
      try {
        const configured = optimisticUpdate
          ? mutation.withOptimisticUpdate(optimisticUpdate)
          : mutation;
        const result = await configured(args);
        setState({ status: "success" });
        onSuccess?.(result);
        return result;
      } catch (error) {
        // Convex mutation rejections (validation, not-found, access) carry a
        // message; anything else keeps an honest fallback instead of a blank.
        setState({
          status: "error",
          message:
            error instanceof Error && error.message !== ""
              ? error.message
              : ERROR_FALLBACK,
        });
        return undefined;
      }
    },
    [mutation, optimisticUpdate]
  );

  /** Re-runs the last mutation with its last arguments. */
  const retry = useCallback(() => {
    if (lastArgs.current !== null) void run(lastArgs.current);
  }, [run]);

  /** Back to idle, e.g. when the user changes the form input. */
  const reset = useCallback(() => setState({ status: "idle" }), []);

  return { run, retry, reset, state };
}

/**
 * Renders the feedback for one mutation: a quiet pending line, a success
 * confirmation when a label is given, and a visible error alert with Retry.
 * Idle renders nothing.
 */
export function MutationFeedbackBar({
  state,
  successLabel,
  onRetry,
}: {
  state: AeoMutationState;
  /** Success confirmation text; success renders nothing without it. */
  successLabel?: string;
  onRetry?: () => void;
}) {
  if (state.status === "pending") {
    return (
      <p role="status" className={cn("text-sm", tokens.textMuted)}>
        Saving your change…
      </p>
    );
  }
  if (state.status === "error") {
    return (
      <div
        role="alert"
        className={cn(
          tokens.noticeWarning,
          "flex items-center justify-between gap-3"
        )}
      >
        <p>Saving failed — {state.message}</p>
        {onRetry ? (
          <Button variant="outline" size="sm" onClick={onRetry}>
            Retry
          </Button>
        ) : null}
      </div>
    );
  }
  if (state.status === "success" && successLabel) {
    return (
      <p role="status" className={cn("text-sm", tokens.textMuted)}>
        {successLabel}
      </p>
    );
  }
  return null;
}
