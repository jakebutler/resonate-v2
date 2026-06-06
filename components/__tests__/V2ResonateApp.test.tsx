import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { V2ResonateApp } from "@/components/V2ResonateApp";
import { useMutation } from "convex/react";

vi.mock("convex/react", () => ({
  useMutation: vi.fn(),
}));

vi.mock("@/convex/_generated/api", () => ({
  api: {
    v2Publishing: {
      createPostWithIntent: "v2Publishing:createPostWithIntent",
    },
    v2Research: {
      saveResearchBrief: "v2Research:saveResearchBrief",
      saveClaimMap: "v2Research:saveClaimMap",
      saveEditorialOutline: "v2Research:saveEditorialOutline",
      saveLongFormDraft: "v2Research:saveLongFormDraft",
      reviewSource: "v2Research:reviewSource",
      reviewClaim: "v2Research:reviewClaim",
    },
  },
}));

const createPostWithIntentMock = vi.fn().mockResolvedValue({
  postId: "persisted_post_1",
  intentId: "persisted_intent_1",
});
const saveResearchBriefMock = vi.fn().mockResolvedValue({
  researchBriefId: "persisted_brief_1",
  sourceCount: 1,
});
const saveClaimMapMock = vi.fn().mockResolvedValue({
  claimMapId: "persisted_claim_map_1",
  claimCount: 1,
});
const saveEditorialOutlineMock = vi.fn().mockResolvedValue({
  outlineId: "persisted_outline_1",
  sectionCount: 1,
});
const saveLongFormDraftMock = vi.fn().mockResolvedValue({
  draftId: "persisted_draft_1",
  markdownLength: 42,
});
const reviewSourceMock = vi.fn().mockResolvedValue(undefined);
const reviewClaimMock = vi.fn().mockResolvedValue(undefined);

function mockFetch() {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = input.toString();

    if (url.endsWith("/api/v2/generate-draft")) {
      return new Response(
        JSON.stringify({
          provider: "mock",
          draft: "LinkedIn-ready variant from the Corvo Labs idea.",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    if (url.endsWith("/api/v2/research-brief")) {
      return new Response(
        JSON.stringify({
          provider: "mock",
          sources: [
            {
              id: "source-1",
              title: "STEP 4 semaglutide extension",
              url: "https://example.com/step-4",
              publisher: "JAMA",
              evidenceLabel: "peer_reviewed_trial",
              quality: {
                rating: "strong",
                rationale: "Randomized controlled trial.",
                limitations: ["Narrow population"],
              },
              status: "unvetted",
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    if (url.endsWith("/api/v2/claim-map")) {
      return new Response(
        JSON.stringify({
          provider: "mock",
          claims: [
            {
              id: "claim-1",
              text: "Stopping semaglutide is associated with clinically meaningful weight regain.",
              evidenceLabel: "peer_reviewed_trial",
              confidence: "high",
              strength: "strong",
              caveats: "Trial population may not generalize to every patient.",
              sourceIds: ["source-1"],
              reviewerNotes: "",
              status: "unreviewed",
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    if (url.endsWith("/api/v2/editorial-outline")) {
      return new Response(
        JSON.stringify({
          provider: "mock",
          outline: {
            id: "outline-1",
            claimMapId: "claim-map-1",
            brandId: "freshproof",
            thesis: "Weight regain after GLP-1 discontinuation needs recent real-world evidence.",
            status: "draft",
            createdAt: "2026-06-05T00:00:00.000Z",
            updatedAt: "2026-06-05T00:00:00.000Z",
            sections: [
              {
                heading: "Clinical practice after discontinuation",
                notes: "Use real-world cohort evidence before older background sources.",
                claimIds: ["claim-1"],
                evidenceLabels: ["primary-source"],
              },
            ],
            takeawayTable: [
              {
                finding: "Many patients restart or switch obesity treatments after stopping therapy.",
                evidenceLabel: "primary-source",
                source: {
                  primarySources: ["Gasoyan et al. 2026"],
                  secondarySources: ["Cleveland Clinic summary"],
                  citationStrategy: "Lead with the DOI/PubMed record.",
                },
              },
            ],
            citationPlan: {
              primarySources: ["Gasoyan et al. 2026", "STEP 4 extension"],
              citationStyle: "Markdown footnotes",
              evidenceHierarchy: "Primary cohort and RCT evidence first",
              caveatsHandling: "Separate real-world variability from RCT regain averages",
            },
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    if (url.endsWith("/api/v2/long-form-draft")) {
      return new Response(
        JSON.stringify({
          provider: "mock",
          draft:
            "# GLP-1 discontinuation workflow\n\nUse primary evidence before scheduling this long-form draft.",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify({}), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });
}

describe("V2ResonateApp", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.stubGlobal("fetch", mockFetch());
    createPostWithIntentMock.mockClear();
    saveResearchBriefMock.mockClear();
    saveClaimMapMock.mockClear();
    saveEditorialOutlineMock.mockClear();
    saveLongFormDraftMock.mockClear();
    reviewSourceMock.mockClear();
    reviewClaimMock.mockClear();
    vi.mocked(useMutation).mockImplementation((reference) => {
      if (reference === "v2Publishing:createPostWithIntent") {
        return createPostWithIntentMock;
      }
      if (reference === "v2Research:saveResearchBrief") {
        return saveResearchBriefMock;
      }
      if (reference === "v2Research:saveClaimMap") {
        return saveClaimMapMock;
      }
      if (reference === "v2Research:saveEditorialOutline") {
        return saveEditorialOutlineMock;
      }
      if (reference === "v2Research:saveLongFormDraft") {
        return saveLongFormDraftMock;
      }
      if (reference === "v2Research:reviewSource") {
        return reviewSourceMock;
      }
      if (reference === "v2Research:reviewClaim") {
        return reviewClaimMock;
      }
      throw new Error(`Unexpected mutation reference: ${String(reference)}`);
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("captures an idea, generates a draft variant, and accepts it into drafts", async () => {
    render(<V2ResonateApp />);

    fireEvent.click(screen.getByRole("button", { name: "Capture Idea" }));
    expect(screen.getByText("Add a note before capturing an Idea.")).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("Idea title"), {
      target: { value: "Test evaluation idea" },
    });
    fireEvent.change(
      screen.getByPlaceholderText("Capture the thought. The note is the atomic value."),
      { target: { value: "Turn the review artifact into a publishing workflow." } }
    );
    fireEvent.click(screen.getByRole("button", { name: "Capture Idea" }));

    expect(screen.getByText("Captured a new Idea.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Generate Draft" }));

    expect(
      screen.getByText("Answer the clarifying questions before generating drafts.")
    ).toBeInTheDocument();
    fireEvent.change(
      screen.getByLabelText("What is the central point this draft must make?"),
      { target: { value: "Teams need reviewable artifacts before they trust AI workflows." } }
    );
    fireEvent.change(
      screen.getByLabelText("Is there a source, example, or prior post this draft should reference?"),
      { target: { value: "Use the FreshProof review pack as the concrete example." } }
    );
    fireEvent.change(
      screen.getByLabelText("What concrete operator takeaway should the Corvo Blog version leave with the reader?"),
      { target: { value: "Instrument the handoff before expanding channels." } }
    );

    fireEvent.click(screen.getByRole("button", { name: "Generate Draft" }));

    const variant = await screen.findByText("LinkedIn-ready variant from the Corvo Labs idea.");
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        "/api/v2/generate-draft",
        expect.objectContaining({
          body: expect.stringContaining("clarifyingAnswers"),
        })
      )
    );
    const variantCard = variant.closest("div");
    expect(variantCard).not.toBeNull();
    fireEvent.click(within(variantCard!).getByRole("button", { name: "Accept" }));

    await waitFor(() => {
      expect(screen.getByText("Accepted \u2192 Post")).toBeInTheDocument();
    });
    await waitFor(() =>
      expect(createPostWithIntentMock).toHaveBeenCalledWith(
        expect.objectContaining({
          brandId: "corvo",
          channelId: "corvo-blog",
          title: "Test evaluation idea",
          content: "LinkedIn-ready variant from the Corvo Labs idea.",
          scheduledDate: expect.any(String),
          scheduledTime: "09:00",
          timezone: "America/Los_Angeles",
          sourceIdeaId: expect.stringMatching(/^idea-/),
        })
      )
    );
    expect(
      await screen.findByText(
        "Accepted variant and created a persisted scheduled-but-unapproved publishing intent."
      )
    ).toBeInTheDocument();
    expect(screen.getByText("Drafts and Publishing Handoff")).toBeInTheDocument();
  });

  it("runs source discovery and produces a reviewable claim map from accepted sources", async () => {
    render(<V2ResonateApp />);

    fireEvent.click(screen.getByRole("button", { name: "Run Source Discovery" }));
    await screen.findByText("STEP 4 semaglutide extension");
    await waitFor(() =>
      expect(saveResearchBriefMock).toHaveBeenCalledWith(
        expect.objectContaining({
          brandId: "corvo",
          provider: "mock",
          sources: [
            expect.objectContaining({
              id: "source-1",
              title: "STEP 4 semaglutide extension",
              raw: expect.objectContaining({ id: "source-1" }),
            }),
          ],
        })
      )
    );

    fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    await waitFor(() =>
      expect(reviewSourceMock).toHaveBeenCalledWith({
        researchBriefId: "persisted_brief_1",
        sourceId: "source-1",
        status: "accepted",
        reviewerNotes: undefined,
      })
    );
    fireEvent.click(screen.getByRole("button", { name: "Generate Claim Map" }));

    await screen.findByText(
      "Stopping semaglutide is associated with clinically meaningful weight regain."
    );
    await waitFor(() =>
      expect(saveClaimMapMock).toHaveBeenCalledWith(
        expect.objectContaining({
          brandId: "corvo",
          provider: "mock",
          researchBriefId: "persisted_brief_1",
          claims: [
            expect.objectContaining({
              id: "claim-1",
              text: "Stopping semaglutide is associated with clinically meaningful weight regain.",
              raw: expect.objectContaining({ id: "claim-1" }),
            }),
          ],
        })
      )
    );
    expect(screen.getByText("confidence: high")).toBeInTheDocument();
    expect(screen.getByText("1 source")).toBeInTheDocument();
  });

  it("renders an editorial outline even when provider takeaway sources are object-shaped", async () => {
    render(<V2ResonateApp />);

    fireEvent.click(screen.getByRole("button", { name: "Run Source Discovery" }));
    await screen.findByText("STEP 4 semaglutide extension");

    fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    fireEvent.click(screen.getByRole("button", { name: "Generate Claim Map" }));

    const claim = await screen.findByText(
      "Stopping semaglutide is associated with clinically meaningful weight regain."
    );
    expect(claim).toBeInTheDocument();
    const claimReviewButtons = screen.getAllByRole("button", { name: "Accept" });
    fireEvent.click(claimReviewButtons[claimReviewButtons.length - 1]);
    await waitFor(() =>
      expect(reviewClaimMock).toHaveBeenCalledWith({
        claimMapId: "persisted_claim_map_1",
        claimId: "claim-1",
        status: "accepted",
        reviewerNotes: undefined,
      })
    );

    const outlineButton = await screen.findByRole("button", { name: "Generate Editorial Outline" });
    await waitFor(() => expect(outlineButton).not.toBeDisabled());
    fireEvent.click(outlineButton);

    expect(await screen.findByText(/Clinical practice after discontinuation/)).toBeInTheDocument();
    expect(screen.getAllByText(/Gasoyan et al\. 2026/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Lead with the DOI\/PubMed record/)).toBeInTheDocument();
    expect(screen.getByText(/Markdown footnotes/)).toBeInTheDocument();
    expect(screen.getByText(/Separate real-world variability/)).toBeInTheDocument();
    await waitFor(() =>
      expect(saveEditorialOutlineMock).toHaveBeenCalledWith(
        expect.objectContaining({
          localOutlineId: "outline-1",
          localClaimMapId: expect.stringMatching(/^cmap-/),
          claimMapId: "persisted_claim_map_1",
          brandId: "freshproof",
          thesis: "Weight regain after GLP-1 discontinuation needs recent real-world evidence.",
          sections: [
            expect.objectContaining({
              heading: "Clinical practice after discontinuation",
              notes: "Use real-world cohort evidence before older background sources.",
              claimIds: ["claim-1"],
              evidenceLabels: ["primary-source"],
            }),
          ],
          takeawayTable: [
            expect.objectContaining({
              finding: "Many patients restart or switch obesity treatments after stopping therapy.",
              evidenceLabel: "primary-source",
              source: expect.stringContaining("Gasoyan et al. 2026"),
            }),
          ],
          citationPlan: expect.stringContaining("Markdown footnotes"),
          status: "draft",
          provider: "mock",
          raw: expect.objectContaining({ id: "outline-1" }),
        })
      )
    );

    fireEvent.click(
      await screen.findByRole("button", { name: "Approve & Generate Long-form Draft" })
    );

    expect(
      await screen.findByText(/Use primary evidence before scheduling this long-form draft/)
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(saveLongFormDraftMock).toHaveBeenCalledWith(
        expect.objectContaining({
          outlineId: "persisted_outline_1",
          localOutlineId: "outline-1",
          claimMapId: "persisted_claim_map_1",
          localClaimMapId: expect.stringMatching(/^cmap-/),
          brandId: "corvo",
          markdown: expect.stringContaining("# GLP-1 discontinuation workflow"),
          provider: "mock",
          acceptedClaimIds: ["claim-1"],
          raw: expect.objectContaining({
            draft: expect.stringContaining("# GLP-1 discontinuation workflow"),
          }),
        })
      )
    );
  });
});
