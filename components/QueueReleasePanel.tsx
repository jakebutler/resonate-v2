"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import type { reviewRow } from "@/convex/seriesReview";
type Candidate = {
  post: Doc<"v2Posts">;
  eligible: boolean;
  hold: string | null;
  reservationId?: Id<"queueReservations">;
};
type Snapshot = Awaited<ReturnType<typeof reviewRow>>["snapshot"] & {
  payloadHash: string;
};
type Packet = {
  review: Doc<"queueReleaseReviews">;
  rows: (Omit<Doc<"queueReleaseRows">, "snapshot"> & {
    snapshot: Snapshot;
    staleReason?: string | null;
  })[];
  stale: boolean;
};
export function QueueReleasePanel({
  brandId,
  seriesId,
  candidates,
}: {
  brandId: Doc<"v2Posts">["brandId"];
  seriesId?: Id<"postSeries">;
  candidates: Candidate[];
}) {
  const args = { brandId, ...(seriesId ? { seriesId } : {}) };
  const packet = useQuery(api.queueRelease.latest, args) as
    | Packet
    | null
    | undefined;
  const gate = useQuery(api.publishing.bufferLiveSubmissionEnabled, {}) as
    | { enabled: boolean }
    | undefined;
  const prepare = useMutation(api.queueRelease.prepare);
  const queue = useAction(api.bufferLive.queueSelected);
  const [selected, setSelected] = useState<Id<"v2Posts">[]>([]);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const alert = useRef<HTMLParagraphElement>(null);
  const previousReview = useRef<string | undefined>(undefined);
  const id = packet?.review._id;
  useEffect(() => {
    if (previousReview.current === id) return;
    previousReview.current = id;
    if (packet) setSelected(packet.review.postIds);
    setConfirmed(false);
  }, [packet, id]);
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Queue review failed.");
      alert.current?.focus();
    } finally {
      setBusy(false);
    }
  }
  const selectionChanged =
    packet &&
    JSON.stringify([...selected].sort()) !==
      JSON.stringify([...packet.review.postIds].sort());
  const canQueue =
    packet &&
    !packet.stale &&
    !selectionChanged &&
    packet.review.status === "reviewed" &&
    packet.rows.every((r) => r.status === "ready");
  return (
    <section
      aria-label="Reviewed queue release"
      className="space-y-4 rounded border bg-white p-4"
    >
      <h2 className="text-lg font-semibold">Review and queue selected posts</h2>
      <p>
        Select up to 20 approved posts. Review pins complete payloads, accounts,
        dates, article evidence, reservations and the current capacity
        observation. Only Queue selected requests delivery.
      </p>
      <fieldset disabled={busy}>
        <legend>Explicit queue selection ({selected.length})</legend>
        {candidates.map((row) => (
          <label key={row.post._id} className="block py-1">
            <input
              type="checkbox"
              checked={selected.includes(row.post._id)}
              disabled={
                !selected.includes(row.post._id) &&
                ((!row.eligible && !row.reservationId) || selected.length >= 20)
              }
              onChange={(e) => {
                setSelected((current) =>
                  e.target.checked
                    ? [...current, row.post._id]
                    : current.filter((id) => id !== row.post._id),
                );
                setConfirmed(false);
              }}
            />{" "}
            {row.post.title} · {row.hold ?? "Eligible for review"}
          </label>
        ))}
      </fieldset>
      <button
        className="rounded border px-3 py-2"
        disabled={busy || !selected.length}
        onClick={() =>
          void run(async () => {
            await prepare({ ...args, postIds: selected });
            setConfirmed(false);
            setMessage(
              "Exact queue review saved. Inspect every row before requesting delivery.",
            );
          })
        }
      >
        Review eligible posts
      </button>
      <p role="alert" ref={alert} tabIndex={-1}>
        {message}
      </p>
      {packet && (
        <>
          <p>
            Review {packet.review._id} · {packet.rows.length} posts ·{" "}
            {packet.review.status} · capacity receipt{" "}
            {packet.review.snapshotId ?? "unknown"} · checked{" "}
            {new Date(packet.review.createdAt).toLocaleString()}
          </p>
          {(packet.stale || selectionChanged) && (
            <p role="status">
              Review is stale or selection changed. Refresh capacity and prepare
              a new review.
            </p>
          )}
          {packet.review.reason && (
            <p role="status">Batch stopped: {packet.review.reason}</p>
          )}
          <p>
            {packet.review.reservations?.length ?? 0} launch reservations were
            reviewed. Unselected reservations retain their slots.
          </p>
          {packet.rows.map((row) => {
            const s = row.snapshot;
            const p = s.post;
            const d = s.destination;
            return (
              <article key={row._id} className="space-y-2 rounded border p-4">
                <h3 className="font-semibold">
                  {p.title} ·{" "}
                  {row.status === "queued"
                    ? `${row.deliveryStatus ?? "queued"} — provider receipt accepted`
                    : row.status}
                </h3>
                <Link className="underline" href={`/?postId=${row.postId}`}>
                  Open {p.title} in composer and delivery history
                </Link>
                <p>
                  Account:{" "}
                  {d
                    ? `${d.displayName} · @${d.handle ?? ""} · ${d.accountType} · channel ${d.channelId} · organization ${d.organizationId}`
                    : "Unverified"}
                </p>
                <pre className="whitespace-pre-wrap break-words font-sans">
                  {s.finalContent}
                </pre>
                {p.linkedinFirstComment && (
                  <>
                    <h4>Final first comment</h4>
                    <pre className="whitespace-pre-wrap break-words">
                      {p.linkedinFirstComment}
                    </pre>
                    <p>
                      Entitlement: {d?.firstComment.value ?? "unknown"} ·{" "}
                      {d?.firstComment.source ?? "unknown"}
                    </p>
                  </>
                )}
                <p>
                  Exact date: {p.scheduledDate} {p.scheduledTime} {p.timezone} ·
                  UTC {s.dueAt ?? "unverified"}
                </p>
                <p>Payload SHA-256: {row.payloadHash}</p>
                {row.retry && (
                  <p>
                    This explicit review retries a definitive rejection after
                    refreshing the required evidence. Accepted or uncertain
                    attempts cannot be retried.
                  </p>
                )}
                {p.companionLink && (
                  <p>
                    Canonical link: {p.companionLink.canonicalUrl} ·{" "}
                    {p.companionLink.placement} · publication receipt{" "}
                    {s.articleReceipt?._id ?? "unverified"}
                  </p>
                )}
                <ul>
                  {s.warnings.map((w) => (
                    <li key={w}>Warning: {w}</li>
                  ))}
                </ul>
                {(row.reason || row.staleReason) && (
                  <p role="status">{row.reason ?? row.staleReason}</p>
                )}
                {row.providerPostId && (
                  <p>
                    Provider receipt: {row.providerPostId} · attempt{" "}
                    {row.attemptId}
                  </p>
                )}
                <p>
                  {row.status === "queued"
                    ? "Check delivery history for actual publishing/published status. Keep this receipt; do not submit this post again."
                    : row.status === "needs-review" ||
                        row.status === "executing"
                      ? "Reconcile this retained attempt in delivery history before any retry."
                      : "Refresh the relevant evidence and prepare a new review for remaining eligible posts."}
                </p>
              </article>
            );
          })}
          <label className="block">
            <input
              type="checkbox"
              checked={confirmed}
              disabled={!canQueue || busy}
              onChange={(e) => setConfirmed(e.target.checked)}
            />{" "}
            I reviewed these exact posts, destination accounts and dates.
          </label>
          <button
            className="rounded border bg-[#15616d] px-3 py-2 text-white disabled:opacity-50"
            disabled={busy || !confirmed || !canQueue || !gate?.enabled}
            onClick={() =>
              void run(async () => {
                const result = await queue({ reviewId: packet.review._id });
                setConfirmed(false);
                setMessage(
                  result.reason ??
                    "Queue request finished. Inspect each durable receipt; delivery may still be pending.",
                );
              })
            }
          >
            Queue {packet.rows.length} selected posts
          </button>
          {!gate?.enabled && (
            <p role="status">
              Live Buffer submission gate is off. Review and planning send
              nothing.
            </p>
          )}
        </>
      )}
    </section>
  );
}
