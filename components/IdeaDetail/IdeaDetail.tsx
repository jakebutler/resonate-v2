"use client";

import { useEffect, useState } from "react";
import { SlideOver } from "@/components/ui/SlideOver";
import { Button } from "@/components/ui/button";
import { Id } from "@/convex/_generated/dataModel";
import { normalizeIdeaSourceUrl, sanitizeIdeaTags } from "@/lib/ideas";
import { Archive, Link2, ListTodo, Sparkles } from "lucide-react";

type IdeaStatus = "inbox" | "reviewing" | "ready" | "used" | "archived";
type V2BrandId = "personal" | "corvo" | "lower-db" | "freshproof";
type V2AnyChannelId =
  | "linkedin"
  | "x"
  | "youtube"
  | "instagram"
  | "tiktok"
  | "reddit"
  | "corvo-blog";
type V2SpawnChannelId = "linkedin" | "reddit" | "corvo-blog";

interface IdeaDetailProps {
  open: boolean;
  idea: {
    _id: Id<"capturedIdeas">;
    brandId?: V2BrandId;
    status: IdeaStatus;
    tags: string[];
    sourceUrl?: string;
    sourceTitle?: string;
    sourceDomain?: string;
    entries: {
      _id: Id<"capturedIdeaEntries">;
      content: string;
      createdAt: number;
    }[];
    v2PostLinks?: {
      link: {
        _id: Id<"capturedIdeaV2PostLinks">;
        channelId: V2AnyChannelId;
        createdAt: number;
      };
      post: {
        _id: Id<"v2Posts">;
        title: string;
        status: string;
        approvalState: string;
        channelId: string;
        scheduledDate?: string;
      };
    }[];
  } | null;
  onClose: () => void;
  onSaveMeta?: (input: {
    status: "inbox" | "reviewing" | "ready" | "used" | "archived";
    tags: string[];
    sourceUrl?: string;
    normalizedSourceUrl?: string;
  }) => Promise<void> | void;
  onAppendEntry?: (content: string) => Promise<void> | void;
  onArchive?: () => Promise<void> | void;
  onCreateBlogPost: () => void;
  onCreateLinkedInPost: () => void;
  onSpawnV2Posts?: (channelIds: V2SpawnChannelId[]) => Promise<void> | void;
}

function formatDate(timestamp: number) {
  return new Date(timestamp).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function IdeaDetail({
  open,
  idea,
  onClose,
  onSaveMeta,
  onAppendEntry,
  onArchive,
  onCreateBlogPost,
  onCreateLinkedInPost,
  onSpawnV2Posts,
}: IdeaDetailProps) {
  const [status, setStatus] = useState<IdeaStatus>("inbox");
  const [sourceUrl, setSourceUrl] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [newEntry, setNewEntry] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setStatus(idea?.status ?? "inbox");
    setSourceUrl(idea?.sourceUrl ?? "");
    setTagsInput(idea?.tags.join(", ") ?? "");
    setNewEntry("");
  }, [idea]);

  const handleSaveMeta = async () => {
    if (!idea || !onSaveMeta) return;
    setSaving(true);
    try {
      await onSaveMeta({
        status,
        tags: sanitizeIdeaTags(tagsInput.split(",")),
        sourceUrl: sourceUrl.trim() || undefined,
        normalizedSourceUrl: normalizeIdeaSourceUrl(sourceUrl) ?? undefined,
      });
    } finally {
      setSaving(false);
    }
  };

  const handleAppendEntry = async () => {
    if (!idea || !onAppendEntry || !newEntry.trim()) return;
    setSaving(true);
    try {
      await onAppendEntry(newEntry.trim());
      setNewEntry("");
    } finally {
      setSaving(false);
    }
  };

  const handleSpawnV2Posts = async (channelIds: V2SpawnChannelId[]) => {
    if (!idea || !onSpawnV2Posts) return;
    setSaving(true);
    try {
      await onSpawnV2Posts(channelIds);
    } finally {
      setSaving(false);
    }
  };

  const footer = (
    <>
      <div className="flex items-center gap-2">
        {onArchive && (
          <Button type="button" variant="danger" onClick={onArchive} disabled={saving}>
            <Archive size={14} />
            Archive
          </Button>
        )}
      </div>
      <div className="flex items-center gap-2">
        <Button type="button" variant="secondary" onClick={handleSaveMeta} disabled={saving}>
          Save changes
        </Button>
        <Button type="button" variant="secondary" onClick={onCreateBlogPost} disabled={saving}>
          Create blog draft
        </Button>
        <Button type="button" variant="primary" onClick={onCreateLinkedInPost} disabled={saving}>
          Create LinkedIn draft
        </Button>
      </div>
    </>
  );

  return (
    <SlideOver
      open={open}
      onClose={onClose}
      title="Idea detail"
      icon={<Sparkles size={16} />}
      footer={footer}
    >
      {!idea ? (
        <div className="rounded-2xl border border-dashed border-gray-200 px-6 py-12 text-center text-sm text-gray-500">
          Loading idea…
        </div>
      ) : (
        <div className="space-y-6">
          <section className="rounded-2xl border border-[#001524]/10 bg-[#faf7f2] p-4">
            <div className="mb-4 flex items-center gap-2 text-sm font-medium text-[#001524]">
              <Link2 size={15} />
              Source context
            </div>
            <div className="space-y-3">
              {idea.brandId && (
                <div>
                  <p className="text-xs font-medium uppercase text-gray-400">Brand</p>
                  <p className="text-sm font-medium text-[#001524]">{idea.brandId}</p>
                </div>
              )}
              {(idea.sourceTitle || idea.sourceDomain) && (
                <div>
                  {idea.sourceTitle && (
                    <p className="text-sm font-medium text-[#001524]">{idea.sourceTitle}</p>
                  )}
                  {idea.sourceDomain && (
                    <p className="text-xs text-gray-500">{idea.sourceDomain}</p>
                  )}
                </div>
              )}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">
                  Source URL
                </label>
                <input
                  type="url"
                  value={sourceUrl}
                  onChange={(event) => setSourceUrl(event.target.value)}
                  className="w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm text-[#001524] outline-none transition focus:border-[#15616d] focus:ring-2 focus:ring-[#15616d]/20"
                />
              </div>
            </div>
          </section>

          {onSpawnV2Posts && (
            <section className="rounded-2xl border border-[#15616d]/15 bg-white p-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-medium text-[#001524]">
                <Sparkles size={15} />
                Spawn v2 drafts
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => void handleSpawnV2Posts(["linkedin"])}
                  disabled={saving}
                >
                  LinkedIn
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => void handleSpawnV2Posts(["reddit"])}
                  disabled={saving}
                >
                  Reddit
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => void handleSpawnV2Posts(["corvo-blog"])}
                  disabled={saving}
                >
                  Corvo Blog
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  onClick={() => void handleSpawnV2Posts(["linkedin", "reddit", "corvo-blog"])}
                  disabled={saving}
                >
                  All MVP posts
                </Button>
              </div>
            </section>
          )}

          {idea.v2PostLinks && idea.v2PostLinks.length > 0 && (
            <section>
              <div className="mb-3 flex items-center gap-2 text-sm font-medium text-[#001524]">
                <ListTodo size={15} />
                Spawned v2 posts
              </div>
              <div className="space-y-2">
                {idea.v2PostLinks.map(({ link, post }) => (
                  <div
                    key={link._id}
                    className="rounded-2xl border border-gray-100 bg-white p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-[#001524]">{post.title}</p>
                        <p className="mt-1 text-xs text-gray-500">
                          {post.channelId} · {post.status} · {post.approvalState}
                        </p>
                      </div>
                      <span className="rounded-full bg-[#15616d]/10 px-2.5 py-1 text-xs font-medium text-[#15616d]">
                        {link.channelId}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">
                Status
              </label>
              <select
                value={status}
                onChange={(event) => setStatus(event.target.value as typeof status)}
                className="w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm text-[#001524] outline-none transition focus:border-[#15616d] focus:ring-2 focus:ring-[#15616d]/20"
              >
                {["inbox", "reviewing", "ready", "used", "archived"].map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">
                Tags
              </label>
              <input
                type="text"
                value={tagsInput}
                onChange={(event) => setTagsInput(event.target.value)}
                placeholder="ai, voice, story"
                className="w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm text-[#001524] outline-none transition focus:border-[#15616d] focus:ring-2 focus:ring-[#15616d]/20"
              />
            </div>
          </section>

          <section>
            <div className="mb-3 flex items-center gap-2 text-sm font-medium text-[#001524]">
              <ListTodo size={15} />
              Idea thread
            </div>
            <div className="space-y-3">
              {idea.entries.map((entry) => (
                <div
                  key={entry._id}
                  className="rounded-2xl border border-gray-100 bg-white p-4"
                >
                  <p className="text-sm leading-6 text-[#001524]">{entry.content}</p>
                  <p className="mt-2 text-xs text-gray-400">{formatDate(entry.createdAt)}</p>
                </div>
              ))}
            </div>
          </section>

          {onAppendEntry && (
            <section className="rounded-2xl border border-gray-100 bg-white p-4">
              <label className="mb-1.5 block text-sm font-medium text-gray-700">
                Add another note
              </label>
              <textarea
                value={newEntry}
                onChange={(event) => setNewEntry(event.target.value)}
                rows={4}
                placeholder="What else does this idea make you think about?"
                className="w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm text-[#001524] outline-none transition focus:border-[#ff7d00] focus:ring-2 focus:ring-[#ff7d00]/20"
              />
              <div className="mt-3 flex justify-end">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={handleAppendEntry}
                  disabled={!newEntry.trim() || saving}
                >
                  Append note
                </Button>
              </div>
            </section>
          )}
        </div>
      )}
    </SlideOver>
  );
}
