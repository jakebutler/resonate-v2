"use client";
import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useAction, useConvexAuth, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import {
  parsePreparedManifest,
  resolvePreparedEntry,
  safePackagePath,
  type UploadedPackageFile,
  type PreparedManifest,
  type ResolvedPreparedItem,
} from "@/lib/preparedPackage";
function base64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = () =>
      reject(new Error(`${file.name}: cannot read upload.`));
    reader.readAsDataURL(file);
  });
}
export function PreparedPackageImport() {
  const { isAuthenticated } = useConvexAuth();
  const reviewEntry = useAction(api.preparedImportActions.reviewEntry);
  const commitEntry = useAction(api.preparedImportActions.commitEntry);
  const [manifestText, setManifestText] = useState("");
  const [uploaded, setUploaded] = useState<File[]>([]);
  const [manifest, setManifest] = useState<PreparedManifest | null>(null);
  const [files, setFiles] = useState<UploadedPackageFile[]>([]);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [reviewIds, setReviewIds] = useState<Id<"preparedImportReviews">[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [receipts, setReceipts] = useState<Doc<"preparedImportReceipts">[]>([]);
  const reviews = useQuery(
    api.preparedImports.selectedReviews,
    isAuthenticated && reviewIds.length ? { reviewIds } : "skip",
  ) as Doc<"preparedImportReviews">[] | undefined;
  async function dryRun() {
    setBusy(true);
    setMessage("");
    try {
      const parsed = parsePreparedManifest(manifestText);
      if (
        uploaded.length > 500 ||
        uploaded.reduce((sum, f) => sum + f.size, 0) > 50000000
      )
        throw new Error("Package exceeds 500 files or 50 MB.");
      if (
        uploaded
          .filter((f) => /\.(md|mdx)$/i.test(f.name))
          .reduce((sum, f) => sum + f.size, 0) > 5000000
      )
        throw new Error(
          "Package Markdown exceeds 5 MB; split into separate package keys.",
        );
      const refs = parsed.entries.flatMap((e) => [
        e.article.contentFile,
        e.article.heroFile!,
        ...e.companions.map((c) => c.contentFile),
      ]);
      const resolved: UploadedPackageFile[] = [];
      for (const file of uploaded) {
        const path = file.webkitRelativePath || file.name;
        const stripped = path.includes("/")
          ? path.slice(path.indexOf("/") + 1)
          : path;
        const matched = refs.includes(path)
          ? path
          : refs.includes(stripped)
            ? stripped
            : undefined;
        safePackagePath(path);
        if (!matched) continue;
        if (file.size > (/\.(md|mdx)$/i.test(matched) ? 50000 : 3000000))
          throw new Error(`${matched}: file exceeds package limit.`);
        resolved.push({
          path: matched,
          kind: /\.(md|mdx)$/i.test(matched) ? "text" : "base64",
          data: /\.(md|mdx)$/i.test(matched)
            ? await file.text()
            : await base64(file),
        });
      }
      if (new Set(resolved.map((f) => f.path)).size !== resolved.length)
        throw new Error("Package has duplicate uploaded paths.");
      const grouped = parsed.entries.map((entry) => {
        const paths = [
          entry.article.contentFile,
          entry.article.heroFile!,
          ...entry.companions.map((c) => c.contentFile),
        ];
        const subset = resolved.filter((f) => paths.includes(f.path));
        resolvePreparedEntry(parsed, entry.key, subset);
        return { entry, subset };
      });
      setManifest(parsed);
      setFiles(resolved);
      const ids: Id<"preparedImportReviews">[] = [];
      for (const { entry, subset } of grouped) {
        const result = await reviewEntry({
          manifest: manifestText,
          entryKey: entry.key,
          files: subset,
        });
        ids.push(result.reviewId);
        setPreviews((current) => ({
          ...current,
          [result.reviewId]: result.previewBase64,
        }));
        setReviewIds([...ids]);
      }
      setMessage(
        `Reviewed ${ids.length} entries. Read every action and exact saved source before commit.`,
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Package review failed",
      );
    } finally {
      setBusy(false);
    }
  }
  async function commitReviewed() {
    setBusy(true);
    setMessage("");
    try {
      const results: Doc<"preparedImportReceipts">[] = [];
      for (const id of reviewIds) {
        const review = reviews?.find((r) => r._id === id);
        if (!review)
          throw new Error("Wait for the durable review rows to load.");
        if (review.actions.includes("conflict"))
          throw new Error(
            `${review.entryKey}: conflict requires an explicit new source key or matching existing attachment.`,
          );
        const article = (review.items as ResolvedPreparedItem[])[0];
        const receipt = await commitEntry({
          reviewId: id,
          heroBase64: files.find((f) => f.path === article.heroFile)?.data,
        });
        if (receipt) results.push(receipt);
        setReceipts([...results]);
      }
      setMessage(
        "Reviewed entries committed or recovered. Every new post is unapproved.",
      );
    } catch (error) {
      setMessage(
        `${error instanceof Error ? error.message : "Import interrupted"} Completed entry receipts are retained; rerun the identical package to resume.`,
      );
    } finally {
      setBusy(false);
    }
  }
  const selected = reviews?.filter((r) => reviewIds.includes(r._id)) ?? [];
  return (
    <section
      aria-label="Prepared package import"
      className="space-y-4 rounded border bg-white p-4"
    >
      <h2 className="text-lg font-semibold">Import prepared package</h2>
      <p>
        Upload a version 1 manifest and its referenced Markdown/heroes. Copy is
        preserved exactly. Dry-run creates review records only; explicit commit
        creates unapproved drafts and series links.
      </p>
      <p className="text-sm">
        Maximum 100 entries, 10 companions per entry, 50 KB Markdown, 3 MB still
        image, 50 MB package (5 MB Markdown total). Archives and unsafe paths
        are rejected.
      </p>
      <label className="block">
        Manifest JSON file
        <input
          className="block"
          type="file"
          disabled={busy}
          accept="application/json,.json"
          onChange={(e) =>
            void e.target.files?.[0]?.text().then((text) => {
              setManifestText(text);
              setReviewIds([]);
            })
          }
        />
      </label>
      <label className="block">
        Manifest JSON
        <textarea
          aria-label="Manifest JSON"
          disabled={busy}
          className="h-32 w-full rounded border p-2 font-mono text-sm"
          value={manifestText}
          onChange={(e) => {
            setManifestText(e.target.value);
            setReviewIds([]);
          }}
        />
      </label>
      <label className="block">
        Prepared files
        <input
          className="block"
          type="file"
          disabled={busy}
          multiple
          onChange={(e) => {
            setUploaded(Array.from(e.target.files ?? []));
            setReviewIds([]);
          }}
        />
      </label>
      <label className="block">
        Prepared folder
        <input
          className="block"
          type="file"
          disabled={busy}
          multiple
          {...{ webkitdirectory: "" }}
          onChange={(e) => {
            setUploaded(Array.from(e.target.files ?? []));
            setReviewIds([]);
          }}
        />
      </label>
      <button
        className="rounded border px-3 py-2"
        disabled={busy || !isAuthenticated || !manifestText || !uploaded.length}
        onClick={() => void dryRun()}
      >
        Dry-run package
      </button>
      {selected.map((review) => (
        <article key={review._id} className="space-y-2 rounded border p-3">
          <h3 className="font-semibold">
            {review.entryKey} — {review.actions.join(" / ")}
          </h3>
          {review.reason && <p role="alert">{review.reason}</p>}
          {previews[review._id] && (
            <Image
              unoptimized
              width={1600}
              height={900}
              className="max-w-md rounded border"
              src={`data:image/webp;base64,${previews[review._id]}`}
              alt={(review.items as ResolvedPreparedItem[])[0].coverImageAlt!}
            />
          )}
          <p className="break-all text-xs">
            Source SHA-256 {review.sourceHash}
          </p>
          <p>
            Hero: {review.hero.width}×{review.hero.height}{" "}
            {review.hero.mimeType} · {review.hero.byteLength} bytes ·{" "}
            {review.hero.crop} · SHA-256 {review.hero.sha256}
          </p>
          {(review.items as ResolvedPreparedItem[]).map((item, index) => (
            <details key={index}>
              <summary>
                {item.title} — {review.actions[index]}
              </summary>
              <p>
                {item.scheduledDate} {item.scheduledTime} {item.timezone} · UTC{" "}
                {item.dueAt}
              </p>
              <pre className="whitespace-pre-wrap">{item.content}</pre>
              {item.firstComment && (
                <pre className="whitespace-pre-wrap">
                  First comment: {item.firstComment}
                </pre>
              )}
              {index === 0 && (
                <dl>
                  <dt>Excerpt</dt>
                  <dd>{item.excerpt}</dd>
                  <dt>Author/category/tags/slug</dt>
                  <dd>
                    {item.author} · {item.category} · {item.tags?.join(", ")} ·{" "}
                    {item.slug}
                  </dd>
                  <dt>Publication intent / cover alt</dt>
                  <dd>
                    {item.publicationIntent} · {item.coverImageAlt}
                  </dd>
                </dl>
              )}
            </details>
          ))}
        </article>
      ))}
      {reviewIds.length > 0 && (
        <button
          className="rounded border px-3 py-2"
          disabled={
            busy ||
            selected.length !== manifest?.entries.length ||
            selected.some((r) => r.actions.includes("conflict"))
          }
          onClick={() => void commitReviewed()}
        >
          Commit reviewed entries as unapproved drafts
        </button>
      )}
      {receipts.map((receipt) => (
        <p key={receipt._id}>
          Receipt {receipt.entryKey}:{" "}
          <Link
            className="underline"
            href={`/series?seriesId=${receipt.seriesId}`}
          >
            Open imported series
          </Link>{" "}
          ·{" "}
          <Link className="underline" href={`/?postId=${receipt.postIds[0]}`}>
            Open canonical article composer
          </Link>
        </p>
      ))}
      {message && <p role="status">{message}</p>}
    </section>
  );
}
