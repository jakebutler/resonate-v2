"use client";

import { useRef, useState } from "react";
import { Settings, ExternalLink } from "lucide-react";

type Status = "draft" | "scheduled" | "published";

const STATUS_CYCLE: Record<Status, Status> = {
  draft: "scheduled",
  scheduled: "published",
  published: "draft",
};

const STATUS_STYLES: Record<Status, string> = {
  draft: "bg-gray-100 text-gray-600",
  scheduled: "bg-[#ffecd1] text-[#78290f]",
  published: "bg-green-100 text-green-700",
};

const TIMES = Array.from({ length: 24 }, (_, hour) =>
  `${String(hour).padStart(2, "0")}:00`
);

function parseTagsInput(value: string) {
  return value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

interface MetadataBarProps {
  status: Status;
  scheduledDate: string;
  scheduledTime: string;
  tags: string[];
  subtitle: string;
  excerpt: string;
  author: string;
  category: string;
  featured: boolean;
  coverImageAlt: string;
  onStatusChange: (status: Status) => void;
  onDateChange: (date: string) => void;
  onTimeChange: (time: string) => void;
  onTagsChange: (tags: string[]) => void;
  onSubtitleChange: (value: string) => void;
  onExcerptChange: (value: string) => void;
  onAuthorChange: (value: string) => void;
  onCategoryChange: (value: string) => void;
  onFeaturedChange: (value: boolean) => void;
  onCoverImageAltChange: (value: string) => void;
  onPublish: () => void;
  publishing: boolean;
  githubPrUrl: string;
  title: string;
  hasContent: boolean;
}

export function MetadataBar({
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
  onStatusChange,
  onDateChange,
  onTimeChange,
  onTagsChange,
  onSubtitleChange,
  onExcerptChange,
  onAuthorChange,
  onCategoryChange,
  onFeaturedChange,
  onCoverImageAltChange,
  onPublish,
  publishing,
  githubPrUrl,
  title,
  hasContent,
}: MetadataBarProps) {
  const [expanded, setExpanded] = useState(false);
  const [tagsInput, setTagsInput] = useState(tags.join(", "));
  const [isEditingTags, setIsEditingTags] = useState(false);
  const skipNextBlurCommitRef = useRef(false);

  const canPublish = Boolean(title && hasContent && !publishing);

  const commitTags = (value: string) => {
    const nextTags = parseTagsInput(value);
    onTagsChange(nextTags);
    setTagsInput(nextTags.join(", "));
  };

  return (
    <div className="px-12 pb-4 shrink-0">
      {/* GitHub PR link */}
      {githubPrUrl && (
        <a
          href={githubPrUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="PR open — review and merge to publish"
          className="flex items-center gap-2 mb-3 px-3 py-2 bg-[#ffecd1] rounded-lg text-xs text-[#78290f] hover:bg-[#ffd9b0] transition-colors w-fit"
        >
          <ExternalLink size={12} />
          PR open — review and merge to publish
        </a>
      )}

      {/* Primary row */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Status badge */}
        <button
          type="button"
          onClick={() => onStatusChange(STATUS_CYCLE[status])}
          aria-label="Change status"
          className={`px-2.5 py-1 rounded-full text-xs font-medium capitalize transition-colors hover:opacity-80 ${STATUS_STYLES[status]}`}
        >
          {status}
        </button>

        {/* Date */}
        <div className="flex items-center gap-1.5">
          <label htmlFor="meta-date" className="text-xs text-gray-400 sr-only">
            Publish date
          </label>
          <input
            id="meta-date"
            type="date"
            value={scheduledDate}
            onChange={(e) => onDateChange(e.target.value)}
            aria-label="Publish date"
            className="text-xs text-gray-600 border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-[#ff7d00]"
          />
        </div>

        {/* Time */}
        <select
          value={scheduledTime}
          onChange={(e) => onTimeChange(e.target.value)}
          aria-label="Publish time"
          className="text-xs text-gray-600 border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-[#ff7d00]"
        >
          {TIMES.map((t) => (
            <option key={t} value={t}>
              {new Date(`2000-01-01T${t}`).toLocaleTimeString(undefined, {
                hour: "numeric",
                minute: "2-digit",
                hour12: true,
              })}
            </option>
          ))}
        </select>

        {/* Settings gear */}
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          aria-label="Settings"
          aria-expanded={expanded}
          className={`p-1 rounded-md transition-colors ${
            expanded
              ? "text-[#ff7d00] bg-[#ffecd1]"
              : "text-gray-400 hover:text-gray-600 hover:bg-gray-100"
          }`}
        >
          <Settings size={14} />
        </button>

        {/* Publish button — right-aligned */}
        <div className="ml-auto">
          <button
            type="button"
            onClick={onPublish}
            disabled={!canPublish}
            aria-label="Publish"
            className="px-4 py-1.5 bg-[#ff7d00] text-white rounded-xl text-xs font-semibold hover:bg-[#e67200] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {publishing ? "Creating PR…" : "Publish"}
          </button>
        </div>
      </div>

      {/* Expanded settings row */}
      {expanded && (
        <div className="mt-3 grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="meta-tags" className="block text-xs font-medium text-gray-500 mb-1">
              Tags
            </label>
            <input
              id="meta-tags"
              type="text"
              value={isEditingTags ? tagsInput : tags.join(", ")}
              onFocus={() => {
                setTagsInput(tags.join(", "));
                setIsEditingTags(true);
              }}
              onChange={(e) => {
                const nextValue = e.target.value;
                setTagsInput(nextValue);
                onTagsChange(parseTagsInput(nextValue));
              }}
              onBlur={(e) => {
                setIsEditingTags(false);
                if (skipNextBlurCommitRef.current) {
                  skipNextBlurCommitRef.current = false;
                  return;
                }
                commitTags(e.target.value);
              }}
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                e.preventDefault();
                skipNextBlurCommitRef.current = true;
                setIsEditingTags(false);
                commitTags(tagsInput);
                e.currentTarget.blur();
              }}
              placeholder="ai, leadership, strategy"
              aria-label="Tags"
              className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#ff7d00]"
            />
          </div>
          <div>
            <label htmlFor="meta-subtitle" className="block text-xs font-medium text-gray-500 mb-1">
              Subtitle
            </label>
            <input
              id="meta-subtitle"
              value={subtitle}
              onChange={(e) => onSubtitleChange(e.target.value)}
              placeholder="Optional subtitle line"
              aria-label="Subtitle"
              className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#ff7d00]"
            />
          </div>
          <div>
            <label htmlFor="meta-excerpt" className="block text-xs font-medium text-gray-500 mb-1">
              Excerpt
            </label>
            <textarea
              id="meta-excerpt"
              value={excerpt}
              onChange={(e) => onExcerptChange(e.target.value)}
              placeholder="Short summary used for SEO and social cards..."
              rows={2}
              aria-label="Excerpt"
              className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#ff7d00] resize-none"
            />
          </div>
          <div>
            <label htmlFor="meta-author" className="block text-xs font-medium text-gray-500 mb-1">
              Author
            </label>
            <input
              id="meta-author"
              value={author}
              onChange={(e) => onAuthorChange(e.target.value)}
              placeholder="Jake Butler"
              aria-label="Author"
              className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#ff7d00]"
            />
          </div>
          <div>
            <label htmlFor="meta-category" className="block text-xs font-medium text-gray-500 mb-1">
              Category
            </label>
            <input
              id="meta-category"
              value={category}
              onChange={(e) => onCategoryChange(e.target.value)}
              placeholder="strategy"
              aria-label="Category"
              className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#ff7d00]"
            />
          </div>
          <div>
            <label htmlFor="meta-cover-alt" className="block text-xs font-medium text-gray-500 mb-1">
              Cover Image Alt
            </label>
            <input
              id="meta-cover-alt"
              value={coverImageAlt}
              onChange={(e) => onCoverImageAltChange(e.target.value)}
              placeholder="Describe the cover image"
              aria-label="Cover image alt"
              className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#ff7d00]"
            />
          </div>
          <label
            htmlFor="meta-featured"
            className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-xs text-gray-600"
          >
            <input
              id="meta-featured"
              type="checkbox"
              checked={featured}
              onChange={(e) => onFeaturedChange(e.target.checked)}
              aria-label="Featured"
              className="rounded border-gray-300 text-[#ff7d00] focus:ring-[#ff7d00]"
            />
            Featured post
          </label>
        </div>
      )}
    </div>
  );
}
