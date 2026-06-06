"use client";

import { useState, useRef, useEffect } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { SlideOver } from "@/components/ui/SlideOver";
import { Button } from "@/components/ui/button";
import { AIAssistant } from "@/components/AIAssistant/AIAssistant";
import { CLAUDE_MODELS } from "@/lib/models";
import { FileText, Trash2, Upload, Save, ExternalLink } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface BlogPostEditorProps {
  open: boolean;
  postId: Id<"posts"> | null;
  initialDate?: string;
  onClose: () => void;
  onSaved: () => void;
}

type Tab = "write" | "preview" | "ai";
type Status = "draft" | "scheduled" | "published";

function todayYMD() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function BlogPostEditor({ open, postId, initialDate, onClose, onSaved }: BlogPostEditorProps) {
  const existing = useQuery(api.posts.getById, postId ? { id: postId } : "skip");
  const createPost = useMutation(api.posts.create);
  const updatePost = useMutation(api.posts.update);
  const removePost = useMutation(api.posts.remove);
  const generateUploadUrl = useMutation(api.posts.generateUploadUrl);

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [status, setStatus] = useState<Status>("draft");
  const [scheduledDate, setScheduledDate] = useState(initialDate || "");
  const [scheduledTime, setScheduledTime] = useState("10:00");
  const [tab, setTab] = useState<Tab>("write");
  const [fileIds, setFileIds] = useState<Id<"_storage">[]>([]);
  const [uploading, setUploading] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [githubPrUrl, setGithubPrUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // NOTE: This useEffect is intentionally duplicated in LinkedInPostEditor.tsx.
  // Both editors prefill scheduledDate when opened from the calendar.
  // If a third editor is added, extract to a shared hook.
  useEffect(() => {
    if (open && !postId) {
      setScheduledDate(initialDate || "");
    }
  }, [open, initialDate, postId]);

  // Sync from existing post
  useEffect(() => {
    if (existing) {
      setTitle(existing.title || "");
      setContent(existing.content);
      setStatus(existing.status);
      setScheduledDate(existing.scheduledDate || "");
      setScheduledTime(existing.scheduledTime || "10:00");
      setFileIds((existing.fileIds as Id<"_storage">[]) || []);
      setGithubPrUrl(existing.githubPrUrl || "");
    } else if (!postId) {
      setTitle("");
      setContent("");
      setStatus("draft");
      setScheduledDate(initialDate || "");
      setScheduledTime("10:00");
      setFileIds([]);
      setGithubPrUrl("");
    }
  }, [existing, initialDate, postId]);

  const isLoadingExisting = open && !!postId && existing === undefined;
  const isPastPost = Boolean(postId && existing?.scheduledDate && existing.scheduledDate < todayYMD());

  useEffect(() => {
    if (!open) return;
    if (isPastPost) {
      setTab("preview");
      return;
    }
    if (!postId) {
      setTab("write");
    }
  }, [isPastPost, open, postId]);

  const handleUpload = async (files: FileList | null) => {
    if (!files) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const uploadUrl = await generateUploadUrl();
        const res = await fetch(uploadUrl, {
          method: "POST",
          headers: { "Content-Type": file.type },
          body: file,
        });
        const { storageId } = await res.json();
        setFileIds((prev) => [...prev, storageId as Id<"_storage">]);
      }
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = {
        title,
        content,
        status: status === "published" ? "draft" as Status : status,
        scheduledDate,
        scheduledTime,
        fileIds,
      };
      if (postId) {
        await updatePost({ id: postId, ...payload });
      } else {
        await createPost({ type: "blog", ...payload });
      }
      onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const handlePublish = async () => {
    if (!title || !content) return;
    setPublishing(true);
    try {
      const res = await fetch("/api/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, content, scheduledDate, status: "published" }),
      });
      if (!res.ok) throw new Error(await res.text());
      const { prUrl } = await res.json();
      setGithubPrUrl(prUrl);

      if (postId) {
        await updatePost({ id: postId, githubPrUrl: prUrl, status: "scheduled" });
      } else {
        await createPost({
          type: "blog",
          title,
          content,
          status: "scheduled",
          scheduledDate,
          scheduledTime,
          fileIds,
          githubPrUrl: prUrl,
        });
      }
      onSaved();
    } catch (err) {
      alert("Publish failed: " + (err instanceof Error ? err.message : "Unknown error"));
    } finally {
      setPublishing(false);
    }
  };

  const handleDelete = async () => {
    if (!postId) return;
    if (!confirm("Delete this post?")) return;
    await removePost({ id: postId });
    onSaved();
    onClose();
  };

  const handleUseAIPost = (text: string) => {
    setContent(text);
    setTab("write");
  };

  const footer = isPastPost ? (
    <>
      <div />
      <div className="flex items-center gap-2">
        <Button variant="secondary" onClick={onClose}>Close</Button>
      </div>
    </>
  ) : (
    <>
      <div>
        {postId && (
          <Button variant="danger" onClick={handleDelete}>
            <Trash2 size={14} />
            Delete
          </Button>
        )}
      </div>
      <div className="flex items-center gap-2">
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button variant="secondary" onClick={handleSave} disabled={saving}>
          <Save size={14} />
          {saving ? "Saving…" : "Save Draft"}
        </Button>
        <Button
          variant="primary"
          onClick={handlePublish}
          disabled={!title || !content || publishing}
        >
          {publishing ? "Creating PR…" : "Publish"}
        </Button>
      </div>
    </>
  );

  return (
    <SlideOver
      open={open}
      onClose={onClose}
      title={isPastPost ? "View Blog Post" : postId ? "Edit Blog Post" : "New Blog Post"}
      icon={<FileText size={16} />}
      footer={footer}
    >
      {isLoadingExisting ? (
        <p className="text-sm text-gray-500">Loading post…</p>
      ) : !existing && postId ? (
        <p className="text-sm text-gray-500">Post not found.</p>
      ) : isPastPost ? (
        <div className="space-y-5">
          {githubPrUrl && (
            <a
              href={githubPrUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-4 py-2.5 bg-[#ffecd1] rounded-lg text-sm text-[#78290f] hover:bg-[#ffd9b0] transition-colors"
            >
              <ExternalLink size={14} />
              PR open — review and merge to publish
            </a>
          )}

          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-400">Blog Post</p>
            <h3 className="text-2xl font-forum text-[#001524]">{title || "Untitled"}</h3>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
              <p className="text-xs uppercase tracking-wide text-gray-400">Publish Date</p>
              <p className="mt-1 text-sm font-medium text-[#001524]">{scheduledDate || "Not set"}</p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
              <p className="text-xs uppercase tracking-wide text-gray-400">Publish Time</p>
              <p className="mt-1 text-sm font-medium text-[#001524]">{scheduledTime || "Not set"}</p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
              <p className="text-xs uppercase tracking-wide text-gray-400">Status</p>
              <p className="mt-1 text-sm font-medium capitalize text-[#001524]">{status}</p>
            </div>
          </div>

          <div>
            <p className="mb-2 text-sm font-medium text-gray-700">Content Preview</p>
            <div className="min-h-[280px] px-4 py-3 border border-gray-200 rounded-lg prose prose-sm max-w-none">
              {content ? (
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
              ) : (
                <p className="text-gray-400 italic">Nothing to preview yet.</p>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
            <p className="text-xs uppercase tracking-wide text-gray-400">Images</p>
            <p className="mt-1 text-sm font-medium text-[#001524]">
              {fileIds.length ? `${fileIds.length} attached` : "No images attached"}
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-5">
        {/* GitHub PR banner */}
        {githubPrUrl && (
          <a
            href={githubPrUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-4 py-2.5 bg-[#ffecd1] rounded-lg text-sm text-[#78290f] hover:bg-[#ffd9b0] transition-colors"
          >
            <ExternalLink size={14} />
            PR open — review and merge to publish
          </a>
        )}

        {/* Title */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Post Title</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Enter a compelling title..."
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#ff7d00] focus:border-transparent"
          />
        </div>

        {/* Date + Time */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Publish Date</label>
            <input
              type="date"
              value={scheduledDate}
              onChange={(e) => setScheduledDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#ff7d00] focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Publish Time</label>
            <select
              value={scheduledTime}
              onChange={(e) => setScheduledTime(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#ff7d00] focus:border-transparent"
            >
              {["08:00","09:00","10:00","11:00","12:00","13:00","14:00","15:00","16:00","17:00"].map((t) => (
                <option key={t} value={t}>
                  {new Date(`2000-01-01T${t}`).toLocaleTimeString("en-US", {
                    hour: "numeric",
                    minute: "2-digit",
                    hour12: true,
                  })}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Status */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Status</label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as Status)}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#ff7d00] focus:border-transparent"
          >
            <option value="draft">Draft</option>
            <option value="scheduled">Scheduled</option>
            <option value="published">Published</option>
          </select>
        </div>

        {/* Content */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-gray-700">Content</label>
            <div className="flex rounded-lg border border-gray-200 overflow-hidden">
              {(["write", "preview", "ai"] as Tab[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
                    tab === t
                      ? "bg-[#001524] text-white"
                      : "text-gray-500 hover:bg-gray-50"
                  }`}
                >
                  {t === "write" ? "Write" : t === "preview" ? "Preview" : "AI Assistant"}
                </button>
              ))}
            </div>
          </div>

          {tab === "write" ? (
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Write your blog post in markdown..."
              rows={14}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#ff7d00] focus:border-transparent resize-none"
            />
          ) : tab === "preview" ? (
            <div className="min-h-[280px] px-4 py-3 border border-gray-200 rounded-lg prose prose-sm max-w-none">
              {content ? (
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
              ) : (
                <p className="text-gray-400 italic">Nothing to preview yet.</p>
              )}
            </div>
          ) : (
            <div className="h-[440px] flex flex-col">
              <AIAssistant
                models={CLAUDE_MODELS}
                onUsePost={handleUseAIPost}
                variant="blog"
              />
            </div>
          )}
        </div>

        {/* Images */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Images</label>
          <div
            className="border-2 border-dashed border-gray-200 rounded-xl p-8 text-center hover:border-[#ff7d00] transition-colors cursor-pointer"
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              handleUpload(e.dataTransfer.files);
            }}
          >
            <Upload size={24} className="mx-auto mb-2 text-gray-400" />
            <p className="text-sm text-gray-500 mb-2">
              {uploading ? "Uploading…" : "Drag & drop images here, or"}
            </p>
            <button
              className="text-sm font-medium text-[#ff7d00] border border-[#ff7d00] rounded-lg px-3 py-1.5 hover:bg-[#ffecd1] transition-colors"
              onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
            >
              Browse Files
            </button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*"
            className="hidden"
            onChange={(e) => handleUpload(e.target.files)}
          />

          {fileIds.length > 0 && (
            <p className="text-xs text-gray-500 mt-2">{fileIds.length} file(s) attached</p>
          )}
        </div>
      </div>
      )}
    </SlideOver>
  );
}
