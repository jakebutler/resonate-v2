"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import type { reviewRow } from "@/convex/seriesReview";
type Row = Omit<Doc<"seriesReviewRows">, "snapshot"> & {
  snapshot: Awaited<ReturnType<typeof reviewRow>>["snapshot"];
  staleReason: string | null;
  heroUrl: string | null;
};
export function SeriesReviewPanel({
  seriesId,
  posts,
}: {
  seriesId: Id<"postSeries">;
  posts: Doc<"v2Posts">[];
}) {
  const selection = useQuery(api.seriesReview.selection, { seriesId }) as
    | Doc<"seriesReviewSelections">
    | null
    | undefined;
  const review = useQuery(api.seriesReview.packet, { seriesId }) as
    | { packet: Doc<"seriesReviewPackets">; rows: Row[]; stale: boolean }
    | null
    | undefined;
  const select = useMutation(api.seriesReview.select);
  const prepare = useMutation(api.seriesReview.prepare);
  const approve = useMutation(api.seriesReview.approve);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const alert = useRef<HTMLParagraphElement>(null);
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Review failed.");
      alert.current?.focus();
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      aria-label="Selected editorial review"
      className="space-y-4 rounded border p-4"
    >
      <h3 className="text-lg font-semibold">
        Review selected editorial versions
      </h3>
      <p>
        Choose up to 50 posts. Selection and exact review packets are saved in
        Convex. Approval records editorial versions; every release still
        requires a separate queue review.
      </p>
      <fieldset disabled={busy}>
        <legend>
          Selected series posts ({selection?.postIds.length ?? 0})
        </legend>
        {posts.map((post) => (
          <label className="block py-1" key={post._id}>
            <input
              type="checkbox"
              checked={selection?.postIds.includes(post._id) ?? false}
              onChange={(e) => {
                const next = e.target.checked
                  ? [...(selection?.postIds ?? []), post._id]
                  : (selection?.postIds ?? []).filter((id) => id !== post._id);
                void run(async () => {
                  await select({
                    seriesId,
                    postIds: next,
                    expectedRevision: selection?.revision ?? 0,
                  });
                  setMessage("Selection saved; prepare a new packet.");
                });
              }}
            />{" "}
            {post.title} · {post.channelId} · {post.approvalState}
          </label>
        ))}
      </fieldset>
      <button
        className="rounded border px-3 py-2"
        disabled={busy || !selection?.postIds.length}
        onClick={() =>
          void run(async () => {
            await prepare({ seriesId, expectedRevision: selection!.revision });
            setMessage(
              "Saved exact selected review packet. Read each complete row before approving.",
            );
          })
        }
      >
        Prepare selected review packet
      </button>
      <p role="alert" tabIndex={-1} ref={alert}>
        {message}
      </p>
      {review && (
        <>
          <p>
            Packet {review.packet._id} · {review.rows.length} selected ·
            reviewed {new Date(review.packet.createdAt).toLocaleString()}
          </p>
          {review.stale && (
            <p role="status">
              This packet is stale because selection, membership or a row
              changed. Prepare a new packet.
            </p>
          )}
          <div className="space-y-4">
            {review.rows.map((row) => {
              const s = row.snapshot;
              const p = s.post;
              return (
                <article
                  key={row._id}
                  id={`review-${row.postId}`}
                  tabIndex={-1}
                  className="space-y-2 rounded border p-4"
                >
                  <h4 className="font-semibold">
                    {p.title} · {p.channelId}
                  </h4>
                  <Link className="underline" href={`/?postId=${row.postId}`}>
                    Edit {p.title} in composer
                  </Link>
                  {row.staleReason && (
                    <p role="status">Needs review: {row.staleReason}</p>
                  )}
                  <p>
                    {p.approvalState} ·{" "}
                    {s.providerState?.simulated
                      ? "Simulated receipt"
                      : (s.providerState?.status ?? p.status)}
                  </p>
                  <pre className="whitespace-pre-wrap break-words font-sans">
                    {s.finalContent}
                  </pre>
                  {p.linkedinFirstComment && (
                    <>
                      <h5>Final first comment</h5>
                      <pre className="whitespace-pre-wrap break-words">
                        {p.linkedinFirstComment}
                      </pre>
                    </>
                  )}
                  {p.channelId === "corvo-blog" && (
                    <>
                      <p>
                        Export intent:{" "}
                        {p.blogPublicationIntent ?? "Review required"} · slug:{" "}
                        {p.blogSlug ?? "required"}
                      </p>
                      <p>Excerpt: {p.blogExcerpt}</p>
                      <p>
                        Author: {p.blogAuthor} · Category: {p.blogCategory} ·
                        Tags: {p.blogTags?.join(", ")}
                      </p>
                      <p>Manual hero alt: {p.coverImageAlt ?? "required"}</p>
                      {row.heroUrl && (
                        <Image
                          unoptimized
                          src={row.heroUrl}
                          alt={p.coverImageAlt ?? "Unreviewed hero"}
                          width={800}
                          height={450}
                          className="h-auto max-w-full rounded"
                        />
                      )}
                      <p>
                        Prepared hero:{" "}
                        {p.preparedHero
                          ? `${p.preparedHero.width}×${p.preparedHero.height} · ${p.preparedHero.byteLength} bytes · SHA-256 ${p.preparedHero.sha256}`
                          : "Review required"}
                      </p>
                    </>
                  )}
                  <p>
                    Local schedule: {p.scheduledDate ?? "missing"}{" "}
                    {p.scheduledTime ?? "missing"} {p.timezone} · UTC{" "}
                    {s.dueAt ?? "unverified"}
                  </p>
                  {p.channelId === "linkedin" && (
                    <p>
                      Account:{" "}
                      {s.destination
                        ? `${s.destination.displayName} · ${s.destination.handle ?? ""} · ${s.destination.accountType} · channel ${s.destination.channelId} · organization ${s.destination.organizationId} · first comment ${s.destination.firstComment.value} (${s.destination.firstComment.source})`
                        : "Unverified"}
                    </p>
                  )}
                  {p.companionLink && (
                    <p>
                      Article link:{" "}
                      {p.companionLink.canonicalUrl ?? "unresolved"} ·{" "}
                      {p.companionLink.placement} · publication receipt{" "}
                      {s.articleReceipt
                        ? `${s.articleReceipt.evidence.availability} at ${new Date(s.articleReceipt.evidence.checkedAt).toLocaleString()}`
                        : "unverified"}
                    </p>
                  )}
                  <p>
                    Source idea: {s.sourceIdeaId ?? "none"} · Brief:{" "}
                    {s.sourceResearchBriefId ?? "none"} · Campaign:{" "}
                    {s.sourceCampaignId ?? "none"}
                  </p>
                  <p>Citations: {s.citations.join(", ") || "none"}</p>
                  <ul aria-label={`Warnings for ${p.title}`}>
                    {s.warnings.map((w) => (
                      <li key={w}>Warning: {w}</li>
                    ))}
                  </ul>
                  {s.approvalError && (
                    <p role="status">Approval blocked: {s.approvalError}</p>
                  )}
                  <ul>
                    {s.holds.map((h) => (
                      <li key={h}>Release held: {h}</li>
                    ))}
                  </ul>
                  {row.approvedAt && (
                    <p>
                      Editorial version approved by {row.actor} at{" "}
                      {new Date(row.approvedAt).toLocaleString()}.
                    </p>
                  )}
                </article>
              );
            })}
          </div>
          <button
            className="rounded border bg-[#15616d] px-3 py-2 text-white disabled:opacity-50"
            disabled={
              busy ||
              review.stale ||
              review.packet.status === "approved" ||
              review.rows.some((r) => Boolean(r.snapshot.approvalError))
            }
            onClick={() =>
              void run(async () => {
                const result = await approve({
                  packetId: review.packet._id,
                  expectedSelectionRevision: review.packet.selectionRevision,
                });
                if (!result.approved) {
                  setMessage(
                    (result.errors ?? [])
                      .map((e: { reason: string }) => e.reason)
                      .join(" "),
                  );
                  requestAnimationFrame(() => {
                    const first = result.errors?.[0]?.postId;
                    (
                      (first
                        ? document.getElementById(`review-${first}`)
                        : null) ?? alert.current
                    )?.focus();
                  });
                } else
                  setMessage(
                    `Approved exactly ${review.rows.length} selected editorial versions. No dispatch or PR was requested.`,
                  );
              })
            }
          >
            Approve {review.rows.length} selected versions
          </button>
        </>
      )}
    </section>
  );
}
