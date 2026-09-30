"use client";
import { useState } from "react";
import Link from "next/link";
import { useAction, useConvexAuth, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { calendarDayOffset } from "@/lib/schedules";
import { linkedInPayload } from "@/lib/socialPayload";
type Detail = {
  post: Doc<"v2Posts">;
  article: Doc<"v2Posts"> | null;
  receipt: Doc<"articlePublications"> | null;
  hold: string | null;
  scheduleHold?: string | null;
  proposal: { content: string; linkedinFirstComment?: string } | null;
  version: string;
};
export function ArticleDependencyPanel({ postId }: { postId: Id<"v2Posts"> }) {
  const { isAuthenticated } = useConvexAuth();
  const detail = useQuery(
    api.articleDependencies.details,
    isAuthenticated ? { postId } : "skip",
  ) as Detail | undefined;
  const candidates = useQuery(
    api.articleDependencies.candidates,
    isAuthenticated && detail?.post.channelId !== "corvo-blog"
      ? { postId }
      : "skip",
  ) as { posts: Doc<"v2Posts">[]; partial: boolean } | undefined;
  const link = useMutation(api.articleDependencies.link);
  const apply = useMutation(api.articleDependencies.applyLink);
  const refresh = useAction(api.articlePublication.refresh);
  const reschedule = useMutation(api.publishing.reschedule);
  const [parent, setParent] = useState("");
  const [placement, setPlacement] = useState<"body" | "first-comment" | null>(
    null,
  );
  const [offset, setOffset] = useState("0");
  const [clock, setClock] = useState("09:00");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    try {
      const result = await fn();
      setMessage(
        result && typeof result === "object" && "reason" in result
          ? String(result.reason ?? "Publication evidence checked.")
          : "Saved. Review the current payload and schedule before release.",
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Article dependency check failed",
      );
    } finally {
      setBusy(false);
    }
  }
  if (!detail) return null;
  const { post, article, receipt, proposal } = detail;
  const e = receipt?.evidence;
  let offsetPreview: ReturnType<typeof calendarDayOffset> | undefined;
  let offsetError = "";
  try {
    if (article?.scheduledDate)
      offsetPreview = calendarDayOffset(
        article.scheduledDate,
        Number(offset),
        clock,
        post.timezone,
      );
  } catch (error) {
    offsetError = error instanceof Error ? error.message : "Invalid offset";
  }
  return (
    <section
      aria-label="Article publication dependency"
      className="mb-4 space-y-3 rounded border p-3 text-sm"
    >
      <h3 className="font-semibold">
        {post.channelId === "corvo-blog"
          ? "Article publication evidence"
          : "Parent article and final link"}
      </h3>
      {post.channelId !== "corvo-blog" && (
        <>
          <label>
            Parent article
            <select
              className="ml-2 max-w-full rounded border p-2"
              value={parent || post.companionLink?.articlePostId || ""}
              onChange={(ev) => setParent(ev.target.value)}
            >
              <option value="">Choose the parent article</option>
              {candidates?.posts.map((p) => (
                <option value={p._id} key={p._id}>
                  {p.title}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            Link delivery choice
            <select
              className="ml-2 rounded border p-2"
              value={placement ?? post.companionLink?.placement ?? "body"}
              onChange={(ev) =>
                setPlacement(ev.target.value as typeof placement)
              }
            >
              <option value="body">Body</option>
              {post.channelId === "linkedin" && <option value="first-comment">First comment</option>}
            </select>
          </label>
          <button
            disabled={busy || !(parent || post.companionLink?.articlePostId)}
            className="rounded border px-3 py-2"
            onClick={() =>
              void run(() =>
                link({
                  postId,
                  articlePostId: (parent ||
                    post.companionLink?.articlePostId) as Id<"v2Posts">,
                  placement:
                    placement ?? post.companionLink?.placement ?? "body",
                  expectedVersion: detail.version,
                }),
              )
            }
          >
            Save parent and placement
          </button>
          {candidates?.partial && (
            <p>Article picker is partial (500 recent posts).</p>
          )}
        </>
      )}
      {article && (
        <p>
          <Link className="underline" href={`/?postId=${article._id}`}>
            {article.title}
          </Link>{" "}
          · publication intent{" "}
          {article.blogPublicationIntent ?? "legacy/unverified"}
        </p>
      )}
      {article?.blogArtifact && (
        <a
          className="break-all underline"
          href={article.blogArtifact.canonicalUrl}
          target="_blank"
          rel="noreferrer"
        >
          {article.blogArtifact.canonicalUrl}
        </a>
      )}
      <dl>
        <dt>PR / head / merge</dt>
        <dd>
          {e?.prState ?? article?.blogPrStatus ?? "unverified"} · head{" "}
          {e?.headSha ?? "unverified"} · merge {e?.mergeSha ?? "unverified"}
        </dd>
        <dt>Production deployment</dt>
        <dd>
          {e?.deploymentState ?? "unverified"} ·{" "}
          {e?.environment ?? "unknown environment"} · commit{" "}
          {e?.deploymentSha ?? "unverified"}
        </dd>
        <dt>Canonical article availability</dt>
        <dd>
          {e?.availability ?? "unverified"} · checked{" "}
          {e ? new Date(e.checkedAt).toLocaleString() : "never"}
        </dd>
      </dl>
      {detail.hold && <p role="status">Held: {detail.hold}</p>}
      {article?.prUrl && (
        <button
          disabled={busy}
          className="rounded border px-3 py-2"
          onClick={() => void run(() => refresh({ postId: article._id }))}
        >
          Check article publication (read only)
        </button>
      )}
      {proposal && post.channelId !== "corvo-blog" && (
        <details>
          <summary>Review full canonical link proposal</summary>
          <p>
            Placement: {post.companionLink?.placement}. Saving any changed
            body/comment clears editorial approval.
          </p>
          <pre className="whitespace-pre-wrap">
            {linkedInPayload(proposal.content, post.platformSettings)}
          </pre>
          {proposal.linkedinFirstComment && (
            <>
              <p>First comment</p>
              <pre className="whitespace-pre-wrap">
                {proposal.linkedinFirstComment}
              </pre>
            </>
          )}
          <button
            disabled={busy}
            className="rounded border px-3 py-2"
            onClick={() =>
              void run(() =>
                apply({
                  postId,
                  expectedVersion: detail.version,
                  canonicalUrl: article!.blogArtifact!.canonicalUrl,
                }),
              )
            }
          >
            Apply reviewed link proposal
          </button>
        </details>
      )}
      {post.channelId !== "corvo-blog" && article?.scheduledDate && (
        <details>
          <summary>Preview a local calendar-day offset</summary>
          <p>
            The article date is an optional starting point. Saved drip dates
            stay independent until you explicitly save this preview.
          </p>
          <label>
            Calendar days
            <input
              className="ml-2 w-20 rounded border p-2"
              type="number"
              value={offset}
              onChange={(ev) => setOffset(ev.target.value)}
            />
          </label>
          <label>
            Local time
            <input
              className="ml-2 rounded border p-2"
              type="time"
              value={clock}
              onChange={(ev) => setClock(ev.target.value)}
            />
          </label>
          {offsetPreview && (
            <p>
              {offsetPreview.scheduledDate} {offsetPreview.scheduledTime}{" "}
              {offsetPreview.timezone} · UTC {offsetPreview.dueAt}
            </p>
          )}
          {offsetError && <p>{offsetError}</p>}
          {detail.scheduleHold && <p role="status">Provider schedule is locked: {detail.scheduleHold}</p>}
          <button
            disabled={busy || !offsetPreview || Boolean(detail.scheduleHold)}
            onClick={() =>
              void run(() =>
                reschedule({
                  postId,
                  scheduledDate: offsetPreview!.scheduledDate,
                  scheduledTime: offsetPreview!.scheduledTime,
                  timezone: offsetPreview!.timezone,
                }),
              )
            }
          >
            Save this explicit companion date
          </button>
        </details>
      )}
      {message && <p role="status">{message}</p>}
    </section>
  );
}
