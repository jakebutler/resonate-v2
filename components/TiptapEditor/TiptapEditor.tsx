"use client";

import { useEffect, useImperativeHandle, forwardRef, useState } from "react";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Image from "@tiptap/extension-image";
import { Sparkles } from "lucide-react";
import { Markdown } from "tiptap-markdown";
import { Toolbar } from "./Toolbar";

export interface TiptapEditorSelection {
  text: string;
  from: number;
  to: number;
  top: number;
  left: number;
}

export interface TiptapEditorHandle {
  getHTML: () => string;
  getMarkdown: () => string;
  setContent: (content: string) => void;
  insertImage: (attrs: { src: string; alt?: string; fileId?: string }) => void;
  replaceRange: (range: { from: number; to: number }, content: string) => void;
  getTextBetween: (range: { from: number; to: number }) => string;
  focus: () => void;
  getEditor: () => Editor | null;
}

interface TiptapEditorProps {
  initialContent?: string;
  onChange?: (html: string) => void;
  placeholder?: string;
  onImageInsert?: () => void;
  onSelectionChange?: (selection: TiptapEditorSelection | null) => void;
  onAskAI?: (selection: TiptapEditorSelection) => void;
}

const EDITOR_CONTENT_CLASSES =
  "focus:outline-none min-h-[400px] px-0 py-4 text-[1.0625rem] leading-8 text-[#001524] " +
  "[&_p]:my-4 [&_h2]:mt-10 [&_h2]:mb-4 [&_h2]:font-forum [&_h2]:text-4xl [&_h2]:leading-tight " +
  "[&_h3]:mt-8 [&_h3]:mb-3 [&_h3]:font-forum [&_h3]:text-3xl [&_h3]:leading-tight " +
  "[&_ul]:my-5 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:my-5 [&_ol]:list-decimal [&_ol]:pl-6 " +
  "[&_li]:my-1.5 [&_blockquote]:my-6 [&_blockquote]:border-l-4 [&_blockquote]:border-[#ffecd1] " +
  "[&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-gray-600 " +
  "[&_a]:font-medium [&_a]:text-[#15616d] [&_a]:underline [&_a]:underline-offset-4 " +
  "[&_code]:rounded [&_code]:bg-gray-100 [&_code]:px-1.5 [&_code]:py-0.5 [&_pre]:my-6 " +
  "[&_pre]:overflow-x-auto [&_pre]:rounded-2xl [&_pre]:bg-[#001524] [&_pre]:p-4 [&_pre]:text-white " +
  "[&_img]:my-6 [&_img]:max-h-[52vh] [&_img]:max-w-full [&_img]:rounded-2xl [&_img]:object-contain";

export const TiptapEditor = forwardRef<TiptapEditorHandle, TiptapEditorProps>(
  function TiptapEditor(
    {
      initialContent = "",
      onChange,
      placeholder = "Start writing your post...",
      onImageInsert,
      onSelectionChange,
      onAskAI,
    },
    ref
  ) {
    const [selection, setSelection] = useState<TiptapEditorSelection | null>(null);

    const editor = useEditor({
      immediatelyRender: false,
      extensions: [
        StarterKit.configure({
          heading: { levels: [2, 3] },
          // Configure Link here — StarterKit v3 bundles Link, so we configure
          // it in-place rather than adding a separate Link extension (which
          // would produce a "Duplicate extension names: link" warning).
          link: {
            openOnClick: false,
            autolink: true,
          },
        }),
        Placeholder.configure({
          placeholder,
        }),
        Image.extend({
          addAttributes() {
            return {
              ...this.parent?.(),
              fileId: {
                default: null,
                parseHTML: (element) => element.getAttribute("data-file-id"),
                renderHTML: (attributes) =>
                  attributes.fileId
                    ? { "data-file-id": attributes.fileId }
                    : {},
              },
            };
          },
        }).configure({
          inline: false,
          allowBase64: true,
        }),
        Markdown.configure({
          html: true,
          tightLists: true,
          tightListClass: "tight",
          bulletListMarker: "-",
          linkify: false,
          breaks: false,
          transformPastedText: true,
          transformCopiedText: false,
        }),
      ],
      content: initialContent,
      onUpdate: ({ editor }) => {
        onChange?.(editor.getHTML());
      },
      onSelectionUpdate: ({ editor }) => {
        const { from, to, empty } = editor.state.selection;
        if (empty) {
          setSelection(null);
          onSelectionChange?.(null);
          return;
        }

        const text = editor.state.doc.textBetween(from, to, "\n").trim();
        if (!text) {
          setSelection(null);
          onSelectionChange?.(null);
          return;
        }

        const start = editor.view.coordsAtPos(from);
        const end = editor.view.coordsAtPos(to);
        const nextSelection = {
          text,
          from,
          to,
          top: Math.max(Math.min(start.top, end.top) - 44, 12),
          left: (start.left + end.left) / 2,
        };

        setSelection(nextSelection);
        onSelectionChange?.(nextSelection);
      },
      editorProps: {
        attributes: {
          class: EDITOR_CONTENT_CLASSES,
        },
      },
    });

    // Sync external content changes (e.g. when existing post loads or content is cleared)
    // Note: we check against both undefined and empty string so clearing the editor works correctly
    useEffect(() => {
      if (!editor) return;
      const currentHTML = editor.getHTML();
      if (currentHTML !== initialContent) {
        // emitUpdate: false prevents triggering onUpdate and causing an auto-save loop
        editor.commands.setContent(initialContent ?? "", {
          emitUpdate: false,
          parseOptions: { preserveWhitespace: "full" },
        });
      }
    }, [editor, initialContent]);

    useImperativeHandle(ref, () => ({
      getHTML: () => editor?.getHTML() ?? "",
      getMarkdown: () =>
        (
          (editor?.storage as { markdown?: { getMarkdown?: () => string } } | undefined)
            ?.markdown?.getMarkdown?.() ??
          editor?.getHTML() ??
          ""
        ),
      setContent: (content: string) =>
        editor?.commands.setContent(content, {
          emitUpdate: false,
          parseOptions: { preserveWhitespace: "full" },
        }),
      insertImage: ({ src, alt, fileId }) =>
        editor
          ?.chain()
          .focus()
          .insertContent({
            type: "image",
            attrs: {
              src,
              alt: alt ?? "",
              fileId: fileId ?? null,
            },
          })
          .run(),
      replaceRange: (range, content) =>
        editor?.chain().focus().insertContentAt(range, content).run(),
      getTextBetween: (range) =>
        editor?.state.doc.textBetween(range.from, range.to, "\n") ?? "",
      focus: () => editor?.commands.focus(),
      getEditor: () => editor,
    }));

    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <Toolbar editor={editor} onImageInsert={onImageInsert} />
        <div
          data-testid="editor-scroll-region"
          className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-8 py-2"
        >
          <EditorContent editor={editor} className="min-h-full" />
        </div>
        {selection && onAskAI ? (
          <button
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onAskAI(selection)}
            className="fixed z-20 inline-flex items-center gap-1 rounded-full bg-[#4f46e5] px-3 py-1.5 text-xs font-medium text-white shadow-lg transition-colors hover:bg-[#4338ca]"
            style={{
              top: `${selection.top}px`,
              left: `${selection.left}px`,
              transform: "translateX(-50%)",
            }}
          >
            <Sparkles size={12} />
            Ask AI
          </button>
        ) : null}
      </div>
    );
  }
);
