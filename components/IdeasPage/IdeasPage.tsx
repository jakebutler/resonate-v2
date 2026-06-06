"use client";

import { FormEvent, useDeferredValue, useMemo, useState } from "react";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { buildIdeaPreview, normalizeIdeaSourceUrl, sanitizeIdeaTags } from "@/lib/ideas";
import { Button } from "@/components/ui/button";
import { Search, Lightbulb, Link2, Tags } from "lucide-react";
import { IdeaDetail } from "@/components/IdeaDetail/IdeaDetail";
import { BlogPostEditor } from "@/components/BlogPostEditor/BlogPostEditor";
import { LinkedInPostEditor } from "@/components/LinkedInPostEditor/LinkedInPostEditor";

type IdeaStatus = "all" | "inbox" | "reviewing" | "ready" | "used" | "archived";
type V2BrandId = "personal" | "corvo" | "lower-db" | "freshproof";
type V2ChannelId = "linkedin" | "reddit" | "corvo-blog";

const STATUS_OPTIONS: IdeaStatus[] = [
  "all",
  "inbox",
  "reviewing",
  "ready",
  "used",
  "archived",
];

export function IdeasPage() {
  const [activeStatus, setActiveStatus] = useState<IdeaStatus>("all");
  const [search, setSearch] = useState("");
  const [note, setNote] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [brandId, setBrandId] = useState<V2BrandId>("corvo");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [selectedIdeaId, setSelectedIdeaId] = useState<Id<"capturedIdeas"> | null>(null);
  const [editingPostId, setEditingPostId] = useState<Id<"posts"> | null>(null);
  const [blogEditorOpen, setBlogEditorOpen] = useState(false);
  const [linkedinEditorOpen, setLinkedinEditorOpen] = useState(false);

  const { isLoading: isConvexAuthLoading, isAuthenticated: isConvexAuthenticated } =
    useConvexAuth();
  const deferredSearch = useDeferredValue(search);
  const normalizedSourceUrl = useMemo(
    () => normalizeIdeaSourceUrl(sourceUrl),
    [sourceUrl]
  );

  const ideas = useQuery(
    api.ideas.list,
    isConvexAuthenticated
      ? {
          brandId,
          status: activeStatus === "all" ? undefined : activeStatus,
          search: deferredSearch.trim() || undefined,
        }
      : "skip"
  );
  const brands = useQuery(
    api.v2Publishing.listBrands,
    isConvexAuthenticated ? {} : "skip"
  );
  const selectedIdea = useQuery(
    api.ideas.getById,
    isConvexAuthenticated && selectedIdeaId ? { id: selectedIdeaId } : "skip"
  );
  const duplicateIdeas = useQuery(
    api.ideas.findByNormalizedSourceUrl,
    isConvexAuthenticated && normalizedSourceUrl
      ? { normalizedSourceUrl }
      : "skip"
  );
  const createIdea = useMutation(api.ideas.create);
  const appendIdeaEntry = useMutation(api.ideas.appendEntry);
  const updateIdeaMeta = useMutation(api.ideas.updateMeta);
  const archiveIdea = useMutation(api.ideas.archive);
  const createPostFromIdea = useMutation(api.posts.createFromIdea);
  const spawnV2Posts = useMutation(api.ideas.spawnV2Posts);

  const resetComposer = () => {
    setNote("");
    setSourceUrl("");
    setTagsInput("");
    setError("");
  };

  const parsedTags = useMemo(
    () => sanitizeIdeaTags(tagsInput.split(",")),
    [tagsInput]
  );
  const brandOptions = useMemo(
    () =>
      (
        brands ?? [
          { brandId: "personal" as const, name: "Personal" },
          { brandId: "corvo" as const, name: "Corvo Labs" },
          { brandId: "lower-db" as const, name: "the lower dB" },
          { brandId: "freshproof" as const, name: "FreshProof" },
        ]
      ).filter((brand): brand is NonNullable<typeof brand> => brand !== null),
    [brands]
  );

  const handleSaveIdea = async (event: FormEvent) => {
    event.preventDefault();
    const trimmedNote = note.trim();
    if (!trimmedNote) {
      setError("Add a note before saving.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      await createIdea({
        brandId,
        content: trimmedNote,
        tags: parsedTags,
        sourceUrl: sourceUrl.trim() || undefined,
        normalizedSourceUrl: normalizedSourceUrl || undefined,
      });
      resetComposer();
    } finally {
      setSaving(false);
    }
  };

  const handleAppendToIdea = async (ideaId: string) => {
    const trimmedNote = note.trim();
    if (!trimmedNote) {
      setError("Add a note before saving.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      await appendIdeaEntry({
        ideaId: ideaId as never,
        content: trimmedNote,
      });
      resetComposer();
    } finally {
      setSaving(false);
    }
  };

  const handleSaveDetailMeta = async (input: {
    status: "inbox" | "reviewing" | "ready" | "used" | "archived";
    tags: string[];
    sourceUrl?: string;
    normalizedSourceUrl?: string;
  }) => {
    if (!selectedIdeaId) return;

    await updateIdeaMeta({
      id: selectedIdeaId,
      brandId: selectedIdea?.brandId ?? brandId,
      status: input.status,
      tags: input.tags,
      sourceUrl: input.sourceUrl ?? null,
      normalizedSourceUrl: input.normalizedSourceUrl ?? null,
      sourceDomain: null,
    });
  };

  const handleAppendFromDetail = async (content: string) => {
    if (!selectedIdeaId) return;
    await appendIdeaEntry({
      ideaId: selectedIdeaId,
      content,
    });
  };

  const handleArchiveIdea = async () => {
    if (!selectedIdeaId) return;
    await archiveIdea({ id: selectedIdeaId });
    setSelectedIdeaId(null);
  };

  const handleCreateDraft = async (type: "blog" | "linkedin") => {
    if (!selectedIdeaId) return;

    const postId = await createPostFromIdea({
      ideaId: selectedIdeaId,
      type,
    });
    setEditingPostId(postId);
    setSelectedIdeaId(null);

    if (type === "blog") {
      setBlogEditorOpen(true);
    } else {
      setLinkedinEditorOpen(true);
    }
  };

  const handleSpawnV2Posts = async (channelIds: V2ChannelId[]) => {
    if (!selectedIdeaId) return;

    await spawnV2Posts({
      ideaId: selectedIdeaId,
      brandId: (selectedIdea?.brandId ?? brandId) as V2BrandId,
      channelIds,
    });
  };

  if (isConvexAuthLoading) {
    return (
      <div className="max-w-5xl mx-auto px-6 py-8">
        <div className="mb-8">
          <h1 className="font-forum text-3xl text-[#001524]">
            Inspiration &amp; Ideas
          </h1>
          <p className="mt-2 text-sm text-gray-500">
            Capture ideas now, refine them later, and turn the best ones into
            posts.
          </p>
        </div>

        <div className="rounded-3xl border border-[#001524]/10 bg-white p-10 text-center text-sm text-gray-500 shadow-sm">
          Connecting your ideas workspace…
        </div>
      </div>
    );
  }

  if (!isConvexAuthenticated) {
    return (
      <div className="max-w-5xl mx-auto px-6 py-8">
        <div className="mb-8">
          <h1 className="font-forum text-3xl text-[#001524]">
            Inspiration &amp; Ideas
          </h1>
          <p className="mt-2 text-sm text-gray-500">
            Capture ideas now, refine them later, and turn the best ones into
            posts.
          </p>
        </div>

        <div className="rounded-3xl border border-[#78290f]/15 bg-[#ffecd1] p-6 shadow-sm">
          <p className="text-sm font-medium text-[#78290f]">
            Convex auth is not ready for this session.
          </p>
          <p className="mt-2 text-sm text-[#78290f]/80">
            You are signed into Resonate, but the Convex backend did not receive
            an authenticated Clerk token. If this persists, verify the Clerk JWT
            template named <code>convex</code> and the Convex Clerk auth
            configuration.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      <div className="mb-8">
        <h1 className="font-forum text-3xl text-[#001524]">
          Inspiration &amp; Ideas
        </h1>
        <p className="mt-2 text-sm text-gray-500">
          Capture ideas now, refine them later, and turn the best ones into
          posts.
        </p>
      </div>

      <div className="grid gap-6">
        <form
          onSubmit={handleSaveIdea}
          className="rounded-3xl border border-[#001524]/10 bg-white p-6 shadow-sm"
        >
          <div className="mb-4 flex items-center gap-2 text-sm font-medium text-[#001524]">
            <Lightbulb size={16} />
            Capture a new idea
          </div>

          <div className="grid gap-4">
            <div>
              <label
                htmlFor="idea-brand"
                className="mb-1.5 block text-sm font-medium text-gray-700"
              >
                Brand
              </label>
              <select
                id="idea-brand"
                value={brandId}
                onChange={(event) => setBrandId(event.target.value as V2BrandId)}
                className="w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm text-[#001524] outline-none transition focus:border-[#15616d] focus:ring-2 focus:ring-[#15616d]/20"
              >
                {brandOptions.map((brand) => (
                  <option key={brand.brandId} value={brand.brandId}>
                    {brand.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="idea-note"
                className="mb-1.5 block text-sm font-medium text-gray-700"
              >
                Idea note
              </label>
              <textarea
                id="idea-note"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="What stood out, what question did it trigger, or what angle feels worth exploring?"
                rows={5}
                className="w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm text-[#001524] outline-none transition focus:border-[#ff7d00] focus:ring-2 focus:ring-[#ff7d00]/20"
              />
            </div>

            <div className="grid gap-4 md:grid-cols-[1.5fr_1fr]">
              <div>
                <label
                  htmlFor="idea-source-url"
                  className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-gray-700"
                >
                  <Link2 size={14} />
                  Source URL
                </label>
                <input
                  id="idea-source-url"
                  type="url"
                  value={sourceUrl}
                  onChange={(event) => setSourceUrl(event.target.value)}
                  placeholder="Optional: podcast, article, Reddit post, YouTube video..."
                  className="w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm text-[#001524] outline-none transition focus:border-[#15616d] focus:ring-2 focus:ring-[#15616d]/20"
                />
              </div>

              <div>
                <label
                  htmlFor="idea-tags"
                  className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-gray-700"
                >
                  <Tags size={14} />
                  Tags
                </label>
                <input
                  id="idea-tags"
                  type="text"
                  value={tagsInput}
                  onChange={(event) => setTagsInput(event.target.value)}
                  placeholder="Optional: ai, story, voice"
                  className="w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm text-[#001524] outline-none transition focus:border-[#15616d] focus:ring-2 focus:ring-[#15616d]/20"
                />
              </div>
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            {duplicateIdeas && duplicateIdeas.length > 0 && (
              <div className="rounded-2xl border border-[#15616d]/20 bg-[#15616d]/5 p-4">
                <p className="mb-3 text-sm font-medium text-[#001524]">
                  This source already has saved ideas. Create a new idea anyway,
                  or append this note to an existing thread.
                </p>
                <div className="grid gap-2">
                  {duplicateIdeas.map((idea) => (
                    <div
                      key={idea._id}
                      className="flex flex-col gap-3 rounded-2xl border border-[#15616d]/10 bg-white p-3 md:flex-row md:items-center md:justify-between"
                    >
                      <div>
                        <p className="text-sm font-medium text-[#001524]">
                          {idea.latestEntryPreview}
                        </p>
                        {idea.sourceTitle && (
                          <p className="text-xs text-gray-500">{idea.sourceTitle}</p>
                        )}
                      </div>
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => handleAppendToIdea(idea._id)}
                        disabled={saving}
                      >
                        Append here
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex items-center justify-between gap-3">
              <div className="flex flex-wrap gap-2">
                {parsedTags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full bg-[#ffecd1] px-2.5 py-1 text-xs font-medium text-[#78290f]"
                  >
                    {tag}
                  </span>
                ))}
              </div>
              <Button type="submit" variant="primary" disabled={saving}>
                {saving ? "Saving…" : "Save idea"}
              </Button>
            </div>
          </div>
        </form>

        <section className="rounded-3xl border border-[#001524]/10 bg-white p-6 shadow-sm">
          <div className="mb-4 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="font-forum text-2xl text-[#001524]">Ideas inbox</h2>
              <p className="mt-1 text-sm text-gray-500">
                Search, filter by status, and keep the latest insight at the top.
              </p>
            </div>

            <label className="flex items-center gap-2 rounded-2xl border border-gray-200 px-4 py-3 text-sm text-gray-500">
              <Search size={15} />
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search notes, tags, titles, and domains"
                className="w-64 border-none bg-transparent text-[#001524] outline-none"
              />
            </label>
          </div>

          <div className="mb-5 flex flex-wrap gap-2">
            {STATUS_OPTIONS.map((status) => (
              <button
                key={status}
                type="button"
                onClick={() => setActiveStatus(status)}
                className={`rounded-full px-3 py-1.5 text-sm font-medium capitalize transition ${
                  activeStatus === status
                    ? "bg-[#001524] text-white"
                    : "bg-gray-100 text-gray-500 hover:text-[#001524]"
                }`}
              >
                {status === "all" ? "All active" : status}
              </button>
            ))}
          </div>

          <div className="grid gap-3">
            {(ideas ?? []).length === 0 ? (
              <div className="rounded-2xl border border-dashed border-gray-200 px-6 py-12 text-center text-sm text-gray-500">
                No ideas match this view yet.
              </div>
            ) : (
              ideas?.map((idea) => (
                <button
                  key={idea._id}
                  type="button"
                  onClick={() => setSelectedIdeaId(idea._id)}
                  className="rounded-2xl border border-gray-100 px-4 py-4 text-left transition hover:border-[#001524]/20 hover:bg-[#faf7f2]"
                >
                  <div className="mb-2 flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium text-[#001524]">
                        {buildIdeaPreview(idea.latestEntryPreview)}
                      </p>
                      {(idea.sourceTitle || idea.sourceDomain) && (
                        <p className="mt-1 text-xs text-gray-500">
                          {[idea.sourceTitle, idea.sourceDomain].filter(Boolean).join(" • ")}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      {idea.brandId && (
                        <span className="rounded-full bg-[#15616d]/10 px-2.5 py-1 text-xs font-medium text-[#15616d]">
                          {idea.brandId}
                        </span>
                      )}
                      <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium capitalize text-gray-500">
                        {idea.status}
                      </span>
                    </div>
                  </div>
                  {idea.tags.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {idea.tags.map((tag) => (
                        <span
                          key={tag}
                          className="rounded-full bg-[#15616d]/10 px-2.5 py-1 text-xs font-medium text-[#15616d]"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </button>
              ))
            )}
          </div>
        </section>
      </div>

      <IdeaDetail
        open={selectedIdeaId !== null}
        idea={selectedIdea ?? null}
        onClose={() => setSelectedIdeaId(null)}
        onSaveMeta={handleSaveDetailMeta}
        onAppendEntry={handleAppendFromDetail}
        onArchive={handleArchiveIdea}
        onCreateBlogPost={() => void handleCreateDraft("blog")}
        onCreateLinkedInPost={() => void handleCreateDraft("linkedin")}
        onSpawnV2Posts={(channelIds) => void handleSpawnV2Posts(channelIds)}
      />

      <BlogPostEditor
        open={blogEditorOpen}
        postId={editingPostId}
        onClose={() => {
          setBlogEditorOpen(false);
          setEditingPostId(null);
        }}
        onSaved={() => {}}
      />

      <LinkedInPostEditor
        open={linkedinEditorOpen}
        postId={editingPostId}
        onClose={() => {
          setLinkedinEditorOpen(false);
          setEditingPostId(null);
        }}
        onSaved={() => {}}
      />
    </div>
  );
}
