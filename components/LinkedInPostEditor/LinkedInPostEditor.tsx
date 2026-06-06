"use client";

import { useState, useEffect } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { SlideOver } from "@/components/ui/SlideOver";
import { Button } from "@/components/ui/button";
import { AIAssistant } from "@/components/AIAssistant/AIAssistant";
import { Linkedin, Trash2, Save, Edit3, Sparkles } from "lucide-react";

const MAX_CHARS = 3000;

interface LinkedInPostEditorProps {
  open: boolean;
  postId: Id<"posts"> | null;
  initialDate?: string;
  onClose: () => void;
  onSaved: () => void;
}

type Status = "draft" | "scheduled" | "published";
type Tab = "write" | "ai";

function todayYMD() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function LinkedInPostEditor({ open, postId, initialDate, onClose, onSaved }: LinkedInPostEditorProps) {
  const existing = useQuery(api.posts.getById, postId ? { id: postId } : "skip");
  const allPosts = useQuery(api.posts.list, { type: "blog" });
  const createPost = useMutation(api.posts.create);
  const updatePost = useMutation(api.posts.update);
  const removePost = useMutation(api.posts.remove);

  const [content, setContent] = useState("");
  const [status, setStatus] = useState<Status>("draft");
  const [scheduledDate, setScheduledDate] = useState(initialDate || "");
  const [scheduledTime, setScheduledTime] = useState("09:00");
  const [tab, setTab] = useState<Tab>("write");
  const [isRepost, setIsRepost] = useState(false);
  const [externalUrl, setExternalUrl] = useState("");
  const [linkedBlogPostId, setLinkedBlogPostId] = useState<string>("");
  const [saving, setSaving] = useState(false);

  // NOTE: This useEffect is intentionally duplicated in BlogPostEditor.tsx.
  // Both editors prefill scheduledDate when opened from the calendar.
  // If a third editor is added, extract to a shared hook.
  useEffect(() => {
    if (open && !postId) {
      setScheduledDate(initialDate || "");
    }
  }, [open, initialDate, postId]);

  // Sync from existing
  useEffect(() => {
    if (existing) {
      setContent(existing.content);
      setStatus(existing.status);
      setScheduledDate(existing.scheduledDate || "");
      setScheduledTime(existing.scheduledTime || "09:00");
      setIsRepost(existing.isRepost || false);
      setExternalUrl(existing.externalUrl || "");
      setLinkedBlogPostId(existing.linkedBlogPostId || "");
    } else if (!postId) {
      setContent("");
      setStatus("draft");
      setScheduledDate(initialDate || "");
      setScheduledTime("09:00");
      setIsRepost(false);
      setExternalUrl("");
      setLinkedBlogPostId("");
    }
  }, [existing, initialDate, postId]);

  const isLoadingExisting = open && !!postId && existing === undefined;
  const isPastPost = Boolean(postId && existing?.scheduledDate && existing.scheduledDate < todayYMD());

  useEffect(() => {
    if (!open) return;
    if (!postId) {
      setTab("write");
    }
  }, [open, postId]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = {
        content,
        status,
        scheduledDate,
        scheduledTime,
        isRepost,
        externalUrl: externalUrl || undefined,
        linkedBlogPostId: linkedBlogPostId ? (linkedBlogPostId as Id<"posts">) : undefined,
      };
      if (postId) {
        await updatePost({ id: postId, ...payload });
      } else {
        await createPost({ type: "linkedin", ...payload });
      }
      onSaved();
      onClose();
    } finally {
      setSaving(false);
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
    setContent(text.slice(0, MAX_CHARS));
    setTab("write");
  };

  const linkedBlogPost = (allPosts || []).find((post) => post._id === linkedBlogPostId);

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
        <Button variant="primary" onClick={handleSave} disabled={saving}>
          <Save size={14} />
          {saving ? "Saving…" : "Save Draft"}
        </Button>
      </div>
    </>
  );

  const charCount = content.length;
  const charColor =
    charCount > MAX_CHARS
      ? "text-red-500"
      : charCount > MAX_CHARS * 0.9
      ? "text-amber-500"
      : "text-gray-400";

  return (
    <SlideOver
      open={open}
      onClose={onClose}
      title={isPastPost ? "View LinkedIn Post" : postId ? "Edit LinkedIn Post" : "New LinkedIn Post"}
      icon={<Linkedin size={16} />}
      footer={footer}
    >
      {isLoadingExisting ? (
        <p className="text-sm text-gray-500">Loading post…</p>
      ) : !existing && postId ? (
        <p className="text-sm text-gray-500">Post not found.</p>
      ) : isPastPost ? (
        <div className="space-y-5">
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
            <p className="mb-2 text-sm font-medium text-gray-700">Post Preview</p>
            <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#15616d]/10 text-[#15616d]">
                  <Linkedin size={18} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-[#001524]">LinkedIn Post</p>
                  <p className="text-xs text-gray-500">{scheduledDate || "Unscheduled"}</p>
                </div>
              </div>
              {content ? (
                <p className="whitespace-pre-wrap text-sm leading-6 text-gray-700">{content}</p>
              ) : (
                <p className="text-sm italic text-gray-400">No post content saved.</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
              <p className="text-xs uppercase tracking-wide text-gray-400">Repost</p>
              <p className="mt-1 text-sm font-medium text-[#001524]">{isRepost ? "Yes" : "No"}</p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
              <p className="text-xs uppercase tracking-wide text-gray-400">Linked Blog Post</p>
              <p className="mt-1 text-sm font-medium text-[#001524]">
                {linkedBlogPost?.title || "None"}
              </p>
            </div>
          </div>

          {externalUrl && (
            <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
              <p className="text-xs uppercase tracking-wide text-gray-400">Original Post URL</p>
              <a
                href={externalUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 block text-sm font-medium text-[#15616d] hover:underline"
              >
                {externalUrl}
              </a>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-5">
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
              {["07:00","08:00","09:00","10:00","11:00","12:00","13:00","14:00","15:00","16:00","17:00","18:00"].map((t) => (
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
          </select>
        </div>

        {/* Tab toggle */}
        <div className="flex rounded-xl border border-gray-200 overflow-hidden">
          <button
            onClick={() => setTab("write")}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium transition-colors ${
              tab === "write"
                ? "bg-white text-[#001524] shadow-sm"
                : "bg-gray-50 text-gray-500 hover:bg-gray-100"
            }`}
          >
            <Edit3 size={14} />
            Write Post
          </button>
          <button
            onClick={() => setTab("ai")}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium transition-colors ${
              tab === "ai"
                ? "bg-white text-[#001524] shadow-sm"
                : "bg-gray-50 text-gray-500 hover:bg-gray-100"
            }`}
          >
            <Sparkles size={14} />
            AI Assistant
          </button>
        </div>

        {tab === "write" ? (
          <div className="space-y-4">
            {/* Content */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-sm font-medium text-gray-700">Post Content</label>
                <span className={`text-xs ${charColor}`}>
                  {charCount.toLocaleString()} / {MAX_CHARS.toLocaleString()}
                </span>
              </div>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value.slice(0, MAX_CHARS))}
                placeholder="What do you want to share with your network?"
                rows={12}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#ff7d00] focus:border-transparent resize-none"
              />
            </div>

            {/* Repost toggle */}
            <div className="flex items-center gap-3">
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={isRepost}
                  onChange={(e) => setIsRepost(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-gray-200 peer-checked:bg-[#15616d] rounded-full peer-focus:ring-2 peer-focus:ring-[#15616d]/30 transition-colors after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-transform peer-checked:after:translate-x-4" />
              </label>
              <span className="text-sm text-gray-700">This is a repost</span>
            </div>

            {isRepost && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Original Post URL</label>
                <input
                  type="url"
                  value={externalUrl}
                  onChange={(e) => setExternalUrl(e.target.value)}
                  placeholder="https://www.linkedin.com/posts/..."
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#ff7d00] focus:border-transparent"
                />
              </div>
            )}

            {/* Cross-promo */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Link to Blog Post{" "}
                <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <select
                value={linkedBlogPostId}
                onChange={(e) => setLinkedBlogPostId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#ff7d00] focus:border-transparent"
              >
                <option value="">None</option>
                {(allPosts || []).map((p) => (
                  <option key={p._id} value={p._id}>
                    {p.title || "(Untitled)"}
                  </option>
                ))}
              </select>
            </div>
          </div>
        ) : (
          <div className="h-[440px] flex flex-col">
            <AIAssistant onUsePost={handleUseAIPost} />
          </div>
        )}
      </div>
      )}
    </SlideOver>
  );
}
