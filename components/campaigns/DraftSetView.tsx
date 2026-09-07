"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { ChannelIcon } from "@/components/campaigns/ChannelIcon";
import { tokens } from "@/components/shell/tokens";
import { cn } from "@/lib/utils";
import {
  ROLE_LEGEND,
  ROLE_TINTS,
  type SlotRole,
} from "@/lib/campaignShapes";

type DraftEntry = {
  post: {
    _id: string;
    title: string;
    content: string;
    approvalState: string;
    channelId: string;
  };
  slot: { role: SlotRole; channel: string; mediaType: string };
  seq: number;
};

type DraftSetView = {
  campaign: { _id: string; title: string };
  materialization: { _id: string; mode: string } | null;
  drafts: DraftEntry[];
} | null | undefined;

const TOKEN_PATTERN = /(\[[A-Z]+:[^\]]*\])/g;

function renderContentWithTokens(content: string) {
  return content.split(TOKEN_PATTERN).map((part, index) => {
    if (/^\[[A-Z]+:/.test(part)) {
      return (
        <span
          key={index}
          className="rounded bg-[#ffefe0] px-1 py-0.5 font-mono text-[11px] text-[#8a4b00]"
        >
          {part}
        </span>
      );
    }
    return <span key={index}>{part}</span>;
  });
}

export function DraftSetView({ campaignId }: { campaignId: string }) {
  const typedCampaignId = campaignId as never;
  const view = useQuery(api.draftSet.getDraftSet, {
    campaignId: typedCampaignId,
  }) as DraftSetView;

  const generateDraftSet = useMutation(api.draftSet.generateDraftSet);

  const [mockConfirmOpen, setMockConfirmOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  function showToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(null), 3600);
  }

  async function handleGenerate() {
    setGenerating(true);
    try {
      const result = await generateDraftSet({
        campaignId: typedCampaignId,
        mockAcknowledged: true,
      });
      setMockConfirmOpen(false);
      showToast(
        result.alreadyGenerated
          ? "The draft set for this shape is already generated."
          : `Generated ${result.draftCount} placeholder drafts as one set — every one starts unapproved.`
      );
    } catch (caught) {
      showToast(caught instanceof Error ? caught.message : "Generation failed.");
    } finally {
      setGenerating(false);
    }
  }

  if (view === undefined) {
    return (
      <main className={cn(tokens.maxWidth)}>
        <p className={cn("text-sm", tokens.textMuted)}>Loading draft set…</p>
      </main>
    );
  }
  if (view === null) {
    return (
      <main className={cn(tokens.maxWidth)}>
        <p className="text-sm font-semibold text-red-700">Campaign not found.</p>
        <Link href="/campaigns" className={cn("text-sm underline", tokens.accent)}>
          Back to Campaigns
        </Link>
      </main>
    );
  }

  return (
    <main className={cn(tokens.maxWidth)}>
      <div className="flex flex-wrap items-baseline gap-3">
        <h1 className="text-xl font-semibold">Draft set</h1>
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/campaigns/${campaignId}/shape`}>Back to shape</Link>
        </Button>
        <div className="ml-auto flex items-center gap-2">
          <span className="rounded-full bg-[#fff1e0] px-2.5 py-0.5 text-[11px] font-normal text-[#b25400]">
            mock AI
          </span>
          <Button
            variant="primary"
            size="sm"
            disabled={generating || !view.materialization}
            onClick={() => setMockConfirmOpen(true)}
            data-testid="generate-draft-set"
          >
            {view.materialization
              ? "Regenerate (coming with the agent layer)"
              : "Generate draft set"}
          </Button>
        </div>
      </div>
      <p className={cn("mt-1 text-sm", tokens.textMuted)}>
        Placeholders are generated <b>as one set</b> from the accepted shape —
        never per-post. Bracketed tokens mark what the real skill pack would
        fill. Everything lands <b>scheduled-but-unapproved</b> once materialized;
        nothing auto-approves.
      </p>

      {mockConfirmOpen ? (
        <div
          className={cn(tokens.noticeWarning, "mt-4")}
          data-testid="draft-mock-confirm"
        >
          <p>
            Generation runs in <b>mock mode</b> — placeholder drafts composed
            from your accepted shape, linked ideas, and cited excerpts. Nothing
            publishes and nothing submits.
          </p>
          <div className="mt-2 flex gap-2">
            <Button size="xs" disabled={generating} onClick={() => void handleGenerate()}>
              {generating ? "Generating…" : "Run in mock mode"}
            </Button>
            <Button variant="ghost" size="xs" onClick={() => setMockConfirmOpen(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

      {view.materialization && view.drafts.length === 0 ? (
        <p className={cn("mt-6 text-sm", tokens.textMuted)}>
          Draft set generated — hydrating…
        </p>
      ) : null}

      {!view.materialization ? (
        <div className={cn(tokens.panel, "mt-6 border-dashed px-6 py-10 text-center")}>
          <p className={cn("text-sm", tokens.textMuted)}>
            No draft set yet. Generation is gated: it runs only from an accepted
            shape, in acknowledged mock mode, and produces visibly
            placeholder-grade copy.
          </p>
        </div>
      ) : null}

      <div className="mt-5 space-y-3" data-testid="draft-list">
        {view.drafts.map((entry) => (
          <article
            key={entry.post._id}
            className={cn(tokens.panel, "p-4")}
            data-testid="draft-card"
          >
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span
                className={cn(
                  "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-normal uppercase tracking-wide",
                  ROLE_TINTS[entry.slot.role]
                )}
                title={ROLE_LEGEND[entry.slot.role]}
              >
                {entry.slot.role}
              </span>
              <span className="inline-flex items-center gap-1.5 text-[13px] font-medium">
                <ChannelIcon channel={entry.post.channelId} />
                {entry.post.channelId === "corvo-blog" ? "Corvo Blog" : entry.post.channelId}
              </span>
              <span className="text-[13px]">{entry.slot.mediaType}</span>
              <span className={cn("text-xs", tokens.textMuted)}>
                #{entry.seq} in publishing sequence
              </span>
              <span
                className={cn(
                  "ml-auto rounded-full px-2.5 py-0.5 text-[11px] font-normal",
                  entry.post.approvalState === "approved"
                    ? "bg-[#e2f2e6] text-[#1d5c31]"
                    : "bg-[#fde5ee] text-[#a11441]"
                )}
                data-testid="approval-badge"
              >
                {entry.post.approvalState}
              </span>
            </div>
            <h2 className="text-[15px] font-semibold">{entry.post.title}</h2>
            <div className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed">
              {renderContentWithTokens(entry.post.content)}
            </div>
          </article>
        ))}
      </div>

      {toast ? (
        <div
          role="status"
          className="fixed bottom-6 right-6 z-50 max-w-sm rounded-lg bg-[#001524] px-4 py-3 text-sm text-[#ffecd1] shadow-lg"
          data-testid="drafts-toast"
        >
          {toast}
        </div>
      ) : null}
    </main>
  );
}
