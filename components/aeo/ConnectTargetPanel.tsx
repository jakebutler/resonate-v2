"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { tokens } from "@/components/shell/tokens";
import { cn } from "@/lib/utils";
import { AeoPanel, PanelError, PanelLoading } from "./PanelStates";
import type {
  BrandTarget,
  ConnectTargetInput,
  ConnectionValidation,
  Loadable,
} from "./types";

export type ConnectionProvider = keyof BrandTarget["connections"];

/** Same shape rule as the target URL: a scheme and a host with a dot. */
export function isValidTargetUrl(url: string): boolean {
  return /^https?:\/\/\S+\.\S+/.test(url);
}

/**
 * Splits the free-text competitor field the way it will be submitted — on
 * whitespace and commas — and separates full URLs from anything that would
 * otherwise flow raw into a crawl run ("competitor-a").
 */
export function partitionCompetitorUrls(input: string): {
  valid: string[];
  invalid: string[];
} {
  const entries = input
    .split(/[\s,]+/)
    .map((url) => url.trim())
    .filter(Boolean);
  return {
    valid: entries.filter(isValidTargetUrl),
    invalid: entries.filter((url) => !isValidTargetUrl(url)),
  };
}

const PROVIDER_LABEL: Record<ConnectionProvider, string> = {
  firecrawl: "Site crawl (Firecrawl)",
  answerEngine: "Answer-engine checks",
};
function ValidationBadge({ validation }: { validation: ConnectionValidation }) {
  const variant =
    validation.state === "valid"
      ? "default"
      : validation.state === "invalid"
        ? "destructive"
        : "outline";
  const label =
    validation.state === "valid"
      ? "Validated"
      : validation.state === "invalid"
        ? "Validation failed"
        : "Not validated";
  return (
    <Badge variant={variant} aria-label={`${label} connection`}>
      {label}
    </Badge>
  );
}

/**
 * One provider row. There is no per-provider Validate control: validation is
 * server-driven and happens once, at connect time, stored on the target —
 * a client-side button would be a dead control, so the stored state renders
 * as a badge instead.
 */
function ConnectionRow({
  provider,
  validation,
}: {
  provider: ConnectionProvider;
  validation: ConnectionValidation;
}) {
  return (
    <div className="flex items-center justify-between gap-2 rounded border border-black/10 px-3 py-2">
      <div className="space-y-0.5">
        <p className="text-sm font-medium">{PROVIDER_LABEL[provider]}</p>
        {validation.detail ? (
          <p className={cn("text-xs", tokens.textSubtle)}>{validation.detail}</p>
        ) : null}
      </div>
      <div className="flex items-center gap-2">
        <ValidationBadge validation={validation} />
      </div>
    </div>
  );
}

function ConnectForm({
  onSubmit,
  pending = false,
}: {
  onSubmit?: (input: ConnectTargetInput) => void;
  pending?: boolean;
}) {
  const [siteUrl, setSiteUrl] = useState("");
  const [competitorUrls, setCompetitorUrls] = useState("");
  const siteValid = isValidTargetUrl(siteUrl.trim());
  // Validated before submit: an invalid entry blocks submission with a
  // visible alert rather than flowing into connect/crawl runs.
  const competitors = partitionCompetitorUrls(competitorUrls);
  const competitorsValid = competitors.invalid.length === 0;
  return (
    <form
      aria-label="Connect target form"
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (!siteValid || !competitorsValid) return;
        onSubmit?.({
          siteUrl: siteUrl.trim(),
          competitorUrls: competitors.valid,
        });
      }}
    >
      <p className={cn("text-sm", tokens.textMuted)}>
        Connect the site, app, or product this brand markets. Competitor URLs
        are optional — discovery can propose more later, and everything stays
        review-only until you pin it.
      </p>
      <label className="block space-y-1">
        <span className="text-sm font-medium">Target site URL</span>
        <Input
          value={siteUrl}
          onChange={(event) => setSiteUrl(event.target.value)}
          placeholder="https://example.com"
          aria-label="Target site URL"
        />
      </label>
      <label className="block space-y-1">
        <span className="text-sm font-medium">Competitor URLs</span>
        <Input
          value={competitorUrls}
          onChange={(event) => setCompetitorUrls(event.target.value)}
          placeholder="https://competitor-a.com, https://competitor-b.com"
          aria-label="Competitor URLs"
        />
      </label>
      {!siteValid && siteUrl.trim() !== "" ? (
        <p role="alert" className="text-sm">
          Enter a full URL starting with http:// or https://.
        </p>
      ) : null}
      {!competitorsValid ? (
        <p role="alert" className="text-sm">
          These competitor URLs are missing a scheme or host:{" "}
          {competitors.invalid.join(", ")} — enter full URLs starting with
          http:// or https://.
        </p>
      ) : null}
      <Button
        type="submit"
        size="sm"
        disabled={
          !siteValid || !competitorsValid || !onSubmit || pending
        }
      >
        Connect target
      </Button>
    </form>
  );
}

/**
 * Connect-target panel for one brand. Purely presentational: the target record
 * and every action arrive as props; no backend calls.
 */
export function ConnectTargetPanel({
  brandName,
  target,
  connectPending = false,
  pinPending = false,
  onConnect,
  onPinReview,
}: {
  brandName: string;
  target: Loadable<BrandTarget | null>;
  /** True while the connect mutation is in flight. */
  connectPending?: boolean;
  /** True while the pin-review mutation is in flight. */
  pinPending?: boolean;
  onConnect?: (input: ConnectTargetInput) => void;
  onPinReview?: () => void;
}) {
  return (
    <AeoPanel
      ariaLabel="Connect target"
      title={`Connected target — ${brandName}`}
      description="The site this brand markets, with per-provider validation states."
    >
      {target.status === "loading" ? (
        <PanelLoading label="Loading target connection" />
      ) : target.status === "error" ? (
        <PanelError message={target.message} onRetry={target.onRetry} />
      ) : target.data === null ? (
        <ConnectForm onSubmit={onConnect} pending={connectPending} />
      ) : (
        (() => {
          const connected = target.data;
          return (
            <div className="space-y-3">
              <div className="space-y-1">
                <p className="font-medium break-all">{connected.siteUrl}</p>
                {connected.productIdentifiers.length > 0 ? (
                  <p className={cn("text-sm", tokens.textMuted)}>
                    Product: {connected.productIdentifiers.join(", ")}
                  </p>
                ) : null}
                <p className={cn("text-sm", tokens.textMuted)}>
                  {connected.competitorUrls.length} tracked competitor
                  {connected.competitorUrls.length === 1 ? "" : "s"}
                </p>
              </div>
              {connected.reviewPinned ? (
                <Badge aria-label="Review pinned">Review pinned</Badge>
              ) : (
                <div
                  role="status"
                  className={cn(
                    tokens.noticeWarning,
                    "flex items-center justify-between gap-3",
                  )}
                >
                  <p>
                    Review required: nothing reads or crawls this target until
                    its review is pinned.
                  </p>
                  <Button
                    size="sm"
                    disabled={!onPinReview || pinPending}
                    onClick={() => onPinReview?.()}
                  >
                    Pin review
                  </Button>
                </div>
              )}
              <div className="space-y-2">
                {(Object.keys(PROVIDER_LABEL) as ConnectionProvider[]).map(
                  (provider) => (
                    <ConnectionRow
                      key={provider}
                      provider={provider}
                      validation={connected.connections[provider]}
                    />
                  ),
                )}
              </div>
            </div>
          );
        })()
      )}
    </AeoPanel>
  );
}
