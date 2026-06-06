import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { TiptapEditor } from "@/components/TiptapEditor/TiptapEditor";

const mockUseEditor = vi.fn();

vi.mock("@tiptap/react", () => ({
  useEditor: (...args: unknown[]) => mockUseEditor(...args),
  EditorContent: ({ editor }: { editor: unknown }) => (
    <div data-testid="editor-content">{String(Boolean(editor))}</div>
  ),
}));

vi.mock("@tiptap/starter-kit", () => ({
  default: {
    configure: vi.fn(() => ({ name: "StarterKit" })),
  },
}));

vi.mock("@tiptap/extension-placeholder", () => ({
  default: {
    configure: vi.fn(() => ({ name: "Placeholder" })),
  },
}));

vi.mock("@tiptap/extension-image", () => ({
  default: {
    extend: vi.fn(() => ({
      configure: vi.fn(() => ({ name: "Image" })),
    })),
  },
}));

vi.mock("tiptap-markdown", () => ({
  Markdown: {
    configure: vi.fn(() => ({ name: "Markdown" })),
  },
}));

vi.mock("@/components/TiptapEditor/Toolbar", () => ({
  Toolbar: () => <div data-testid="toolbar" />,
}));

describe("TiptapEditor", () => {
  beforeEach(() => {
    mockUseEditor.mockReset()
    mockUseEditor.mockReturnValue(null)
  })

  it("disables immediate render to avoid SSR hydration mismatches", () => {
    render(<TiptapEditor />)

    expect(mockUseEditor).toHaveBeenCalledWith(
      expect.objectContaining({
        immediatelyRender: false,
        editorProps: expect.objectContaining({
          attributes: expect.objectContaining({
            class: expect.stringContaining("[&_ul]:list-disc"),
          }),
        }),
      })
    )
    expect(screen.getByTestId("toolbar")).toBeInTheDocument()
    expect(screen.getByTestId("editor-content")).toHaveTextContent("false")
    expect(screen.getByTestId("editor-scroll-region")).toHaveClass("overflow-y-auto")
  })
})
