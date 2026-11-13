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

function ConnectionRow({
  provider,
  validation,
  onValidate,
}: {
  provider: ConnectionProvider;
  validation: ConnectionValidation;
  onValidate?: (provider: ConnectionProvider) => void;
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
        <Button
          variant="outline"
          size="sm"
          disabled={!onValidate}
          onClick={() => onValidate?.(provider)}
        >
          Validate
        </Button>
      </div>
    </div>
  );
}

function ConnectForm({
  onSubmit,
}: {
  onSubmit?: (input: ConnectTargetInput) => void;
}) {
  const [siteUrl, setSiteUrl] = useState("");
  const [competitorUrls, setCompetitorUrls] = useState("");
  const valid = /^https?:\/\/\S+\.\S+/.test(siteUrl.trim());
  return (
    <form
      aria-label="Connect target form"
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (!valid) return;
        onSubmit?.({
          siteUrl: siteUrl.trim(),
          competitorUrls: competitorUrls
            .split(/[\s,]+/)
            .map((url) => url.trim())
            .filter(Boolean),
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
      {!valid && siteUrl.trim() !== "" ? (
        <p role="alert" className="text-sm">
          Enter a full URL starting with http:// or https://.
        </p>
      ) : null}
      <Button type="submit" size="sm" disabled={!valid || !onSubmit}>
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
  onConnect,
  onPinReview,
  onValidate,
}: {
  brandName: string;
  target: Loadable<BrandTarget | null>;
  onConnect?: (input: ConnectTargetInput) => void;
  onPinReview?: () => void;
  onValidate?: (provider: ConnectionProvider) => void;
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
        <ConnectForm onSubmit={onConnect} />
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
                    disabled={!onPinReview}
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
                      onValidate={onValidate}
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
