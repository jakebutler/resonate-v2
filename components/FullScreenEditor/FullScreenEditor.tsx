"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueries } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import {
  TiptapEditor,
  type TiptapEditorHandle,
  type TiptapEditorSelection,
} from "@/components/TiptapEditor/TiptapEditor";
import { EditorChat } from "@/components/EditorChat/EditorChat";
import { ImageTray } from "@/components/ImageTray/ImageTray";
import { optimizeImage } from "@/lib/imageOptimize";
import { ResizeHandle } from "./ResizeHandle";
import { MetadataBar } from "./MetadataBar";
import { ArrowLeft, PanelRightOpen } from "lucide-react";

const SIDEBAR_DEFAULT_WIDTH = 380;
const SIDEBAR_MIN_WIDTH = 280;
const SIDEBAR_MAX_FRACTION = 0.5; // 50% of viewport
const DEFAULT_AUTHOR = "Jake Butler";
const DEFAULT_CATEGORY = "strategy";

type SaveStatus = "idle" | "saving" | "saved" | "error";

interface FullScreenEditorProps {
  postId: string; // "new" | Convex Id<"posts">
  initialDate?: string;
}

const AUTOSAVE_DEBOUNCE_MS = 3000;

type DraftSnapshot = {
  status: "draft" | "scheduled" | "published";
  scheduledDate: string;
  scheduledTime: string;
  tags: string[];
  subtitle: string;
  excerpt: string;
  author: string;
  category: string;
  featured: boolean;
  coverImageAlt: string;
  fileIds: Id<"_storage">[];
  heroImageId: Id<"_storage"> | null;
};

function createDraftSnapshot(
  status: DraftSnapshot["status"],
  scheduledDate: string,
  scheduledTime: string,
  tags: string[],
  subtitle: string,
  excerpt: string,
  author: string,
  category: string,
  featured: boolean,
  coverImageAlt: string,
  fileIds: Id<"_storage">[],
  heroImageId: Id<"_storage"> | null
): DraftSnapshot {
  return {
    status,
    scheduledDate,
    scheduledTime,
    tags,
    subtitle,
    excerpt,
    author,
    category,
    featured,
    coverImageAlt,
    fileIds,
    heroImageId,
  };
}

function extractImageEntries(
  html: string,
  fileIds: Id<"_storage">[],
  urlsByFileId: Record<string, string>
) {
  const images = new Map<
    string,
    { fileId: string; url: string; altText: string }
  >();

  if (typeof document !== "undefined") {
    const container = document.createElement("div");
    container.innerHTML = html;

    for (const img of Array.from(container.querySelectorAll("img[data-file-id]"))) {
      const fileId = img.getAttribute("data-file-id");
      if (!fileId) continue;
      images.set(fileId, {
        fileId,
        url: urlsByFileId[fileId] || img.getAttribute("src") || "",
        altText: img.getAttribute("alt") || "",
      });
    }
  }

  for (const fileId of fileIds) {
    const resolvedUrl = urlsByFileId[fileId];
    if (!images.has(fileId) && resolvedUrl) {
      images.set(fileId, {
        fileId,
        url: resolvedUrl,
        altText: "",
      });
    }
  }

  return Array.from(images.values());
}

function replaceImageSources(html: string, urlsByFileId: Record<string, string>) {
  const container = document.createElement("div");
  container.innerHTML = html;
  let changed = false;

  for (const img of Array.from(container.querySelectorAll("img[data-file-id]"))) {
    const fileId = img.getAttribute("data-file-id");
    if (!fileId) continue;
    const resolvedUrl = urlsByFileId[fileId];
    if (resolvedUrl && img.getAttribute("src") !== resolvedUrl) {
      img.setAttribute("src", resolvedUrl);
      changed = true;
    }
  }

  return changed ? container.innerHTML : html;
}

function removeImageFromHtml(html: string, fileId: string) {
  const container = document.createElement("div");
  container.innerHTML = html;
  container.querySelector(`img[data-file-id="${fileId}"]`)?.remove();
  return container.innerHTML;
}

function deriveAltText(fileName: string) {
  return fileName.replace(/\.[^/.]+$/, "").trim() || "Post image";
}

export function FullScreenEditor({ postId, initialDate }: FullScreenEditorProps) {
  const router = useRouter();
  const isNew = postId === "new";

  // Convex
  const existing = useQuery(
    api.posts.getById,
    isNew ? "skip" : { id: postId as Id<"posts"> }
  );
  const createPost = useMutation(api.posts.create);
  const updatePost = useMutation(api.posts.update);
  const generateUploadUrl = useMutation(api.posts.generateUploadUrl);

  // Local state
  const [title, setTitle] = useState("");
  const [htmlContent, setHtmlContent] = useState("");
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");

  // Metadata
  const [status, setStatus] = useState<"draft" | "scheduled" | "published">("draft");
  const [scheduledDate, setScheduledDate] = useState(initialDate ?? "");
  const [scheduledTime, setScheduledTime] = useState("10:00");
  const [tags, setTags] = useState<string[]>([]);
  const [subtitle, setSubtitle] = useState("");
  const [excerpt, setExcerpt] = useState("");
  const [author, setAuthor] = useState(DEFAULT_AUTHOR);
  const [category, setCategory] = useState(DEFAULT_CATEGORY);
  const [featured, setFeatured] = useState(false);
  const [coverImageAlt, setCoverImageAlt] = useState("");
  const [githubPrUrl, setGithubPrUrl] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [fileIds, setFileIds] = useState<Id<"_storage">[]>([]);
  const [heroImageId, setHeroImageId] = useState<Id<"_storage"> | null>(null);
  const [imageError, setImageError] = useState("");

  // Sidebar state
  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_DEFAULT_WIDTH);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [selectedText, setSelectedText] = useState("");
  const [selectedRange, setSelectedRange] = useState<{
    from: number;
    to: number;
    text: string;
  } | null>(null);
  const [chatFocusRequestId, setChatFocusRequestId] = useState(0);

  // Track the real post ID once created (starts as null for new posts)
  const currentPostIdRef = useRef<string | null>(isNew ? null : postId);
  const editorRef = useRef<TiptapEditorHandle>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSavingRef = useRef(false);
  const inFlightSavePromiseRef = useRef<Promise<void> | null>(null);
  const pendingSaveRef = useRef<{ title: string; content: string } | null>(null);
  const createPostPromiseRef = useRef<Promise<Id<"posts">> | null>(null);
  const previewUrlByFileIdRef = useRef<Record<string, string>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const draftSnapshotRef = useRef<DraftSnapshot>(
    createDraftSnapshot(
      "draft",
      initialDate ?? "",
      "10:00",
      [],
      "",
      "",
      DEFAULT_AUTHOR,
      DEFAULT_CATEGORY,
      false,
      "",
      [],
      null
    )
  );
  const fileUrlQueries = useMemo(
    () =>
      Object.fromEntries(
        fileIds.map((fileId) => [
          fileId,
          {
            query: api.posts.getFileUrl,
            args: { fileId },
          },
        ])
      ),
    [fileIds]
  );
  const fileUrlResults = useQueries(fileUrlQueries);
  const imageUrlByFileId = Object.fromEntries(
    fileIds
      .map((fileId) => {
        const result = fileUrlResults[fileId];
        return typeof result === "string" ? [fileId, result] : null;
      })
      .filter((entry): entry is [string, string] => Boolean(entry))
  );
  const images = extractImageEntries(htmlContent, fileIds, imageUrlByFileId);

  // Load existing post into local state
  useEffect(() => {
    if (existing) {
      setTitle(existing.title ?? "");
      setHtmlContent(existing.content ?? "");
      setStatus(existing.status ?? "draft");
      setScheduledDate(existing.scheduledDate ?? "");
      setScheduledTime(existing.scheduledTime ?? "10:00");
      setTags(existing.tags ?? []);
      setSubtitle(existing.subtitle ?? "");
      setExcerpt(existing.excerpt ?? existing.seoDescription ?? "");
      setAuthor(existing.author ?? DEFAULT_AUTHOR);
      setCategory(existing.category ?? DEFAULT_CATEGORY);
      setFeatured(existing.featured ?? false);
      setCoverImageAlt(existing.coverImageAlt ?? "");
      setGithubPrUrl(existing.githubPrUrl ?? "");
      setFileIds((existing.fileIds as Id<"_storage">[]) ?? []);
      setHeroImageId((existing.heroImageId as Id<"_storage"> | undefined) ?? null);
    }
  }, [existing]);

  useEffect(() => {
    if (window.innerWidth < 768) {
      setSidebarCollapsed(true);
    }
  }, []);

  useEffect(() => {
    draftSnapshotRef.current = createDraftSnapshot(
      status,
      scheduledDate,
      scheduledTime,
      tags,
      subtitle,
      excerpt,
      author,
      category,
      featured,
      coverImageAlt,
      fileIds,
      heroImageId
    );
  }, [
    status,
    scheduledDate,
    scheduledTime,
    tags,
    subtitle,
    excerpt,
    author,
    category,
    featured,
    coverImageAlt,
    fileIds,
    heroImageId,
  ]);

  useEffect(() => {
    if (!htmlContent || Object.keys(imageUrlByFileId).length === 0) return;

    for (const [fileId, previewUrl] of Object.entries(previewUrlByFileIdRef.current)) {
      const resolvedUrl = imageUrlByFileId[fileId];
      if (resolvedUrl && resolvedUrl !== previewUrl) {
        URL.revokeObjectURL(previewUrl);
        delete previewUrlByFileIdRef.current[fileId];
      }
    }

    const nextHtml = replaceImageSources(htmlContent, imageUrlByFileId);
    if (nextHtml !== htmlContent) {
      setHtmlContent(nextHtml);
      editorRef.current?.setContent(nextHtml);
    }
  }, [htmlContent, imageUrlByFileId]);

  const createPostDraft = useCallback(
    async (
      titleToSave: string,
      contentToSave: string,
      draft: DraftSnapshot
    ): Promise<Id<"posts">> => {
      if (currentPostIdRef.current) {
        return currentPostIdRef.current as Id<"posts">;
      }

      if (createPostPromiseRef.current) {
        return createPostPromiseRef.current;
      }

      const createPromise = createPost({
        type: "blog",
        title: titleToSave,
        content: contentToSave,
        status: draft.status,
        scheduledDate: draft.scheduledDate || initialDate,
        scheduledTime: draft.scheduledTime,
        tags: draft.tags,
        subtitle: draft.subtitle,
        excerpt: draft.excerpt,
        author: draft.author,
        category: draft.category,
        featured: draft.featured,
        coverImageAlt: draft.coverImageAlt,
        fileIds: draft.fileIds,
        heroImageId: draft.heroImageId ?? undefined,
      })
        .then((newId) => {
          currentPostIdRef.current = newId;
          router.replace(`/editor/${newId}`);
          return newId;
        })
        .finally(() => {
          createPostPromiseRef.current = null;
        });

      createPostPromiseRef.current = createPromise;
      return createPromise;
    },
    [createPost, initialDate, router]
  );

  // ── Auto-save logic ────────────────────────────────────────────────────────
  const performSave = useCallback(
    async (titleToSave: string, contentToSave: string) => {
      if (isSavingRef.current) {
        pendingSaveRef.current = { title: titleToSave, content: contentToSave };
        return inFlightSavePromiseRef.current ?? Promise.resolve();
      }

      isSavingRef.current = true;
      setSaveStatus("saving");

      const runSave = async (nextTitle: string, nextContent: string): Promise<void> => {
        const draft = draftSnapshotRef.current;
        try {
          if (currentPostIdRef.current) {
            await updatePost({
              id: currentPostIdRef.current as Id<"posts">,
              title: nextTitle,
              content: nextContent,
              status: draft.status,
              scheduledDate: draft.scheduledDate,
              scheduledTime: draft.scheduledTime,
              tags: draft.tags,
              subtitle: draft.subtitle,
              excerpt: draft.excerpt,
              author: draft.author,
              category: draft.category,
              featured: draft.featured,
              coverImageAlt: draft.coverImageAlt,
              fileIds: draft.fileIds,
              heroImageId: draft.heroImageId ?? undefined,
            });
          } else {
            await createPostDraft(nextTitle, nextContent, draft);
          }
          setSaveStatus("saved");
        } catch {
          setSaveStatus("error");
        }

        const pendingSave = pendingSaveRef.current;
        if (pendingSave) {
          pendingSaveRef.current = null;
          await runSave(pendingSave.title, pendingSave.content);
        }
      };

      const savePromise = runSave(titleToSave, contentToSave).finally(() => {
        isSavingRef.current = false;
        if (inFlightSavePromiseRef.current === savePromise) {
          inFlightSavePromiseRef.current = null;
        }
      });

      inFlightSavePromiseRef.current = savePromise;
      return savePromise;
    },
    [createPostDraft, updatePost]
  );

  const flushPendingAutosave = useCallback(async () => {
    const debounceTimer = debounceTimerRef.current;
    const hasDebouncedSave = debounceTimer !== null;

    if (hasDebouncedSave) {
      clearTimeout(debounceTimer);
      debounceTimerRef.current = null;
    }

    if (!hasDebouncedSave && !isSavingRef.current && !pendingSaveRef.current) {
      return;
    }

    await performSave(title, htmlContent);
  }, [htmlContent, performSave, title]);

  const scheduleAutoSave = useCallback(
    (newTitle: string, newContent: string) => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      setSaveStatus("idle");
      debounceTimerRef.current = setTimeout(() => {
        debounceTimerRef.current = null;
        void performSave(newTitle, newContent);
      }, AUTOSAVE_DEBOUNCE_MS);
    },
    [performSave]
  );

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, []);

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTitle = e.target.value;
    setTitle(newTitle);
    scheduleAutoSave(newTitle, htmlContent);
  };

  const handleContentChange = (newHtml: string) => {
    setHtmlContent(newHtml);
    scheduleAutoSave(title, newHtml);
  };

  const ensurePersistedPost = useCallback(async () => {
    await flushPendingAutosave();

    if (currentPostIdRef.current) {
      return currentPostIdRef.current as Id<"posts">;
    }

    const draft = draftSnapshotRef.current;
    return createPostDraft(title, htmlContent, draft);
  }, [createPostDraft, flushPendingAutosave, htmlContent, title]);

  const handlePublish = async () => {
    if (!title || !htmlContent) return;
    setPublishing(true);
    try {
      const persistedPostId = await ensurePersistedPost();
      const markdown = editorRef.current?.getMarkdown() ?? htmlContent;
      const publishImages = images.map((image) => {
        const sourceUrl = imageUrlByFileId[image.fileId];
        if (!sourceUrl) {
          throw new Error("Wait for image uploads to finish before publishing.");
        }

        return {
          sourceUrl,
          alt: image.altText,
          isCover: image.fileId === heroImageId,
        };
      });
      const res = await fetch("/api/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          content: markdown,
          scheduledDate,
          status,
          subtitle: subtitle || undefined,
          excerpt: excerpt || undefined,
          author: author || undefined,
          tags: tags.length ? tags : undefined,
          category: category || undefined,
          featured,
          coverImageAlt: coverImageAlt || undefined,
          images: publishImages,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const { prUrl } = await res.json();
      setGithubPrUrl(prUrl);

      await updatePost({
        id: persistedPostId,
        githubPrUrl: prUrl,
        status,
      });
    } catch (err) {
      console.error("Publish failed:", err);
      // TODO: replace with toast in Phase 8
      alert("Publish failed: " + (err instanceof Error ? err.message : "Unknown error"));
    } finally {
      setPublishing(false);
    }
  };

  const handleResize = useCallback((delta: number) => {
    setSidebarWidth((prev) => {
      const maxWidth = window.innerWidth * SIDEBAR_MAX_FRACTION;
      return Math.max(SIDEBAR_MIN_WIDTH, Math.min(maxWidth, prev + delta));
    });
  }, []);

  const handleImageUpload = useCallback(
    async (files: FileList | null) => {
      if (!files?.length) return;

      setImageError("");

      for (const file of Array.from(files)) {
        try {
          const optimizedFile = await optimizeImage(file);
          const uploadUrl = await generateUploadUrl();
          const uploadRes = await fetch(uploadUrl, {
            method: "POST",
            headers: {
              "Content-Type": optimizedFile.type || file.type || "application/octet-stream",
            },
            body: optimizedFile,
          });
          if (!uploadRes.ok) {
            throw new Error("Image upload failed.");
          }

          const { storageId } = await uploadRes.json();
          const previewUrl = URL.createObjectURL(optimizedFile);
          const altText = deriveAltText(file.name);
          const storageFileId = storageId as Id<"_storage">;
          previewUrlByFileIdRef.current[storageFileId] = previewUrl;

          setFileIds((prev) =>
            prev.includes(storageFileId) ? prev : [...prev, storageFileId]
          );
          editorRef.current?.insertImage?.({
            src: previewUrl,
            alt: altText,
            fileId: storageId,
          });

          const nextHtml = editorRef.current?.getHTML() ?? htmlContent;
          setHtmlContent(nextHtml);
          scheduleAutoSave(title, nextHtml);
        } catch (err) {
          setImageError(
            err instanceof Error ? err.message : "Image upload failed."
          );
          break;
        }
      }
    },
    [generateUploadUrl, htmlContent, scheduleAutoSave, title]
  );

  const handleImageInputChange = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    await handleImageUpload(event.target.files);
    event.target.value = "";
  };

  const handleRemoveImage = (fileId: string) => {
    const nextFileIds = fileIds.filter((currentFileId) => currentFileId !== fileId);
    const nextHeroImageId = heroImageId === fileId ? null : heroImageId;
    const nextHtml = removeImageFromHtml(htmlContent, fileId);
    const previewUrl = previewUrlByFileIdRef.current[fileId];

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      delete previewUrlByFileIdRef.current[fileId];
    }

    setFileIds(nextFileIds);
    setHeroImageId(nextHeroImageId);
    setHtmlContent(nextHtml);
    editorRef.current?.setContent(nextHtml);
    scheduleAutoSave(title, nextHtml);
  };

  const handleHeroChange = (fileId: string | null) => {
    const nextHeroImageId = (fileId as Id<"_storage"> | null) ?? null;
    setHeroImageId(nextHeroImageId);
    scheduleAutoSave(title, htmlContent);
  };

  const handleScrollToImage = (fileId: string) => {
    document
      .querySelector(`img[data-file-id="${fileId}"]`)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const handleSelectionChange = (selection: TiptapEditorSelection | null) => {
    setSelectedText(selection?.text ?? "");
    setSelectedRange(
      selection
        ? { from: selection.from, to: selection.to, text: selection.text }
        : null
    );
  };

  const handleAskAI = (selection: TiptapEditorSelection) => {
    setSelectedText(selection.text);
    setSelectedRange({
      from: selection.from,
      to: selection.to,
      text: selection.text,
    });
    setSidebarCollapsed(false);
    setChatFocusRequestId((current) => current + 1);
  };

  const clearSelection = () => {
    setSelectedText("");
    setSelectedRange(null);
  };

  const handleAcceptSuggestion = (suggestion: string, originalText: string) => {
    if (!selectedRange) return;

    const currentSelectionText =
      editorRef.current?.getTextBetween({
        from: selectedRange.from,
        to: selectedRange.to,
      }) ?? "";

    if (
      currentSelectionText &&
      currentSelectionText !== originalText &&
      !window.confirm(
        "The selected text changed since you asked AI. Replace the current text anyway?"
      )
    ) {
      return;
    }

    editorRef.current?.replaceRange(
      { from: selectedRange.from, to: selectedRange.to },
      suggestion
    );
    const nextHtml = editorRef.current?.getHTML() ?? htmlContent;
    setHtmlContent(nextHtml);
    clearSelection();
    editorRef.current?.focus();
    scheduleAutoSave(title, nextHtml);
  };

  // ── Save status label ──────────────────────────────────────────────────────
  const saveStatusLabel =
    saveStatus === "saving"
      ? "Saving..."
      : saveStatus === "saved"
      ? "Saved"
      : saveStatus === "error"
      ? "Save failed"
      : "";

  if (!isNew && existing === undefined) {
    return (
      <div className="flex h-screen items-center justify-center bg-white text-sm text-gray-500">
        Loading post...
      </div>
    );
  }

  if (!isNew && existing === null) {
    return (
      <div className="flex h-screen items-center justify-center bg-white text-sm text-gray-500">
        Post not found.
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-white">
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-gray-100 shrink-0">
        <button
          type="button"
          onClick={() => router.back()}
          aria-label="Back"
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 transition-colors"
        >
          <ArrowLeft size={16} />
          Back
        </button>

        <div className="flex items-center gap-3">
          <span
            data-testid="save-status"
            className={`text-xs transition-opacity ${
              saveStatusLabel ? "opacity-100" : "opacity-0"
            } ${saveStatus === "error" ? "text-red-500" : "text-gray-400"}`}
            aria-live="polite"
          >
            {saveStatusLabel || "Saved"}
          </span>

          {/* Expand sidebar button (only visible when collapsed) */}
          {sidebarCollapsed && (
            <button
              type="button"
              onClick={() => setSidebarCollapsed(false)}
              aria-label="Open AI sidebar"
              className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
            >
              <PanelRightOpen size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Two-panel area */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Main canvas */}
        <div
          data-testid="editor-main-pane"
          className="flex min-h-0 flex-1 flex-col overflow-hidden"
        >
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            {/* Title */}
            <div className="px-12 pt-8 pb-2 shrink-0">
              <input
                type="text"
                value={title}
                onChange={handleTitleChange}
                placeholder="Untitled post"
                className="w-full text-4xl font-forum text-[#001524] placeholder:text-gray-300 border-none outline-none bg-transparent"
                aria-label="Post title"
              />
            </div>

            {/* Metadata bar */}
            <MetadataBar
              status={status}
              scheduledDate={scheduledDate}
              scheduledTime={scheduledTime}
              tags={tags}
              subtitle={subtitle}
              excerpt={excerpt}
              author={author}
              category={category}
              featured={featured}
              coverImageAlt={coverImageAlt}
              onStatusChange={(s) => { setStatus(s); scheduleAutoSave(title, htmlContent); }}
              onDateChange={(d) => { setScheduledDate(d); scheduleAutoSave(title, htmlContent); }}
              onTimeChange={(t) => { setScheduledTime(t); scheduleAutoSave(title, htmlContent); }}
              onTagsChange={(t) => { setTags(t); scheduleAutoSave(title, htmlContent); }}
              onSubtitleChange={(value) => { setSubtitle(value); scheduleAutoSave(title, htmlContent); }}
              onExcerptChange={(value) => { setExcerpt(value); scheduleAutoSave(title, htmlContent); }}
              onAuthorChange={(value) => { setAuthor(value); scheduleAutoSave(title, htmlContent); }}
              onCategoryChange={(value) => { setCategory(value); scheduleAutoSave(title, htmlContent); }}
              onFeaturedChange={(value) => { setFeatured(value); scheduleAutoSave(title, htmlContent); }}
              onCoverImageAltChange={(value) => { setCoverImageAlt(value); scheduleAutoSave(title, htmlContent); }}
              onPublish={handlePublish}
              publishing={publishing}
              githubPrUrl={githubPrUrl}
              title={title}
              hasContent={Boolean(htmlContent)}
            />

            {/* Tiptap WYSIWYG editor */}
            <div className="flex min-h-0 flex-1 flex-col px-4">
              <TiptapEditor
                ref={editorRef}
                initialContent={existing?.content ?? ""}
                onChange={handleContentChange}
                placeholder="Start writing your post..."
                onImageInsert={() => fileInputRef.current?.click()}
                onSelectionChange={handleSelectionChange}
                onAskAI={handleAskAI}
              />
            </div>
          </div>

          <ImageTray
            images={images}
            heroFileId={heroImageId}
            onHeroChange={handleHeroChange}
            onRemove={handleRemoveImage}
            onScrollToImage={handleScrollToImage}
          />

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            aria-label="Upload image"
            onChange={handleImageInputChange}
          />

          {imageError ? (
            <div className="px-12 pb-3 text-xs text-red-500" role="status" aria-live="polite">
              {imageError}
            </div>
          ) : null}
        </div>

        {/* Resize handle + Chat sidebar */}
        {!sidebarCollapsed && (
          <>
            <ResizeHandle onResize={handleResize} />
            <div
              style={{ width: sidebarWidth }}
              className="shrink-0 overflow-hidden"
              data-testid="editor-chat-sidebar"
            >
              <EditorChat
                selectedText={selectedText}
                onDismissSelection={clearSelection}
                onCollapse={() => setSidebarCollapsed(true)}
                onAcceptSuggestion={handleAcceptSuggestion}
                focusRequestId={chatFocusRequestId}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
