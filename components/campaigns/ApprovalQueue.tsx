"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { ChannelIcon } from "@/components/campaigns/ChannelIcon";
import { tokens } from "@/components/shell/tokens";
import { cn } from "@/lib/utils";
import { channelLabel } from "@/lib/campaignLabels";
import { ToastBanner, useToast } from "./useToast";
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
  unreviewedCitationCount: number;
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
  const [busy, setBusy] = useState(false);
  const [approvingPostId, setApprovingPostId] = useState<string | null>(null);
  const nextRowRef = useRef<HTMLDivElement | null>(null);
  const rowButtonRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const materializeButtonRef = useRef<HTMLButtonElement | null>(null);
  const { toast, showToast } = useToast();

  async function handleAddToCalendar() {
    setBusy(true);
    try {
      const result = await materialize({ campaignId: typedCampaignId });
      showToast(
        result.materialized
          ? `Added to the calendar: ${result.draftCount} drafts are now scheduled-but-unapproved. Click any row to review; approve inline to unblock.`
          : "This batch is already on the calendar."
      );
      const unreviewed = result.unreviewedExcerptCount ?? 0;
      if (result.materialized && unreviewed > 0) {
        showToast(
          `⚠ ${unreviewed} unreviewed citation(s) in this batch — see the warning above.`
        );
      }
    } catch (caught) {
      showToast(caught instanceof Error ? caught.message : "Could not add the batch to the calendar.");
    } finally {
      setBusy(false);
    }
  }

  async function handleApprove(entry: QueueEntry): Promise<boolean> {
    try {
      await setApproval({ postId: entry.postId as never, approvalState: "approved" });
    } catch (caught) {
      showToast(caught instanceof Error ? caught.message : "Could not approve this draft.");
      return false;
    }
    showToast(`Approved — this post is unblocked. Submission still happens in the composer, by you.`);
    return true;
  }

  async function approveAndAdvance(entry: QueueEntry) {
    if (approvingPostId) return;
    setApprovingPostId(entry.postId);
    try {
      const approved = await handleApprove(entry);
      if (!approved) return;
      const remaining = (view?.queue ?? []).filter(
        (candidate) =>
          candidate.seq !== entry.seq && candidate.approvalState !== "approved"
      );
      if (remaining.length === 0) {
        showToast("Campaign fully approved — ready to schedule. Nothing submits automatically.");
        window.setTimeout(() => {
          materializeButtonRef.current?.focus();
        }, 60);
        return;
      }
      const next = remaining[0]!;
      setExpanded(next.postId);
      showToast(
        `Approved — ${view!.approvedCount + 1} of ${view!.totalCount}. Next in sequence: #${next.seq} ${next.title}`
      );
      window.setTimeout(() => {
        // The clicked Approve button unmounts on success; move focus to the
        // next row's expander so keyboard/SR users are not dumped to <body>.
        rowButtonRefs.current.get(next.postId)?.focus();
        nextRowRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 60);
    } finally {
      setApprovingPostId(null);
    }
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
          disabled={busy || view.materialized || view.totalCount === 0}
          onClick={() => void handleAddToCalendar()}
          data-testid="materialize-button"
          ref={materializeButtonRef}
        >
          {busy ? "Adding to calendar…" : view.materialized ? "On the calendar ✓" : "Add batch to calendar"}
        </Button>
      </div>
      <p className={cn("mt-1 text-sm", tokens.textMuted)}>
        Schedule ≠ approval. The queue presents the batch in publishing
        sequence; review inline or open the composer for long-form. Approving
        only unblocks — nothing submits to providers from the campaign.
      </p>

      {!view.materialized ? (
        <div className={cn(tokens.noticeWarning, "mt-4")}>
          Not on the calendar yet — the batch is added after the cohesion
          gate passes (run it on the drafts page).
        </div>
      ) : null}

      {view.totalCount === 0 ? (
        <div className={cn(tokens.notice, "mt-4")} data-testid="queue-empty">
          No draft set yet — generate one from the campaign shape.{" "}
          <Link href={`/campaigns/${campaignId}/drafts`} className={cn("underline", tokens.accent)}>
            Go to drafts
          </Link>
        </div>
      ) : null}

      {view.unreviewedCitationCount > 0 ? (
        <div className={cn(tokens.noticeWarning, "mt-4")} data-testid="unreviewed-warning" role="alert">
          <b>D-17 warning:</b> this batch cites {view.unreviewedCitationCount} excerpt
          {view.unreviewedCitationCount === 1 ? "" : "s"} still marked{" "}
          <b>unreviewed</b>. They may include internal-only material.{" "}
          <Link href="/campaigns" className={cn("underline", tokens.accent)}>
            Review excerpt sensitivity on Campaigns home
          </Link>{" "}
          — expand the corpus row, mark excerpts internal-only or public-safe, then
          re-run the gate.
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
                ref={(el) => {
                  if (el) rowButtonRefs.current.set(entry.postId, el);
                  else rowButtonRefs.current.delete(entry.postId);
                }}
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
                  {channelLabel(entry.channel)}
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
                      <span className={cn("text-xs", tokens.textMuted)}>
                        Long-form — open the composer for the full article, or
                        approve inline if the excerpt reads right.
                      </span>
                    ) : null}
                    {isLongForm && entry.approvalState !== "approved" ? (
                      <Button variant="secondary" size="xs" asChild>
                        <Link href={`/editor/${entry.postId}`}>Open in composer ↗</Link>
                      </Button>
                    ) : null}
                    {entry.approvalState === "approved" ? (
                      <>
                        <Button variant="secondary" size="xs" asChild>
                          <Link href={`/?postId=${entry.postId}`}>Open on calendar ↗</Link>
                        </Button>
                        <span className={cn("text-xs", tokens.textMuted)}>
                          ✓ Approved — this post is unblocked. Submission still
                          happens in the composer, by you.
                        </span>
                      </>
                    ) : (
                      <Button
                        variant="accent"
                        size="xs"
                        disabled={approvingPostId === entry.postId}
                        onClick={() => void approveAndAdvance(entry)}
                        data-testid="approve-draft"
                      >
                        {approvingPostId === entry.postId ? "Approving…" : "Approve draft"}
                      </Button>
                    )}
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      <ToastBanner message={toast} testId="queue-toast" />
    </main>
  );
}
