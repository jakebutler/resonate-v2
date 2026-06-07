import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ResearchApp } from "@/components/ResearchApp";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import type { Id } from "@/convex/_generated/dataModel";

vi.mock("convex/react", () => ({
  useConvexAuth: vi.fn(),
  useMutation: vi.fn(),
  useQuery: vi.fn(),
}));

vi.mock("@/convex/_generated/api", () => ({
  api: {
    ideas: {
      list: "ideas:list",
      getById: "ideas:getById",
      findByNormalizedSourceUrl: "ideas:findByNormalizedSourceUrl",
      create: "ideas:create",
      appendEntry: "ideas:appendEntry",
      updateMeta: "ideas:updateMeta",
    },
    publishing: {
      listPosts: "publishing:listPosts",
      createVariantPost: "publishing:createVariantPost",
      acceptVariantPost: "publishing:acceptVariantPost",
      rejectVariantPost: "publishing:rejectVariantPost",
    },
    research: {
      saveResearchBrief: "research:saveResearchBrief",
      saveClaimMap: "research:saveClaimMap",
      saveEditorialOutline: "research:saveEditorialOutline",
      saveLongFormDraft: "research:saveLongFormDraft",
      reviewSource: "research:reviewSource",
      reviewClaim: "research:reviewClaim",
    },
  },
}));

const IDEA_ID = "idea_test_1" as Id<"capturedIdeas">;
const VARIANT_POST_ID = "post_variant_1" as Id<"v2Posts">;

const createIdeaMock = vi.fn();
const appendIdeaEntryMock = vi.fn();
const updateIdeaMetaMock = vi.fn().mockResolvedValue(undefined);
const createVariantPostMock = vi.fn();
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

let ideasList: Array<{
  _id: Id<"capturedIdeas">;
  brandId: "corvo";
  sourceTitle?: string;
  latestEntryPreview: string;
  sourceUrl?: string;
  normalizedSourceUrl?: string;
  tags: string[];
  status: "inbox";
  lastCapturedAt: number;
  updatedAt: number;
  createdAt: number;
}> = [];

let selectedIdeaDetail:
  | {
      _id: Id<"capturedIdeas">;
      brandId: "corvo";
      sourceTitle?: string;
      latestEntryPreview: string;
      sourceUrl?: string;
      normalizedSourceUrl?: string;
      tags: string[];
      status: "inbox";
      createdAt: number;
      updatedAt: number;
      entries: Array<{
        _id: Id<"capturedIdeaEntries">;
        content: string;
        createdAt: number;
      }>;
      legacyPostLinks: [];
      postLinks: Array<{
        link: { postId: Id<"v2Posts"> };
        post: {
          _id: Id<"v2Posts">;
          channelId: "corvo-blog";
          content: string;
          variantReviewStatus?: "pending" | "accepted" | "rejected";
        };
      }>;
    }
  | undefined;

let persistedPosts: Array<{
  _id: Id<"v2Posts">;
  brandId: "corvo";
  channelId: "corvo-blog";
  sourceIdeaId?: string;
  title: string;
  content: string;
  status: "draft" | "scheduled";
  variantReviewStatus?: "pending" | "accepted" | "rejected";
  createdAt: number;
  updatedAt: number;
}> = [];

function mockFetch() {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = input.toString();

    if (url.endsWith("/api/generate-draft")) {
      return new Response(
        JSON.stringify({
          provider: "mock",
          draft: "LinkedIn-ready variant from the Corvo Labs idea.",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    if (url.endsWith("/api/research-brief")) {
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

    if (url.endsWith("/api/claim-map")) {
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

    if (url.endsWith("/api/editorial-outline")) {
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

    if (url.endsWith("/api/long-form-draft")) {
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

describe("ResearchApp", () => {
  beforeEach(() => {
    window.localStorage.clear();
    ideasList = [];
    selectedIdeaDetail = undefined;
    persistedPosts = [];
    vi.stubGlobal("fetch", mockFetch());
    vi.spyOn(Storage.prototype, "setItem");

    createIdeaMock.mockReset();
    appendIdeaEntryMock.mockReset();
    updateIdeaMetaMock.mockReset();
    createVariantPostMock.mockReset();
    saveResearchBriefMock.mockClear();
    saveClaimMapMock.mockClear();
    saveEditorialOutlineMock.mockClear();
    saveLongFormDraftMock.mockClear();
    reviewSourceMock.mockClear();
    reviewClaimMock.mockClear();

    createIdeaMock.mockImplementation(async () => {
      const now = Date.now();
      const idea = {
        _id: IDEA_ID,
        brandId: "corvo" as const,
        sourceTitle: "Test evaluation idea",
        latestEntryPreview: "Turn the review artifact into a publishing workflow.",
        tags: [] as string[],
        status: "inbox" as const,
        lastCapturedAt: now,
        updatedAt: now,
        createdAt: now,
      };
      ideasList = [idea];
      selectedIdeaDetail = {
        ...idea,
        entries: [
          {
            _id: "entry_1" as Id<"capturedIdeaEntries">,
            content: "Turn the review artifact into a publishing workflow.",
            createdAt: now,
          },
        ],
        legacyPostLinks: [],
        postLinks: [],
      };
      return IDEA_ID;
    });

    createVariantPostMock.mockImplementation(async () => {
      const now = Date.now();
      selectedIdeaDetail = {
        ...selectedIdeaDetail!,
        postLinks: [
          {
            link: { postId: VARIANT_POST_ID },
            post: {
              _id: VARIANT_POST_ID,
              channelId: "corvo-blog",
              content: "LinkedIn-ready variant from the Corvo Labs idea.",
              variantReviewStatus: "pending",
            },
          },
        ],
      };
      return { postId: VARIANT_POST_ID, intentId: "intent_1" };
    });

    vi.mocked(useConvexAuth).mockReturnValue({
      isLoading: false,
      isAuthenticated: true,
    });

    vi.mocked(useQuery).mockImplementation((reference) => {
      if (reference === "ideas:list") return ideasList;
      if (reference === "ideas:getById") return selectedIdeaDetail;
      if (reference === "ideas:findByNormalizedSourceUrl") return [];
      if (reference === "publishing:listPosts") return persistedPosts;
      return undefined;
    });

    vi.mocked(useMutation).mockImplementation((reference) => {
      if (reference === "ideas:create") return createIdeaMock;
      if (reference === "ideas:appendEntry") return appendIdeaEntryMock;
      if (reference === "ideas:updateMeta") return updateIdeaMetaMock;
      if (reference === "publishing:createVariantPost") return createVariantPostMock;
      if (reference === "research:saveResearchBrief") return saveResearchBriefMock;
      if (reference === "research:saveClaimMap") return saveClaimMapMock;
      if (reference === "research:saveEditorialOutline") return saveEditorialOutlineMock;
      if (reference === "research:saveLongFormDraft") return saveLongFormDraftMock;
      if (reference === "research:reviewSource") return reviewSourceMock;
      if (reference === "research:reviewClaim") return reviewClaimMock;
      throw new Error(`Unexpected mutation reference: ${String(reference)}`);
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("renders Capture, Ideas, and Research tabs", () => {
    render(<ResearchApp />);

    expect(screen.getByRole("tab", { name: "Capture" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Ideas" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Research" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Capture an idea" })).toBeInTheDocument();
    expect(screen.queryByText("Drafts and Publishing Handoff")).not.toBeInTheDocument();
  });

  it("captures an idea, switches to Ideas, generates a variant, and links to review", async () => {
    render(<ResearchApp />);

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

    await waitFor(() => {
      expect(createIdeaMock).toHaveBeenCalledWith(
        expect.objectContaining({
          brandId: "corvo",
          content: "Turn the review artifact into a publishing workflow.",
          sourceTitle: "Test evaluation idea",
        })
      );
    });
    expect(screen.getByText("Captured a new Idea.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Draft from this idea" })).toBeInTheDocument();
    expect(Storage.prototype.setItem).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Draft from this idea" }));
    expect(screen.getByRole("heading", { name: "Selected idea" })).toBeInTheDocument();

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

    await screen.findByText("LinkedIn-ready variant from the Corvo Labs idea.");
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        "/api/generate-draft",
        expect.objectContaining({
          body: expect.stringContaining("clarifyingAnswers"),
        })
      )
    );
    await waitFor(() =>
      expect(createVariantPostMock).toHaveBeenCalledWith(
        expect.objectContaining({
          ideaId: IDEA_ID,
          brandId: "corvo",
          channelId: "corvo-blog",
          title: "Test evaluation idea",
          content: "LinkedIn-ready variant from the Corvo Labs idea.",
        })
      )
    );

    const reviewLink = screen.getByRole("link", { name: "Review" });
    expect(reviewLink).toHaveAttribute("href", `/research/review/${VARIANT_POST_ID}`);
    expect(Storage.prototype.setItem).not.toHaveBeenCalled();
  });

  it("runs source discovery and produces a reviewable claim map from accepted sources", async () => {
    render(<ResearchApp initialTab="research" />);

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
    render(<ResearchApp initialTab="research" />);

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
