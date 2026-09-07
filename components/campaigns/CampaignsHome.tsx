"use client";

import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { IngestDocumentFlow } from "@/components/campaigns/IngestDocumentFlow";
import { StartCampaignDialog } from "@/components/campaigns/StartCampaignDialog";
import { CorpusExcerptReview } from "@/components/campaigns/CorpusExcerptReview";
import { tokens } from "@/components/shell/tokens";
import { cn } from "@/lib/utils";
import { BRANDS, type BrandId } from "@/lib/domain";

type CampaignSummary = {
  _id: string;
  title: string;
  brandId: string;
  status: string;
  corpusIds: string[];
  updatedAt: number;
};

type CorpusSummary = {
  _id: string;
  brandId: string;
  origin: string;
  version: number;
  createdAt: number;
};

function brandLabel(brandId: string) {
  return BRANDS.find((brand) => brand.id === brandId)?.name ?? brandId;
}

function formatDate(timestamp: number) {
  return new Date(timestamp).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export function CampaignsHome() {
  const [brandId, setBrandId] = useState<BrandId>("corvo");
  const [ingestOpen, setIngestOpen] = useState(false);
  const [startOpen, setStartOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [openCorpusId, setOpenCorpusId] = useState<string | null>(null);

  const campaigns = useQuery(api.campaigns.listCampaigns, {}) as
    | CampaignSummary[]
    | undefined;
  const corpora = useQuery(api.corpora.listCorpora, { brandId }) as
    | CorpusSummary[]
    | undefined;

  const visibleCampaigns = useMemo(
    () => (campaigns ?? []).filter((campaign) => campaign.brandId === brandId),
    [campaigns, brandId]
  );
  const nextVersion = (corpora?.[0]?.version ?? 0) + 1;

  function showToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(null), 3600);
  }

  return (
    <main className={cn(tokens.maxWidth)}>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold">Campaigns</h1>
        <div className="ml-auto flex items-center gap-1.5" role="tablist" aria-label="Brand">
          {BRANDS.map((brand) => (
            <button
              key={brand.id}
              type="button"
              role="tab"
              aria-selected={brandId === brand.id}
              onClick={() => setBrandId(brand.id)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs transition-colors",
                brandId === brand.id ? tokens.pillActive : tokens.pillIdle
              )}
            >
              {brand.name}
            </button>
          ))}
        </div>
      </div>
      <p className={cn("mt-1 text-sm", tokens.textMuted)}>
        Turn source material into a cohesive batch of drafts: ingest into the
        brand corpus, work a session, shape the set, then review on the
        calendar. Nothing auto-approves and nothing submits automatically.
      </p>

      <section className="mt-5 grid gap-4 lg:grid-cols-2" aria-label="Brand corpus">
        <div className={cn(tokens.panel, "p-4")}>
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">
              {brandLabel(brandId)} corpus
            </h2>
            <Button
              variant="primary"
              size="sm"
              onClick={() => setIngestOpen((open) => !open)}
              data-testid="toggle-ingest"
            >
              {ingestOpen ? "Close ingest" : "Ingest document"}
            </Button>
          </div>
          {ingestOpen ? (
            <div className="mt-3">
              <IngestDocumentFlow
                brandId={brandId}
                nextVersion={nextVersion}
                onSaved={(result) => {
                  setIngestOpen(false);
                  showToast(
                    `Saved to ${brandLabel(brandId)} corpus · v${result.version} (immutable). Start a campaign to work it.`
                  );
                  setStartOpen(true);
                }}
              />
            </div>
          ) : null}
          <ul className="mt-3 space-y-2" data-testid="corpus-list">
            {(corpora ?? []).map((corpus) => (
              <li
                key={corpus._id}
                className={cn(
                  "rounded-lg border text-sm",
                  tokens.border
                )}
              >
                <button
                  type="button"
                  className="flex w-full flex-wrap items-center gap-2 px-3 py-2 text-left"
                  onClick={() =>
                    setOpenCorpusId(openCorpusId === corpus._id ? null : corpus._id)
                  }
                  aria-expanded={openCorpusId === corpus._id}
                >
                  <span className="font-medium">
                    {brandLabel(corpus.brandId)} corpus · v{corpus.version}
                  </span>
                  <span className="rounded-full bg-[#ffefe0] px-2 py-0.5 text-[11px] font-normal text-[#8a4b00]">
                    {corpus.origin}
                  </span>
                  <span className={cn("ml-auto text-xs", tokens.textMuted)}>
                    {formatDate(corpus.createdAt)}
                  </span>
                  <span className="text-xs text-[#15616d]">
                    {openCorpusId === corpus._id ? "▴" : "Review excerpts ▾"}
                  </span>
                </button>
                {openCorpusId === corpus._id ? (
                  <div className="border-t" style={{ borderColor: "rgba(0,0,0,0.06)" }}>
                    <CorpusExcerptReview brandId={brandId} corpusId={corpus._id} />
                  </div>
                ) : null}
              </li>
            ))}
            {corpora && corpora.length === 0 ? (
              <li className={cn("rounded-lg border border-dashed px-3 py-6 text-center text-sm", tokens.border, tokens.textMuted)}>
                No corpus versions yet — ingest a document to create v1.
              </li>
            ) : null}
          </ul>
        </div>

        <div className={cn(tokens.panel, "p-4")}>
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">Campaigns</h2>
            <Button
              variant="accent"
              size="sm"
              onClick={() => setStartOpen(true)}
              data-testid="toggle-start-campaign"
            >
              New campaign
            </Button>
          </div>
          <ul className="mt-3 space-y-2" data-testid="campaign-list">
            {visibleCampaigns.map((campaign) => (
              <li
                key={campaign._id}
                className={cn(
                  "flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-sm",
                  tokens.border
                )}
              >
                <span className="font-medium">{campaign.title}</span>
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[11px] font-normal",
                    tokens.accentBg,
                    tokens.accent
                  )}
                >
                  {campaign.status}
                </span>
                {campaign.corpusIds.length > 0 ? (
                  <span className={cn("text-[11px]", tokens.textMuted)}>
                    {campaign.corpusIds.length} corpus version
                    {campaign.corpusIds.length === 1 ? "" : "s"}
                  </span>
                ) : null}
                <span className={cn("ml-auto text-xs", tokens.textMuted)}>
                  {formatDate(campaign.updatedAt)}
                </span>
              </li>
            ))}
            {visibleCampaigns.length === 0 ? (
              <li className={cn("rounded-lg border border-dashed px-3 py-6 text-center text-sm", tokens.border, tokens.textMuted)}>
                No campaigns yet for {brandLabel(brandId)}.
              </li>
            ) : null}
          </ul>
        </div>
      </section>

      <StartCampaignDialog
        brandId={brandId}
        open={startOpen}
        onOpenChange={setStartOpen}
        onCreated={(campaignId) => {
          showToast("Campaign started — title-only, light confirm. Goal & audience land on the Propose shape step.");
          window.location.href = `/campaigns/${campaignId}`;
        }}
      />

      {toast ? (
        <div
          role="status"
          className="fixed bottom-6 right-6 z-50 max-w-sm rounded-lg bg-[#001524] px-4 py-3 text-sm text-[#ffecd1] shadow-lg"
          data-testid="campaigns-toast"
        >
          {toast}
        </div>
      ) : null}
    </main>
  );
}
