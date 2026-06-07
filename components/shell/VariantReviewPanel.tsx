"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { MainCard } from "@/components/shell/MainCard";
import { Notice } from "@/components/shell/Notice";
import { PageHeader } from "@/components/shell/PageHeader";
import { WorkspaceLayout } from "@/components/shell/WorkspaceLayout";
import { tokens } from "@/components/shell/tokens";
import { Button } from "@/components/ui/button";
import { CHANNEL_LABELS } from "@/lib/domain";
import { cn } from "@/lib/utils";
import { FileText } from "lucide-react";

type VariantReviewPanelProps = {
  postId: string;
};

function today() {
  return new Date().toISOString().slice(0, 10);
}

function currentTimezone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Los_Angeles";
}

export function VariantReviewPanel({ postId }: VariantReviewPanelProps) {
  const router = useRouter();
  const { isLoading: isConvexAuthLoading, isAuthenticated: isConvexAuthenticated } =
    useConvexAuth();
  const acceptVariantPost = useMutation(api.publishing.acceptVariantPost);
  const rejectVariantPost = useMutation(api.publishing.rejectVariantPost);
  const post = useQuery(
    api.publishing.getPostById,
    isConvexAuthenticated ? { postId } : "skip"
  );
  const [busy, setBusy] = useState<"accept" | "reject" | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function acceptVariant() {
    if (!post) return;
    setBusy("accept");
    setNotice(null);
    try {
      await acceptVariantPost({
        postId: post._id as Id<"v2Posts">,
        scheduledDate: today(),
        scheduledTime: "09:00",
        timezone: currentTimezone(),
      });
      router.push(`/?postId=${post._id}`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Failed to accept variant.");
      setBusy(null);
    }
  }

  async function rejectVariant() {
    if (!post) return;
    setBusy("reject");
    setNotice(null);
    try {
      await rejectVariantPost({ postId: post._id as Id<"v2Posts"> });
      router.push(`/?postId=${post._id}`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Failed to reject variant.");
      setBusy(null);
    }
  }

  const reviewStatus = post?.variantReviewStatus ?? "pending";
  const isPending = reviewStatus === "pending";

  const statusBanner = isConvexAuthLoading ? (
    <Notice>Connecting your Convex workspace…</Notice>
  ) : !isConvexAuthenticated ? (
    <Notice variant="warning">Sign in to review this variant.</Notice>
  ) : notice ? (
    <Notice>{notice}</Notice>
  ) : !post ? (
    <Notice>Variant not found or access denied.</Notice>
  ) : null;

  return (
    <WorkspaceLayout
      banner={statusBanner}
      header={
        <PageHeader
          actions={
            <Button asChild variant="outline">
              <Link href="/research">Back to Research</Link>
            </Button>
          }
          description={
            post
              ? isPending
                ? "Review the full draft before accepting into the calendar."
                : `Status: ${reviewStatus}`
              : "Loading variant…"
          }
          icon={<FileText size={16} />}
          label="Variant review"
          title={post?.title ?? "Loading variant…"}
        />
      }
    >
      {post ? (
        <MainCard className="flex min-h-[calc(100vh-12rem)] flex-col">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-black/10 p-4">
            <div>
              <p className="text-sm font-semibold">{CHANNEL_LABELS[post.channelId]}</p>
              <p className={cn("mt-1 text-sm", tokens.textMuted)}>
                {isPending
                  ? "Accept to schedule in the calendar, or reject to discard."
                  : `Review status: ${reviewStatus}`}
              </p>
            </div>
            {isPending ? (
              <div className="flex flex-wrap gap-2">
                <Button disabled={busy !== null} onClick={acceptVariant} type="button" variant="accent">
                  {busy === "accept" ? "Accepting…" : "Accept"}
                </Button>
                <Button
                  disabled={busy !== null}
                  onClick={rejectVariant}
                  type="button"
                  variant="outline"
                >
                  {busy === "reject" ? "Rejecting…" : "Reject"}
                </Button>
              </div>
            ) : (
              <Button asChild variant="outline">
                <Link href={`/?postId=${post._id}`}>Open in calendar</Link>
              </Button>
            )}
          </div>
          <div className="min-h-0 flex-1 overflow-auto p-4">
            <pre className={cn("whitespace-pre-wrap font-mono text-sm leading-relaxed", tokens.text)}>
              {post.content}
            </pre>
          </div>
        </MainCard>
      ) : null}
    </WorkspaceLayout>
  );
}
