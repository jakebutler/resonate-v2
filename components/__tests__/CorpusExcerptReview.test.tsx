import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CorpusExcerptReview } from "@/components/campaigns/CorpusExcerptReview";
import { useMutation, useQuery } from "convex/react";

vi.mock("convex/react", () => ({
  useMutation: vi.fn(),
  useQuery: vi.fn(),
}));

vi.mock("@/convex/_generated/api", () => ({
  api: {
    corpora: {
      getCorpus: "corpora:getCorpus",
      updateExcerptReview: "corpora:updateExcerptReview",
    },
  },
}));

const useQueryMock = vi.mocked(useQuery);
const useMutationMock = vi.mocked(useMutation);

const corpusDetail = {
  corpus: { _id: "corpus_1", version: 1, brandId: "lower-db" },
  documents: [{ _id: "doc_1", name: "2026-05-26-cohesion-gate.md", kind: "md" }],
  excerpts: [
    {
      _id: "ex_1",
      seq: 1,
      text: "A batch of posts derived from one source reads as five strangers.",
      provenance: "2026-05-26 · hypothesis",
      sensitivity: "unreviewed",
      reviewState: "accepted",
    },
    {
      _id: "ex_2",
      seq: 2,
      text: "34.2 | 35.1 mangled table",
      provenance: "2026-05-26 · table",
      sensitivity: "unreviewed",
      reviewState: "excluded",
    },
  ],
};

describe("CorpusExcerptReview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useQueryMock.mockImplementation((reference: unknown) => {
      if (reference === "corpora:getCorpus") return corpusDetail;
      return undefined;
    });
    useMutationMock.mockReturnValue(vi.fn().mockResolvedValue({ updated: true }));
  });

  it("renders imported excerpts with sensitivity and included state", () => {
    render(<CorpusExcerptReview brandId="lower-db" corpusId="corpus_1" />);
    expect(screen.getByText("#1")).toBeDefined();
    expect(screen.getByText(/hypothesis/)).toBeDefined();
    const included = screen.getByLabelText("Include excerpt 1") as HTMLInputElement;
    expect(included.checked).toBe(true);
    const excluded = screen.getByLabelText("Include excerpt 2") as HTMLInputElement;
    expect(excluded.checked).toBe(false);
  });

  it("excludes an excerpt through the review mutation", async () => {
    const update = vi.fn().mockResolvedValue({ updated: true });
    useMutationMock.mockImplementation(((reference: unknown) =>
      reference === "corpora:updateExcerptReview" ? update : vi.fn()) as never);

    render(<CorpusExcerptReview brandId="lower-db" corpusId="corpus_1" />);
    fireEvent.click(screen.getByLabelText("Include excerpt 1"));
    await waitFor(() => {
      expect(update).toHaveBeenCalledWith({
        excerptId: "ex_1",
        reviewState: "excluded",
      });
    });
  });
});
