"use client";

import { useRef, useState } from "react";
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

type QueueEntry = {
  postId: string;
  seq: number;
  role: string;
  mediaType: string;
  channel: string;
  title: string;
  content: string;
  approvalState: string;
  status: string;
  scheduledDate: string | null;
  scheduledTime: string | null;
};

type QueueView = {
  campaign: { _id: string; title: string };
  queue: QueueEntry[];
  approvedCount: number;
  totalCount: number;
  nextSeq: number | null;
  allApproved: boolean;
  materialized: boolean;
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

export function ApprovalQueue({ campaignId }: { campaignId: string }) {
  const typedCampaignId = campaignId as never;
  const view = useQuery(api.queue.getCampaignQueue, {
    campaignId: typedCampaignId,
  }) as QueueView;

  const materialize = useMutation(api.queue.materializeDraftSet);
  const setApproval = useMutation(api.publishing.setApproval);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const nextRowRef = useRef<HTMLDivElement | null>(null);

  function showToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(null), 4200);
  }

  async function handleMaterialize() {
    setBusy(true);
    try {
      const result = await materialize({ campaignId: typedCampaignId });
      showToast(
        result.materialized
          ? `Materialized: ${result.draftCount} drafts are now scheduled-but-unapproved on the calendar. Click any row to review; approve inline to unblock.`
          : "This batch is already on the calendar."
      );
    } catch (caught) {
      showToast(caught instanceof Error ? caught.message : "Materialize failed.");
    } finally {
      setBusy(false);
    }
  }

  async function handleApprove(entry: QueueEntry) {
    await setApproval({ postId: entry.postId as never, approvalState: "approved" });
    showToast(`Approved — this post is unblocked. Submission still happens in the composer, by you.`);
  }

  function approveAndAdvance(entry: QueueEntry) {
    void handleApprove(entry).then(() => {
      const remaining = (view?.queue ?? []).filter(
        (candidate) =>
          candidate.seq !== entry.seq && candidate.approvalState !== "approved"
      );
      if (remaining.length === 0) {
        showToast("Campaign fully approved — ready to schedule. Nothing submits automatically.");
      } else {
        const next = remaining[0]!;
        setExpanded(next.postId);
        showToast(
          `Approved — ${view!.approvedCount + 1} of ${view!.totalCount}. Next in sequence: #${next.seq} ${next.title}`
        );
        window.setTimeout(() => {
          nextRowRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
        }, 60);
      }
    });
  }

  if (view === undefined) {
    return (
      <main className={cn(tokens.maxWidth)}>
        <p className={cn("text-sm", tokens.textMuted)}>Loading approval queue…</p>
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

  const nextEntry = view.queue.find((entry) => entry.seq === view.nextSeq);

  return (
    <main className={cn(tokens.maxWidth)}>
      <div className="flex flex-wrap items-baseline gap-3">
        <h1 className="text-xl font-semibold">Approval queue</h1>
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/campaigns/${campaignId}/drafts`}>Back to drafts</Link>
        </Button>
        <Button
          variant="primary"
          size="sm"
          className="ml-auto"
          disabled={busy || view.materialized}
          onClick={() => void handleMaterialize()}
          data-testid="materialize-button"
        >
          {busy ? "Materializing…" : view.materialized ? "Materialized ✓" : "Materialize to calendar"}
        </Button>
      </div>
      <p className={cn("mt-1 text-sm", tokens.textMuted)}>
        Schedule ≠ approval. The queue presents the batch in publishing
        sequence; review inline or open the composer for long-form. Approving
        only unblocks — nothing submits to providers from the campaign.
      </p>

      {!view.materialized ? (
        <div className={cn(tokens.noticeWarning, "mt-4")}>
          Not on the calendar yet — the batch materializes after the cohesion
          gate passes (run it on the drafts page).
        </div>
      ) : null}

      {view.totalCount > 0 && view.materialized ? (
        <div className={cn(tokens.notice, "mt-4")} data-testid="queue-banner">
          {view.allApproved ? (
            <span>
              ✓ Campaign fully approved — ready to schedule. <b>Nothing submits automatically;</b>{" "}
              sending stays in your hands in the composer.
            </span>
          ) : view.approvedCount > 0 && nextEntry ? (
            <span>
              {view.approvedCount} of {view.totalCount} approved · next in
              publishing sequence: <b>#{nextEntry.seq} {nextEntry.title}</b>
            </span>
          ) : (
            <span>
              {view.totalCount} drafts on the calendar, all awaiting review.
            </span>
          )}
        </div>
      ) : null}

      <div className="mt-4 space-y-2" data-testid="queue-list">
        {view.queue.map((entry) => {
          const isExpanded = expanded === entry.postId;
          const isNext = entry.seq === view.nextSeq;
          const isLongForm = entry.mediaType === "article";
          return (
            <div
              key={entry.postId}
              ref={isNext ? nextRowRef : undefined}
              className={cn(tokens.panel, "overflow-hidden")}
              data-testid="queue-row"
            >
              <button
                type="button"
                className="flex w-full flex-wrap items-center gap-2.5 px-4 py-3 text-left"
                onClick={() => setExpanded(isExpanded ? null : entry.postId)}
                aria-expanded={isExpanded}
              >
                <span className="text-sm text-[#15616d]">#{entry.seq}</span>
                <span
                  className={cn(
                    "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-normal uppercase tracking-wide",
                    ROLE_TINTS[entry.role as SlotRole] ?? tokens.pillIdle
                  )}
                  title={ROLE_LEGEND[entry.role as SlotRole]}
                >
                  {entry.role}
                </span>
                <span className="inline-flex items-center gap-1.5 text-[13px] font-medium">
                  <ChannelIcon channel={entry.channel} />
                  {entry.channel === "corvo-blog" ? "Corvo Blog" : entry.channel}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium">
                  {entry.title}
                </span>
                {entry.scheduledDate ? (
                  <span className={cn("text-xs", tokens.textMuted)}>
                    {entry.scheduledDate} {entry.scheduledTime ?? ""}
                  </span>
                ) : null}
                <span
                  className={cn(
                    "rounded-full px-2.5 py-0.5 text-[11px] font-normal",
                    entry.approvalState === "approved"
                      ? "bg-[#e2f2e6] text-[#1d5c31]"
                      : "bg-[#fde5ee] text-[#a11441]"
                  )}
                  data-testid="queue-approval-badge"
                >
                  {entry.approvalState === "approved" ? "approved" : "unapproved"}
                </span>
                <span className="text-xs text-[#15616d]">
                  {isExpanded ? "Reviewed ▴" : "Review ▾"}
                </span>
              </button>
              {isExpanded ? (
                <div className="border-t px-4 pb-4 pt-3" style={{ borderColor: "rgba(0,0,0,0.08)" }} data-testid="queue-expand">
                  <div className="whitespace-pre-wrap text-sm leading-relaxed">
                    {renderContentWithTokens(entry.content)}
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {isLongForm ? (
                      <>
                        <span className={cn("text-xs", tokens.textMuted)}>
                          Long-form — the composer is the better review surface
                          for the full article.
                        </span>
                        <Button variant="secondary" size="xs" asChild>
                          <Link href={`/editor/${entry.postId}`}>Open in composer ↗</Link>
                        </Button>
                      </>
                    ) : null}
                    {entry.approvalState === "approved" ? (
                      <span className={cn("text-xs", tokens.textMuted)}>
                        ✓ Approved — this post is unblocked. Submission still
                        happens in the composer, by you.
                      </span>
                    ) : !isLongForm ? (
                      <Button
                        variant="accent"
                        size="xs"
                        onClick={() => approveAndAdvance(entry)}
                        data-testid="approve-draft"
                      >
                        Approve draft
                      </Button>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {toast ? (
        <div
          role="status"
          className="fixed bottom-6 right-6 z-50 max-w-sm rounded-lg bg-[#001524] px-4 py-3 text-sm text-[#ffecd1] shadow-lg"
          data-testid="queue-toast"
        >
          {toast}
        </div>
      ) : null}
    </main>
  );
}
