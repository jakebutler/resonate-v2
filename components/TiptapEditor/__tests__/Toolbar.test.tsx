import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Toolbar } from "@/components/TiptapEditor/Toolbar";

describe("Toolbar", () => {
  const mockSetLink = vi.fn();
  const mockRun = vi.fn();
  const mockFocus = vi.fn();
  const mockChain = vi.fn();
  let promptSpy: ReturnType<typeof vi.spyOn>;
  let alertSpy: ReturnType<typeof vi.spyOn>;

  const editor = {
    chain: mockChain,
    isActive: vi.fn(() => false),
  };

  beforeEach(() => {
    mockSetLink.mockReset();
    mockRun.mockReset();
    mockFocus.mockReset();
    mockChain.mockReset();
    mockRun.mockReturnValue(true);
    mockSetLink.mockReturnValue({ run: mockRun });
    mockFocus.mockReturnValue({ setLink: mockSetLink });
    mockChain.mockReturnValue({ focus: mockFocus });
    promptSpy = vi.spyOn(window, "prompt");
    alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
  });

  afterEach(() => {
    promptSpy.mockRestore();
    alertSpy.mockRestore();
  });

  it("normalizes schemeless links to https before inserting them", () => {
    promptSpy.mockReturnValue("example.com");

    render(<Toolbar editor={editor as never} />);

    fireEvent.click(screen.getByRole("button", { name: /link/i }));

    expect(mockSetLink).toHaveBeenCalledWith({ href: "https://example.com/" });
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it.each(["javascript:alert(1)", "data:text/html,<script>alert(1)</script>"])(
    "rejects unsafe link protocols like %s",
    (url) => {
      promptSpy.mockReturnValue(url);

      render(<Toolbar editor={editor as never} />);

      fireEvent.click(screen.getByRole("button", { name: /link/i }));

      expect(mockSetLink).not.toHaveBeenCalled();
      expect(alertSpy).toHaveBeenCalledWith("Please enter a valid URL.");
    }
  );
});
