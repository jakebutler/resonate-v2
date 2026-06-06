"use client";

import { FileText, Linkedin } from "lucide-react";
import { Id } from "@/convex/_generated/dataModel";

interface Post {
  _id: Id<"posts">;
  type: "blog" | "linkedin";
  title?: string;
  content: string;
  status: string;
  scheduledDate?: string;
  createdAt: number;
  updatedAt: number;
}

type Filter = "all" | "blog" | "linkedin";
type TimePeriod = "all" | "this-month" | "last-3-months" | "this-year";

interface ContentLibraryProps {
  posts: Post[];
  filter: Filter;
  timePeriod: TimePeriod;
  onEditPost: (post: Post) => void;
}

function formatDate(dateStr: string): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function resolveDate(post: Post): string {
  if (post.scheduledDate) return post.scheduledDate;
  return new Date(post.createdAt).toISOString().slice(0, 10);
}

function matchesTimePeriod(post: Post, period: TimePeriod): boolean {
  if (period === "all") return true;
  const dateStr = resolveDate(post);
  const date = new Date(dateStr + "T00:00:00");
  const now = new Date();
  if (period === "this-month") {
    return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
  }
  if (period === "last-3-months") {
    const cutoff = new Date(now);
    cutoff.setDate(cutoff.getDate() - 90);
    return date >= cutoff;
  }
  if (period === "this-year") {
    return date.getFullYear() === now.getFullYear();
  }
  return true;
}

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-gray-100 text-gray-500",
  scheduled: "bg-[#ff7d00]/10 text-[#ff7d00]",
  published: "bg-green-50 text-green-700",
};

export function ContentLibrary({ posts, filter, timePeriod, onEditPost }: ContentLibraryProps) {
  const filtered = posts
    .filter((p) => filter === "all" || p.type === filter)
    .filter((p) => matchesTimePeriod(p, timePeriod))
    .sort((a, b) => b.updatedAt - a.updatedAt);

  const getTitle = (p: Post) => {
    if (p.type === "blog") return p.title || "Untitled";
    const text = p.content?.trim() || "";
    return text.length > 72 ? text.slice(0, 72) + "…" : text || "Untitled";
  };

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      {/* Column headers */}
      <div className="grid grid-cols-[1fr_auto_auto_auto] gap-4 px-5 py-3 bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-400 uppercase tracking-wider">
        <span>Title</span>
        <span className="w-24 text-center">Type</span>
        <span className="w-24 text-center">Status</span>
        <span className="w-28 text-right">Date</span>
      </div>

      {filtered.length === 0 ? (
        <div className="py-16 flex flex-col items-center justify-center text-center text-gray-400">
          <p className="font-medium">No content matches these filters</p>
          <p className="text-sm mt-1">Try adjusting the type or time period above</p>
        </div>
      ) : (
        <div className="divide-y divide-gray-100">
          {filtered.map((post) => (
            <button
              key={post._id}
              onClick={() => onEditPost(post)}
              className="w-full grid grid-cols-[1fr_auto_auto_auto] gap-4 items-center px-5 py-3.5 text-left hover:bg-[#ffecd1]/20 transition-colors group"
            >
              {/* Title */}
              <span className="text-sm font-medium text-[#001524] truncate group-hover:text-[#78290f] transition-colors">
                {getTitle(post)}
              </span>

              {/* Type badge */}
              <span
                className={`w-24 flex items-center justify-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium ${
                  post.type === "blog"
                    ? "bg-[#ffecd1] text-[#78290f]"
                    : "bg-[#15616d]/10 text-[#15616d]"
                }`}
              >
                {post.type === "blog" ? (
                  <FileText size={11} className="shrink-0" />
                ) : (
                  <Linkedin size={11} className="shrink-0" />
                )}
                {post.type === "blog" ? "Blog" : "LinkedIn"}
              </span>

              {/* Status badge */}
              <span
                className={`w-24 flex items-center justify-center px-2 py-1 rounded-md text-xs font-medium capitalize ${
                  STATUS_STYLES[post.status] ?? "bg-gray-100 text-gray-500"
                }`}
              >
                {post.status}
              </span>

              {/* Date */}
              <span className="w-28 text-right text-sm text-gray-400">
                {post.scheduledDate ? formatDate(post.scheduledDate) : "—"}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
