"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useConvexAuth, useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SeriesReviewPanel } from "./SeriesReviewPanel";
import { PreparedPackageImport } from "./PreparedPackageImport";
import { tokens } from "@/components/shell/tokens";
import { cn } from "@/lib/utils";
import { typedId, typedIds } from "@/lib/typedIds";
import { articleArtifactVersion } from "@/lib/articleContracts";
import { blogEditorialFingerprint } from "@/lib/blogContract";
import { BRANDS, STATUS_LABELS, type PostStatus } from "@/lib/domain";

type Entry = Doc<"seriesEntries"> & {
  posts: {
    post: Doc<"v2Posts">;
    providerState: Doc<"v2ProviderStates"> | null;
    articlePublication?: Doc<"articlePublications"> | null;
  }[];
};

/**
 * Two-step confirm for destructive detach: the first click arms a 5-second
 * confirmation window, the second click detaches. Replaces the old one-click
 * detach that made an accidental click unrecoverable.
 */
function ConfirmDetachButton({
  label,
  confirmingLabel,
  onConfirm,
  testId,
}: {
  label: string;
  confirmingLabel: string;
  onConfirm: () => void;
  testId: string;
}) {
  const [armed, setArmed] = useState(false);
  const timer = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );
  return (
    <Button
      variant={armed ? "primary" : "secondary"}
      size="xs"
      data-testid={testId}
      onClick={() => {
        if (!armed) {
          setArmed(true);
          timer.current = window.setTimeout(() => {
            timer.current = null;
            setArmed(false);
          }, 5000);
          return;
        }
        if (timer.current !== null) window.clearTimeout(timer.current);
        timer.current = null;
        setArmed(false);
        onConfirm();
      }}
    >
      {armed ? confirmingLabel : label}
    </Button>
  );
}

export function SeriesWorkspace({ initialSeriesId }: { initialSeriesId?: string }) {
  const { isAuthenticated } = useConvexAuth();
  const [selected, setSelected] = useState(initialSeriesId ?? "");
  const [title, setTitle] = useState("");
  const [brand, setBrand] = useState<Doc<"postSeries">["brandId"]>("corvo");
  const [message, setMessage] = useState("");
  const rows = useQuery(api.series.list, isAuthenticated ? {} : "skip") as
    | Doc<"postSeries">[]
    | undefined;
  const create = useMutation(api.series.create);
  async function onCreate() {
    try {
      setSelected(await create({ brandId: brand, title }));
      setTitle("");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Series creation failed");
    }
  }
  return (
    <main className={cn("mx-auto max-w-6xl space-y-6 p-6", tokens.canvasBg)}>
      <div>
        <h1 className="text-2xl font-semibold">Publication series</h1>
        <p className={cn("mt-1 text-sm", tokens.textMuted)}>
          Organize existing articles and companions. Edit each post in its
          canonical composer.
        </p>
      </div>
      <div className={cn(tokens.panel, "flex flex-wrap items-end gap-4 p-4")}>
        <div className="flex min-w-56 flex-col gap-1.5">
          <label className="text-xs font-semibold uppercase tracking-wide" htmlFor="series-picker">
            Series
          </label>
          <Select
            value={selected || undefined}
            onValueChange={(value) => setSelected(value)}
          >
            <SelectTrigger id="series-picker" className="w-full" aria-label="Series">
              <SelectValue placeholder="Select a series" />
            </SelectTrigger>
            <SelectContent>
              {rows?.map((row) => (
                <SelectItem key={row._id} value={row._id}>
                  {row.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex min-w-56 flex-col gap-1.5">
          <label className="text-xs font-semibold uppercase tracking-wide" htmlFor="new-series-title">
            New series title
          </label>
          <Input
            id="new-series-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Name the series"
          />
        </div>
        <div className="flex min-w-40 flex-col gap-1.5">
          <label className="text-xs font-semibold uppercase tracking-wide" htmlFor="series-brand">
            Brand
          </label>
          <Select value={brand} onValueChange={(value) => setBrand(value as typeof brand)}>
            <SelectTrigger id="series-brand" className="w-full" aria-label="Brand">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {BRANDS.map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button
          disabled={!isAuthenticated || !title.trim()}
          onClick={() => void onCreate()}
          data-testid="create-series"
        >
          Create series
        </Button>
      </div>
      <PreparedPackageImport />
      {message ? (
        <p role="alert" className={cn("text-sm", tokens.textMuted)}>
          {message}
        </p>
      ) : null}
      {selected && isAuthenticated ? (
        <SeriesDetail key={selected} seriesId={typedId<"postSeries">(selected)} />
      ) : null}
    </main>
  );
}

export function SeriesDetail({ seriesId }: { seriesId: Id<"postSeries"> }) {
  const series = useQuery(api.series.get, { seriesId }) as Doc<"postSeries"> | undefined;
  const entries = usePaginatedQuery(api.series.entries, { seriesId }, { initialNumItems: 25 });
  const picker = usePaginatedQuery(api.series.picker, { seriesId }, { initialNumItems: 100 });
  const attach = useMutation(api.series.attach);
  const addCompanions = useMutation(api.series.addCompanions);
  const detach = useMutation(api.series.detach);
  const move = useMutation(api.series.move);
  const [article, setArticle] = useState("");
  const [companions, setCompanions] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const posts = picker.results as Doc<"v2Posts">[];
  const loaded = entries.results as Entry[];
  const linked = loaded.flatMap((e) => e.posts);
  function verifiedArticle(x: Entry["posts"][number]) {
    const e = x.articlePublication?.evidence;
    return (
      e?.availability === "verified" &&
      e.deploymentContainsArticle === true &&
      e.editorialVersion === blogEditorialFingerprint(x.post) &&
      e.artifactVersion === articleArtifactVersion(x.post.blogArtifact)
    );
  }
  function status(x: Entry["posts"][number]) {
    if (x.post.channelId === "corvo-blog")
      return verifiedArticle(x)
        ? "Published (verified article)"
        : x.post.blogPrStatus
          ? `Article PR ${x.post.blogPrStatus} · availability unverified`
          : x.post.status === "published"
            ? "Legacy publication unverified"
            : x.post.status;
    if (x.providerState?.simulated) return "Simulated receipt";
    return (
      STATUS_LABELS[(x.providerState?.status ?? x.post.status) as PostStatus] ??
      x.providerState?.status ??
      x.post.status
    );
  }
  const progress = {
    articles: loaded.length,
    companions: loaded.reduce((n, e) => n + e.companionPostIds.length, 0),
    approved: linked.filter((x) => x.post.approvalState === "approved").length,
    queued: linked.filter(
      (x) =>
        !x.providerState?.simulated &&
        ["queued", "publishing"].includes(x.providerState?.status ?? ""),
    ).length,
    published: linked.filter((x) =>
      x.post.channelId === "corvo-blog"
        ? verifiedArticle(x)
        : x.providerState?.status === "published" && !x.providerState.simulated,
    ).length,
    held: linked.filter((x) =>
      ["needs-review", "failed", "unavailable"].includes(x.providerState?.status ?? ""),
    ).length,
  };
  async function run(fn: () => Promise<unknown>) {
    try {
      await fn();
      setMessage("");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Series change failed");
    }
  }
  const moreEntriesAvailable = entries.status === "CanLoadMore";
  return (
    <section aria-label="Series detail" className="space-y-4">
      <h2 className="text-xl font-semibold">{series?.title}</h2>
      <div className="flex flex-wrap gap-3">
        <Link className="underline" href={`/?seriesId=${seriesId}`}>
          View series in calendar
        </Link>
        <Link
          className="underline"
          href={`/queue?seriesId=${seriesId}&brandId=${series?.brandId ?? "corvo"}`}
        >
          Plan companion queue
        </Link>
      </div>
      {entries.isLoading ? (
        <p className={cn("text-sm", tokens.textMuted)} data-testid="series-progress-loading">
          Loading series progress…
        </p>
      ) : (
        <div>
          <dl
            aria-label="Series progress"
            data-testid="series-progress"
            className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6"
          >
            {(
              [
                ["Articles", progress.articles],
                ["Companions", progress.companions],
                ["Approved", progress.approved],
                ["Queued", progress.queued],
                ["Published", progress.published],
                ["Held", progress.held],
              ] as const
            ).map(([label, value]) => (
              <div
                key={label}
                data-testid={`series-stat-${label.toLowerCase()}`}
                className={cn(tokens.panel, "px-3 py-2.5")}
              >
                <dt className={cn("text-[11px] font-semibold uppercase tracking-wide", tokens.textMuted)}>
                  {label}
                </dt>
                <dd className="mt-0.5 text-lg font-semibold tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>
          {moreEntriesAvailable ? (
            <p className={cn("mt-1.5 text-xs", tokens.textMuted)}>
              Counts cover the {loaded.length} loaded entries; load more below
              to include the rest.
            </p>
          ) : null}
        </div>
      )}
      {!entries.isLoading && loaded.length === 0 ? (
        <div
          className={cn(tokens.panel, "border-dashed px-6 py-10 text-center")}
          data-testid="series-empty"
        >
          <p className={cn("text-sm", tokens.textMuted)}>
            No entries in this series yet. Attach an existing article with its
            companions above to build the first entry.
          </p>
        </div>
      ) : null}
      <SeriesReviewPanel seriesId={seriesId} posts={linked.map((x) => x.post)} />
      <fieldset className={cn(tokens.panel, "space-y-3 p-4")}>
        <legend className="px-1 text-sm font-semibold">Attach existing posts</legend>
        <div className="flex min-w-72 flex-col gap-1.5">
          <label className="text-xs font-semibold uppercase tracking-wide" htmlFor="article-picker">
            Article
          </label>
          <Select value={article || undefined} onValueChange={(value) => setArticle(value)}>
            <SelectTrigger id="article-picker" aria-label="Article">
              <SelectValue placeholder="Choose an existing article" />
            </SelectTrigger>
            <SelectContent>
              {loaded.map((entry) => (
                <SelectItem key={entry._id} value={`entry:${entry._id}`}>
                  Add companions to {entry.posts[0].post.title}
                </SelectItem>
              ))}
              {posts
                .filter((p) => p.channelId === "corvo-blog")
                .map((p) => (
                  <SelectItem key={p._id} value={p._id}>
                    {p.title} — {p.status}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
        <div className="max-h-56 overflow-auto" aria-label="Companion picker">
          {posts.filter((p) => p.channelId !== "corvo-blog").length === 0 ? (
            <p className={cn("px-1 py-2 text-sm", tokens.textMuted)}>
              No companion posts available to attach.
            </p>
          ) : null}
          {posts
            .filter((p) => p.channelId !== "corvo-blog")
            .map((p) => (
              <label key={p._id} className="flex items-center gap-2 py-1 text-sm">
                <input
                  type="checkbox"
                  checked={companions.includes(p._id)}
                  onChange={(e) =>
                    setCompanions((current) =>
                      e.target.checked
                        ? [...current, p._id]
                        : current.filter((id) => id !== p._id),
                    )
                  }
                />{" "}
                {p.title} — {p.channelId} · {p.status}
              </label>
            ))}
        </div>
        {picker.status === "CanLoadMore" ? (
          <Button variant="secondary" size="sm" onClick={() => picker.loadMore(100)}>
            Load more existing posts
          </Button>
        ) : null}
        <Button
          disabled={!article}
          onClick={() =>
            void run(async () => {
              if (article.startsWith("entry:"))
                await addCompanions({
                  seriesId,
                  entryId: typedId<"seriesEntries">(article.slice(6)),
                  postIds: typedIds<"v2Posts">(companions),
                });
              else
                await attach({
                  seriesId,
                  key: crypto.randomUUID(),
                  articlePostId: typedId<"v2Posts">(article),
                  companionPostIds: typedIds<"v2Posts">(companions),
                });
              setArticle("");
              setCompanions([]);
            })
          }
        >
          Attach selected posts
        </Button>
      </fieldset>
      {message ? (
        <p role="alert" tabIndex={-1} className={cn("text-sm", tokens.textMuted)}>
          {message}
        </p>
      ) : null}
      <ol className="space-y-4">
        {loaded.map((entry) => (
          <li className={cn(tokens.panel, "p-4")} key={entry._id}>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className={cn("text-sm font-medium", tokens.textMuted)}>
                Entry {entry.sequence}
              </span>
              <Button
                variant="secondary"
                size="xs"
                onClick={() => void run(() => move({ seriesId, entryId: entry._id, direction: "up" }))}
              >
                Move up
              </Button>
              <Button
                variant="secondary"
                size="xs"
                onClick={() => void run(() => move({ seriesId, entryId: entry._id, direction: "down" }))}
              >
                Move down
              </Button>
              <ConfirmDetachButton
                label="Detach entry"
                confirmingLabel="Confirm detach entry?"
                testId="detach-entry"
                onConfirm={() => void run(() => detach({ seriesId, entryId: entry._id }))}
              />
            </div>
            <ul>
              {entry.posts.map(({ post, providerState, articlePublication }) => (
                <li key={post._id} className="flex flex-wrap items-center gap-3 py-2 text-sm">
                  <Link className="underline" href={`/?postId=${post._id}`}>
                    {post.title}
                  </Link>
                  <span className={cn(tokens.textMuted)}>
                    {post.channelId} · {post.approvalState} ·{" "}
                    {status({ post, providerState, articlePublication })}
                  </span>
                  <span className={cn(tokens.textMuted)}>
                    {post.scheduledDate ?? "Unscheduled"} {post.scheduledTime}{" "}
                    {post.timezone}
                  </span>
                  {post._id !== entry.articlePostId ? (
                    <ConfirmDetachButton
                      label="Detach companion"
                      confirmingLabel="Confirm detach companion?"
                      testId="detach-companion"
                      onConfirm={() =>
                        void run(() =>
                          detach({ seriesId, entryId: entry._id, postId: post._id }),
                        )
                      }
                    />
                  ) : null}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
      {entries.status === "CanLoadMore" ? (
        <Button variant="secondary" size="sm" onClick={() => entries.loadMore(25)}>
          Load more entries
        </Button>
      ) : null}
    </section>
  );
}
