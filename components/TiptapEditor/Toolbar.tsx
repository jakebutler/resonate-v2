"use client";

import type { Editor } from "@tiptap/react";
import {
  Bold,
  Italic,
  Link2,
  List,
  ListOrdered,
  Quote,
  Code,
  Heading2,
  Heading3,
  Image as ImageIcon,
} from "lucide-react";

interface ToolbarProps {
  editor: Editor | null;
  onImageInsert?: () => void;
}

interface ToolbarButton {
  label: string;
  icon: React.ReactNode;
  action: () => void;
  isActive: () => boolean;
  shortcut?: string;
}

const SAFE_URL_PROTOCOLS = new Set(["http:", "https:", "mailto:", "tel:"]);

function normalizeUrl(rawValue: string) {
  const trimmed = rawValue.trim();
  if (!trimmed) return null;

  const normalized = /^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  try {
    const parsedUrl = new URL(normalized);
    return SAFE_URL_PROTOCOLS.has(parsedUrl.protocol)
      ? parsedUrl.toString()
      : null;
  } catch {
    return null;
  }
}

export function Toolbar({ editor, onImageInsert }: ToolbarProps) {
  if (!editor) return null;

  const buttons: ToolbarButton[] = [
    {
      label: "Heading 2",
      icon: <Heading2 size={16} />,
      action: () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
      isActive: () => editor.isActive("heading", { level: 2 }),
    },
    {
      label: "Heading 3",
      icon: <Heading3 size={16} />,
      action: () => editor.chain().focus().toggleHeading({ level: 3 }).run(),
      isActive: () => editor.isActive("heading", { level: 3 }),
    },
    {
      label: "Bold",
      icon: <Bold size={16} />,
      action: () => editor.chain().focus().toggleBold().run(),
      isActive: () => editor.isActive("bold"),
      shortcut: "⌘B",
    },
    {
      label: "Italic",
      icon: <Italic size={16} />,
      action: () => editor.chain().focus().toggleItalic().run(),
      isActive: () => editor.isActive("italic"),
      shortcut: "⌘I",
    },
    {
      label: "Link",
      icon: <Link2 size={16} />,
      action: () => {
        const url = window.prompt("Enter URL:");
        if (!url) return;

        const normalizedUrl = normalizeUrl(url);
        if (!normalizedUrl) {
          window.alert("Please enter a valid URL.");
          return;
        }

        editor.chain().focus().setLink({ href: normalizedUrl }).run();
      },
      isActive: () => editor.isActive("link"),
      shortcut: "⌘K",
    },
    {
      label: "Bullet List",
      icon: <List size={16} />,
      action: () => editor.chain().focus().toggleBulletList().run(),
      isActive: () => editor.isActive("bulletList"),
    },
    {
      label: "Numbered List",
      icon: <ListOrdered size={16} />,
      action: () => editor.chain().focus().toggleOrderedList().run(),
      isActive: () => editor.isActive("orderedList"),
    },
    {
      label: "Blockquote",
      icon: <Quote size={16} />,
      action: () => editor.chain().focus().toggleBlockquote().run(),
      isActive: () => editor.isActive("blockquote"),
    },
    {
      label: "Code Block",
      icon: <Code size={16} />,
      action: () => editor.chain().focus().toggleCodeBlock().run(),
      isActive: () => editor.isActive("codeBlock"),
    },
  ];

  return (
    <div
      className="flex items-center gap-0.5 px-3 py-2 border-b border-gray-100 bg-white sticky top-0 z-10 flex-wrap"
      role="toolbar"
      aria-label="Formatting toolbar"
    >
      {buttons.map((btn) => (
        <button
          key={btn.label}
          type="button"
          onClick={btn.action}
          title={btn.shortcut ? `${btn.label} (${btn.shortcut})` : btn.label}
          aria-label={btn.label}
          aria-pressed={btn.isActive()}
          className={`
            p-1.5 rounded-md transition-colors text-sm
            ${btn.isActive()
              ? "bg-[#ff7d00] text-white"
              : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
            }
          `}
        >
          {btn.icon}
        </button>
      ))}

      {/* Separator */}
      <div className="w-px h-5 bg-gray-200 mx-1" role="separator" />

      {/* Image insert */}
      {onImageInsert ? (
        <button
          type="button"
          onClick={onImageInsert}
          title="Insert Image"
          aria-label="Insert image"
          className="p-1.5 rounded-md text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors"
        >
          <ImageIcon size={16} />
        </button>
      ) : null}
    </div>
  );
}
