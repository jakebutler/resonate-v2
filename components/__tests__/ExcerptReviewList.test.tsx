import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ExcerptReviewList } from "@/components/campaigns/ExcerptReviewList";
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
    expect(
      (combo.closest("span") as HTMLElement).className
    ).not.toContain("pointer-events-none");

    fireEvent.click(usable);
    expect(
      (combo.closest("span") as HTMLElement).className
    ).toContain("pointer-events-none");
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
});
