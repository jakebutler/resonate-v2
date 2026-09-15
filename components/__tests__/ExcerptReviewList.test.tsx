import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ExcerptReviewList, type ReviewedExcerpt } from "@/components/campaigns/ExcerptReviewList";
import { useMutation } from "convex/react";

vi.mock("convex/react", () => ({
  useMutation: vi.fn(),
}));

vi.mock("@/convex/_generated/api", () => ({
  api: {
    corpora: {
      recordExcerptCorrection: "corpora:recordExcerptCorrection",
    },
  },
}));

const useMutationMock = vi.mocked(useMutation);

const excerpts = [
  {
    text: "We explore reasoning traces and actions interleaved so the model can update high-level plans.",
    provenance: "p.1 · Abstract",
    unusable: false,
  },
  {
    text: "34.2 | 35.1 || 61.0\nNaN [ARTIFACT]",
    provenance: "p.8 · Table 2",
    unusable: true,
    unusableReason: "mangled numeric table",
  },
];

describe("ExcerptReviewList", () => {
  it("renders numbered excerpts with plain-text provenance", () => {
    render(<ExcerptReviewList brandId="corvo" documentName="paper.pdf" excerpts={excerpts} />);
    expect(screen.getByText("#1")).toBeDefined();
    expect(screen.getByText("#2")).toBeDefined();
    expect(screen.getByText("p.1 · Abstract")).toBeDefined();
    expect(screen.getByText("unusable extract")).toBeDefined();
  });

  it("hard-blocks unusable extracts from being checked", () => {
    render(<ExcerptReviewList brandId="corvo" documentName="paper.pdf" excerpts={excerpts} />);
    const usable = screen.getByLabelText("Include excerpt 1") as HTMLInputElement;
    const unusable = screen.getByLabelText("Include excerpt 2") as HTMLInputElement;
    expect(usable.checked).toBe(true);
    expect(unusable.checked).toBe(false);
    expect(unusable.disabled).toBe(true);
  });

  it("keeps the sensitivity select inactive while an excerpt is unchecked", () => {
    render(<ExcerptReviewList brandId="corvo" documentName="paper.pdf" excerpts={excerpts} />);
    const usable = screen.getByLabelText("Include excerpt 1") as HTMLInputElement;
    const combo = screen.getByLabelText("Sensitivity for excerpt 1");
    expect(combo.getAttribute("aria-disabled") ?? "false").toBe("false");
    expect((combo as HTMLInputElement).disabled).toBe(false);

    fireEvent.click(usable);
    expect(combo.getAttribute("aria-disabled")).toBe("true");
    expect((combo as HTMLInputElement).disabled).toBe(true);
  });

  it("captures a correction for an unusable extract without saving it", async () => {
    const recordCorrection = vi.fn().mockResolvedValue({ recorded: true });
    useMutationMock.mockReturnValue(recordCorrection);
    const onCorrectionsRecorded = vi.fn();
    render(
      <ExcerptReviewList
        brandId="corvo"
        documentName="paper.pdf"
        excerpts={excerpts}
        onCorrectionsRecorded={onCorrectionsRecorded}
      />
    );

    fireEvent.click(screen.getByText("Flag & fix"));
    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, {
      target: { value: "This is Table 2 — success rates by task. Column headers lost." },
    });
    fireEvent.click(screen.getByText("Capture correction & keep blocked"));

    await waitFor(() => {
      expect(recordCorrection).toHaveBeenCalledWith({
        brandId: "corvo",
        documentName: "paper.pdf",
        excerptPreview: excerpts[1].text,
        correction: "This is Table 2 — success rates by task. Column headers lost.",
      });
    });
    expect(await screen.findByText("correction captured")).toBeDefined();
    expect(onCorrectionsRecorded).toHaveBeenCalled();
    const unusable = screen.getByLabelText("Include excerpt 2") as HTMLInputElement;
    expect(unusable.checked).toBe(false);
  });

  it("reports selection changes to the parent", () => {
    const onSelectionChange = vi.fn();
    render(
      <ExcerptReviewList
        brandId="corvo"
        documentName="paper.pdf"
        excerpts={excerpts}
        onSelectionChange={onSelectionChange}
      />
    );
    fireEvent.click(screen.getByLabelText("Include excerpt 1"));
    expect(onSelectionChange).toHaveBeenLastCalledWith([]);
  });

  it("summarizes the selected excerpt count", () => {
    render(<ExcerptReviewList brandId="corvo" documentName="paper.pdf" excerpts={excerpts} />);
    expect(screen.getByTestId("excerpt-selection-count").textContent).toContain(
      "1 excerpt selected"
    );
  });

  it("hides split/merge without the editable (pre-save) flag", () => {
    render(<ExcerptReviewList brandId="corvo" documentName="paper.pdf" excerpts={excerpts} />);
    expect(screen.queryByText("Split")).toBeNull();
    expect(screen.queryByTestId("merge-selected")).toBeNull();
  });

  it("splits an excerpt at a blank line into separate rows (D-16, pre-save)", () => {
    const onExcerptsChange = vi.fn();
    render(
      <ExcerptReviewList
        brandId="corvo"
        documentName="paper.pdf"
        excerpts={excerpts}
        editable
        onExcerptsChange={onExcerptsChange}
      />
    );

    fireEvent.click(screen.getByText("Split"));
    const editor = screen.getByLabelText("Split editor for excerpt 1");
    fireEvent.change(editor, {
      target: {
        value:
          "We explore reasoning traces and actions interleaved.\n\nSo the model can update high-level plans.",
      },
    });
    fireEvent.click(screen.getByText("Split into 2 excerpts"));

    expect(onExcerptsChange).toHaveBeenCalledTimes(1);
    const next = onExcerptsChange.mock.calls[0][0];
    expect(next).toHaveLength(3);
    expect(next[0]).toMatchObject({
      text: "We explore reasoning traces and actions interleaved.",
      provenance: "p.1 · Abstract",
      unusable: false,
    });
    expect(next[1]).toMatchObject({
      text: "So the model can update high-level plans.",
      provenance: "p.1 · Abstract",
      unusable: false,
    });
    // The unusable table excerpt keeps its position after the split run.
    expect(next[2].text).toBe(excerpts[1].text);
  });

  it("refuses to split without a blank-line boundary", () => {
    const onExcerptsChange = vi.fn();
    render(
      <ExcerptReviewList
        brandId="corvo"
        documentName="paper.pdf"
        excerpts={excerpts}
        editable
        onExcerptsChange={onExcerptsChange}
      />
    );

    fireEvent.click(screen.getByText("Split"));
    // No blank line added — the confirm stays disabled and no change fires.
    expect(screen.getByText("Split (needs a blank line)")).toBeDefined();
    expect(onExcerptsChange).not.toHaveBeenCalled();
  });

  it("merges consecutive selected excerpts into one row", () => {
    const onExcerptsChange = vi.fn();
    render(
      <ExcerptReviewList
        brandId="corvo"
        documentName="paper.pdf"
        excerpts={[
          { text: "First thought.", provenance: "p.1", unusable: false },
          { text: "Second thought.", provenance: "p.1", unusable: false },
          { text: "Third thought.", provenance: "p.2", unusable: false },
        ]}
        editable
        onExcerptsChange={onExcerptsChange}
      />
    );

    // The list starts with every usable row checked — merge directly.
    fireEvent.click(screen.getByTestId("merge-selected"));

    expect(onExcerptsChange).toHaveBeenCalledTimes(1);
    const next = onExcerptsChange.mock.calls[0][0];
    expect(next).toHaveLength(1);
    expect(next[0]).toMatchObject({
      text: "First thought.\n\nSecond thought.\n\nThird thought.",
      provenance: "p.1",
      unusable: false,
    });
  });

  it("rejects a merge across a gap with an inline error", () => {
    const onExcerptsChange = vi.fn();
    render(
      <ExcerptReviewList
        brandId="corvo"
        documentName="paper.pdf"
        excerpts={[
          { text: "First thought.", provenance: "p.1", unusable: false },
          { text: "Mangled table.", provenance: "p.2", unusable: true },
          { text: "Third thought.", provenance: "p.3", unusable: false },
        ]}
        editable
        onExcerptsChange={onExcerptsChange}
      />
    );

    // Only rows 1 and 3 are checkable (row 2 is hard-blocked), so merging
    // with a gap in between must refuse rather than swallow the excluded row.
    fireEvent.click(screen.getByTestId("merge-selected"));
    expect(screen.getByRole("alert").textContent).toContain("consecutive");
    expect(onExcerptsChange).not.toHaveBeenCalled();
  });

  it("remaps selection after an edit so nothing attaches to the wrong row", () => {
    const onExcerptsChange = vi.fn();
    const onSelectionChange = vi.fn();
    render(
      <ExcerptReviewList
        brandId="corvo"
        documentName="paper.pdf"
        excerpts={[
          { text: "Alpha.", provenance: "p.1", unusable: false },
          { text: "Beta.", provenance: "p.2", unusable: false },
          { text: "Gamma.", provenance: "p.3", unusable: false },
        ]}
        editable
        onExcerptsChange={onExcerptsChange}
        onSelectionChange={onSelectionChange}
      />
    );

    // Uncheck Alpha, then split Beta into two. Alpha must stay unchecked,
    // both Beta parts start checked, and Gamma's checked state shifts from
    // index 2 to index 3 — a naive index-keyed reset would lose that.
    fireEvent.click(screen.getByLabelText("Include excerpt 1"));

    const betaRow = screen
      .getByLabelText("Include excerpt 2")
      .closest("[data-excerpt]") as HTMLElement;
    const splitButton = Array.from(betaRow.querySelectorAll("button")).find(
      (candidate) => candidate.textContent === "Split"
    )!;
    fireEvent.click(splitButton);
    const editor = screen.getByLabelText("Split editor for excerpt 2");
    fireEvent.change(editor, { target: { value: "Beta one.\n\nBeta two." } });
    fireEvent.click(screen.getByText("Split into 2 excerpts"));

    expect(onExcerptsChange).toHaveBeenCalledTimes(1);
    const next = onExcerptsChange.mock.calls[0][0];
    expect(next).toHaveLength(4);
    expect(next.map((excerpt: ReviewedExcerpt) => excerpt.text)).toEqual([
      "Alpha.",
      "Beta one.",
      "Beta two.",
      "Gamma.",
    ]);
    expect(onSelectionChange).toHaveBeenLastCalledWith([1, 2, 3]);
  });
});
