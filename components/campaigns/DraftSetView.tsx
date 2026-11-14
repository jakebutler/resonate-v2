"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { ChannelIcon } from "@/components/campaigns/ChannelIcon";
import { ReviewPassesPanel } from "@/components/campaigns/ReviewPassesPanel";
import { tokens } from "@/components/shell/tokens";
import { cn } from "@/lib/utils";
import { channelLabel } from "@/lib/campaignLabels";
import { ToastBanner, useToast } from "./useToast";
import { ContentWithTokens } from "./ContentWithTokens";
import { typedId } from "@/lib/typedIds";
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
  shapeAccepted?: boolean;
  liveGenerationAvailable?: boolean;
} | null | undefined;

export function DraftSetView({ campaignId }: { campaignId: string }) {
  const typedCampaignId = typedId<"campaigns">(campaignId);
  const view = useQuery(api.draftSet.getDraftSet, {
    campaignId: typedCampaignId,
  }) as DraftSetView;

  const generateDraftSet = useMutation(api.draftSet.generateDraftSet);
  const generateLiveDraftSet = useAction(api.draftGeneration.generateLiveDraftSet);
  const requestMockAcknowledgment = useMutation(
    api.mockAck.requestMockAcknowledgment
  );

  const [mockConfirmOpen, setMockConfirmOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const { toast, showToast } = useToast(3600);

  const liveAvailable = view?.liveGenerationAvailable === true;

  async function handleLiveGenerate() {
    setGenerating(true);
    try {
      const result = await generateLiveDraftSet({
        campaignId: typedCampaignId,
      });
      showToast(
        `Generated ${result.draftCount} AI drafts grounded in your corpus citations — every one unapproved; cohesion gate run #${result.cohesionRunNumber} ${result.cohesionPassed ? "passed" : "is blocking"}.`
      );
    } catch (caught) {
      showToast(caught instanceof Error ? caught.message : "Live generation failed.");
    } finally {
      setGenerating(false);
    }
  }

  async function handleGenerate() {
    setGenerating(true);
    try {
      // D-21: the confirm dialog mints a server-issued acknowledgment token;
      // the client never asserts acknowledgment on its own.
      const ack = await requestMockAcknowledgment({
        campaignId: typedCampaignId,
      });
      const result = await generateDraftSet({
        campaignId: typedCampaignId,
        mockAckToken: ack.token,
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
        {view.materialization ? (
          <Button variant="accent" size="sm" className="ml-auto" asChild>
            <Link href={`/campaigns/${campaignId}/queue`} data-testid="queue-link">
              Approval queue
            </Link>
          </Button>
        ) : null}
        <div className={cn("flex items-center gap-2", !view?.materialization && "ml-auto")}>
          <span className="rounded-full bg-[#fff1e0] px-2.5 py-0.5 text-[11px] font-normal text-[#b25400]">
            {view.materialization?.mode === "live"
              ? "Generated with AI"
              : "Sample content — offline"}
          </span>
          {view.materialization ? (
            <span className={cn("text-xs", tokens.textMuted)}>
              One set per shape — regeneration arrives with live generation.
            </span>
          ) : liveAvailable ? (
            <Button
              variant="primary"
              size="sm"
              disabled={generating || view.shapeAccepted !== true}
              title={
                view.shapeAccepted
                  ? undefined
                  : "Accept a complete shape on the shape page first."
              }
              onClick={() => void handleLiveGenerate()}
              data-testid="generate-draft-set-live"
            >
              {generating ? "Generating…" : "Generate with AI"}
            </Button>
          ) : (
            <Button
              variant="primary"
              size="sm"
              disabled={generating || view.shapeAccepted !== true}
              title={
                view.shapeAccepted
                  ? undefined
                  : "Accept a complete shape on the shape page first."
              }
              onClick={() => setMockConfirmOpen(true)}
              data-testid="generate-draft-set"
            >
              Generate draft set
            </Button>
          )}
        </div>
      </div>
      <p className={cn("mt-1 text-sm", tokens.textMuted)}>
        {liveAvailable
          ? "AI drafts are generated as one set from the accepted shape, grounded in your corpus citations — every draft stays unapproved until a human approves it."
          : "Placeholders are generated as one set from the accepted shape — never per-post. Labeled placeholders mark where real generated copy would go. Everything lands scheduled-but-unapproved once it is added to the calendar; nothing auto-approves."}
      </p>

      {mockConfirmOpen ? (
        <div
          className={cn(tokens.noticeWarning, "mt-4")}
          data-testid="draft-mock-confirm"
        >
          <p>
            This generates <b>sample content</b> — placeholder drafts composed
            from your accepted shape, linked ideas, and cited excerpts. Nothing
            publishes and nothing submits.
          </p>
          <div className="mt-2 flex gap-2">
            <Button size="xs" disabled={generating} onClick={() => void handleGenerate()}>
              {generating ? "Generating…" : "Generate sample drafts"}
            </Button>
            <Button variant="ghost" size="xs" onClick={() => setMockConfirmOpen(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

      {view.materialization && view.drafts.length === 0 ? (
        <p className={cn("mt-6 text-sm", tokens.textMuted)}>
          Draft set ready — loading the drafts…
        </p>
      ) : null}

      {!view.materialization ? (
        <div className={cn(tokens.panel, "mt-6 border-dashed px-6 py-10 text-center")}>
          <p className={cn("text-sm", tokens.textMuted)}>
            No draft set yet. Generation is gated: it runs only from an accepted
            shape — with AI drafting when a verified gateway credential is
            configured, and as offline sample content otherwise. Every draft
            lands visibly unapproved either way.
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
                {channelLabel(entry.post.channelId)}
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
              <ContentWithTokens content={entry.post.content} />
            </div>
          </article>
        ))}
      </div>

      <ReviewPassesPanel campaignId={campaignId} />

      <ToastBanner message={toast} testId="drafts-toast" />
    </main>
  );
}
