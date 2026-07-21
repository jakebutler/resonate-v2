"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

type MarkdownPreviewProps = {
  content: string;
  className?: string;
  emptyMessage?: string;
};

export function MarkdownPreview({
  content,
  className,
  emptyMessage = "Nothing to preview yet.",
}: MarkdownPreviewProps) {
  return (
    <div
      className={cn(
        "prose prose-sm max-w-none text-gray-800 prose-headings:text-gray-900 prose-a:text-[#15616d]",
        className
      )}
    >
      {content.trim() ? (
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
      ) : (
        <p className="not-prose text-sm text-gray-500">{emptyMessage}</p>
      )}
    </div>
  );
}
