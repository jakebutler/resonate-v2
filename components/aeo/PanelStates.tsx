"use client";

import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { tokens } from "@/components/shell/tokens";
import { cn } from "@/lib/utils";
import type { Loadable } from "./types";

/** Card shell every AEO/SEO panel renders inside, with a stable aria-label. */
export function AeoPanel({
  title,
  description,
  ariaLabel,
  children,
}: {
  title: string;
  description?: string;
  ariaLabel: string;
  children: ReactNode;
}) {
  return (
    <section aria-label={ariaLabel} className={cn(tokens.panel, tokens.panelPadding, "space-y-3")}>
      <div className="space-y-1">
        <h3 className="font-semibold">{title}</h3>
        {description ? (
          <p className={cn("text-sm", tokens.textMuted)}>{description}</p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

export function PanelLoading({ label }: { label: string }) {
  return (
    <div role="status" aria-label={label} className="space-y-2">
      <div className="h-4 w-1/3 animate-pulse rounded bg-black/10" />
      <div className="h-4 w-2/3 animate-pulse rounded bg-black/10" />
      <div className="h-4 w-1/2 animate-pulse rounded bg-black/10" />
    </div>
  );
}

export function PanelError({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div role="alert" className={cn(tokens.noticeWarning, "flex items-center justify-between gap-3")}>
      <p>{message}</p>
      {onRetry ? (
        <Button variant="outline" size="sm" onClick={onRetry}>
          Retry
        </Button>
      ) : null}
    </div>
  );
}

export function PanelEmpty({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className={cn(tokens.notice, "space-y-1")}>
      <p className="font-medium">{title}</p>
      <p className="text-sm">{description}</p>
    </div>
  );
}

function isEmptyData<T>(data: T): boolean {
  if (data === null || data === undefined) return true;
  if (Array.isArray(data)) return data.length === 0;
  return false;
}

/**
 * Single dispatch for the loading / error / ready state matrix shared by the
 * list-style panels. The children callback only ever sees arrived, non-empty
 * data; an empty ready payload renders the empty state.
 */
export function LoadableSection<T>({
  value,
  loadingLabel,
  emptyTitle,
  emptyDescription,
  isEmpty = isEmptyData,
  children,
}: {
  value: Loadable<T>;
  loadingLabel: string;
  emptyTitle: string;
  emptyDescription: string;
  /** Payload-specific emptiness, e.g. an all-empty record. */
  isEmpty?: (data: T) => boolean;
  children: (data: T) => ReactNode;
}) {
  if (value.status === "loading") {
    return <PanelLoading label={loadingLabel} />;
  }
  if (value.status === "error") {
    return <PanelError message={value.message} onRetry={value.onRetry} />;
  }
  if (isEmpty(value.data)) {
    return <PanelEmpty title={emptyTitle} description={emptyDescription} />;
  }
  return <>{children(value.data)}</>;
}
