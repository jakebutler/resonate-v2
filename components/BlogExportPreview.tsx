"use client";
import { useEffect, useRef, useState } from "react";
import type { BlogEditorialPost } from "@/lib/blogContract";

export function BlogExportPreview({ post }: { post: BlogEditorialPost & { _id: string; updatedAt?: number; scheduledDate?: string; scheduledTime?: string; timezone?: string } }) {
  const [destination, setDestination] = useState<{repository?: string; filePath?: string; dueAt?: string|null}>({});
  const details = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    if (!details.current?.open) return;
    let active = true;
    async function verify() {
      try {
        const response = await fetch(`/api/publish?postId=${encodeURIComponent(post._id)}`);
        if (response.ok && active) setDestination(await response.json());
      } catch { /* The preview retains an explicit unverified destination. */ }
    }
    void verify();
    return () => { active = false; };
  }, [post._id, post.updatedAt]);
  async function verifyDestination() {
    try {
      const response = await fetch(`/api/publish?postId=${encodeURIComponent(post._id)}`);
      if (response.ok) setDestination(await response.json());
    } catch { /* No writes or inferred verification. */ }
  }
  const rows = [
    ["Title",post.title], ["Publication intent",post.blogPublicationIntent ?? "Review required"],
    ["Date and time",`${post.scheduledDate ?? "Required"} ${post.scheduledTime ?? ""} ${post.timezone ?? ""}`],
    ["UTC",destination.dueAt ?? "Not verified"],
    ["Excerpt",post.blogExcerpt], ["Author",post.blogAuthor], ["Category",post.blogCategory],
    ["Tags",post.blogTags?.join(", ")], ["Cover alt text",post.coverImageAlt],
    ["Repository",destination.repository ?? "Verification unavailable"], ["Article path",destination.filePath],
  ];
  return <details ref={details} onToggle={e => { if (e.currentTarget.open) void verifyDestination(); }} className="rounded border border-gray-400 p-2 text-xs">
    <summary className="cursor-pointer font-semibold">Saved export preview</summary>
    <p className="my-2">Review and approve this saved version. Unsaved changes are excluded.</p>
    <dl className="space-y-2">{rows.map(([label,value]) => <div key={label}>
      <dt className="font-semibold text-gray-700">{label}</dt><dd className="whitespace-pre-wrap break-all text-gray-700">{value || "Required"}</dd>
    </div>)}</dl>
    {post.preparedHero && <p className="mt-2 break-all">Hero: {post.preparedHero.width}×{post.preparedHero.height}, {post.preparedHero.byteLength.toLocaleString()} bytes. SHA-256: {post.preparedHero.sha256}</p>}
  </details>;
}
