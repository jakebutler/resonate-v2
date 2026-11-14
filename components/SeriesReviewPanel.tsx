"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import type { reviewRow, rowDisplay } from "@/convex/seriesReview";
type Row = Omit<Doc<"seriesReviewRows">, "snapshot"> & {
  snapshot: Awaited<ReturnType<typeof reviewRow>>["snapshot"];
  staleReason: string | null;
  heroUrl: string | null;
  display: Awaited<ReturnType<typeof rowDisplay>>;
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
  const [needsReReview, setNeedsReReview] = useState(false);
  // Optimistic local selection: checkbox state flips immediately and is
  // reconciled against the server selection when the query catches up.
  const [draftSelection, setDraftSelection] = useState<
    Id<"v2Posts">[] | null
  >(null);
  // Ref-based in-flight guard: a synchronous double click must not submit
  // twice before React re-renders the disabled state.
  const busyRef = useRef(false);
  const selectQueue = useRef<Promise<void>>(Promise.resolve());
  // The selection revision the server will see after the queued selects
  // land: each toggle optimistically counts one revision forward.
  const expectedRevisionRef = useRef<number | null>(null);
  const alert = useRef<HTMLParagraphElement>(null);
  const selectedIds = draftSelection ?? selection?.postIds ?? [];
  async function run(fn: () => Promise<void>) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      const text = e instanceof Error ? e.message : "Review failed.";
      // A server-side revision conflict throws instead of returning a
      // result; classify it as the re-review state, not a generic failure.
      if (/changed|reload|review again/i.test(text)) {
        setNeedsReReview(true);
        setMessage(`Content changed — review again: ${text}`);
      } else {
        setMessage(text);
      }
      alert.current?.focus();
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  function toggleSelect(postId: Id<"v2Posts">, checked: boolean) {
    const next = checked
      ? [...selectedIds, postId]
      : selectedIds.filter((id) => id !== postId);
    setDraftSelection(next);
    const expected = expectedRevisionRef.current ?? selection?.revision ?? 0;
    expectedRevisionRef.current = expected + 1;
    // Queued in order so rapid toggles never send a stale expectedRevision;
    // a server-side revision conflict surfaces the re-review state.
    selectQueue.current = selectQueue.current.then(() =>
      select({ seriesId, postIds: next, expectedRevision: expected })
        .then(() => {
          setNeedsReReview(false);
          setMessage("Selection saved; prepare a new packet.");
        })
        .catch((e: unknown) => {
          expectedRevisionRef.current = null;
          setDraftSelection(null);
          setNeedsReReview(true);
          setMessage(
            e instanceof Error && e.message
              ? `Selection changed — review again: ${e.message}`
              : "Selection changed — review again.",
          );
          alert.current?.focus();
        }),
    );
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
              checked={selectedIds.includes(post._id)}
              onChange={(e) => toggleSelect(post._id, e.target.checked)}
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
            await prepare({
              seriesId,
              expectedRevision:
                expectedRevisionRef.current ?? selection!.revision,
            });
            setNeedsReReview(false);
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
            Review packet prepared{" "}
            {new Date(review.packet.createdAt).toLocaleString()} ·{" "}
            {review.rows.length} selected
          </p>
          <p className="font-mono text-xs opacity-70">
            Packet ID {review.packet._id}
          </p>
          {review.stale && (
            <p role="status">
              This packet is stale because selection, membership or a row
              changed. Prepare a new packet.
            </p>
          )}
          {needsReReview && (
            <p role="alert" className="rounded border border-amber-600 p-2">
              Content changed — review again. What you reviewed no longer
              matches the current selection or content; your approval was not
              applied. Review the refreshed rows, then prepare a new packet.
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
                    Source idea:{" "}
                    {s.sourceIdeaId
                      ? (row.display.ideaTitle ??
                        "Unavailable in this workspace")
                      : "none"}{" "}
                    · Brief:{" "}
                    {s.sourceResearchBriefId
                      ? (row.display.briefTopic ??
                        "Unavailable in this workspace")
                      : "none"}{" "}
                    · Campaign:{" "}
                    {s.sourceCampaignId
                      ? (row.display.campaignTitle ??
                        "Unavailable in this workspace")
                      : "none"}
                  </p>
                  {(s.sourceIdeaId ||
                    s.sourceResearchBriefId ||
                    s.sourceCampaignId) && (
                    <p className="font-mono text-xs opacity-70">
                      Source IDs: idea {s.sourceIdeaId ?? "—"} · brief{" "}
                      {s.sourceResearchBriefId ?? "—"} · campaign{" "}
                      {s.sourceCampaignId ?? "—"}
                    </p>
                  )}
                  {s.citations.length ? (
                    <div>
                      <p>Citations</p>
                      <ul className="space-y-1">
                        {s.citations.map((c, i) => {
                          const resolved = row.display.citations[i];
                          return (
                            <li key={c}>
                              {resolved?.text
                                ? `Excerpt from ${resolved.documentName ?? "brand corpus"}: “${resolved.text}”`
                                : c}
                              <span className="block font-mono text-xs opacity-70">
                                {c}
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ) : (
                    <p>Citations: none</p>
                  )}
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
                    <>
                      {/* The actor is always this viewer: approve stamps the
                      requireUserId identity and ownPacket gates rows to the
                      packet owner's own selection. */}
                      <p>
                        Editorial version approved by you at{" "}
                        {new Date(row.approvedAt).toLocaleString()}.
                      </p>
                      <p className="font-mono text-xs opacity-70">
                        Actor {row.actor}
                      </p>
                    </>
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
                  const reasons = (result.errors ?? []).map(
                    (e: { reason: string }) => e.reason,
                  );
                  // The server refuses to apply a stale approval; surface it
                  // as a re-review state rather than a generic error.
                  if (reasons.some((r) => /changed|refresh/i.test(r)))
                    setNeedsReReview(true);
                  setMessage(
                    reasons.some((r) => /changed|refresh/i.test(r))
                      ? `Content changed — review again. ${reasons.join(" ")}`
                      : reasons.join(" "),
                  );
                  requestAnimationFrame(() => {
                    const first = result.errors?.[0]?.postId;
                    (
                      (first
                        ? document.getElementById(`review-${first}`)
                        : null) ?? alert.current
                    )?.focus();
                  });
                } else {
                  setNeedsReReview(false);
                  setMessage(
                    `Approved exactly ${review.rows.length} selected editorial versions. No dispatch or PR was requested.`,
                  );
                }
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
