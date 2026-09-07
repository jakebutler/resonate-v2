import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CampaignSession } from "@/components/campaigns/CampaignSession";
import { useMutation, useQuery } from "convex/react";

vi.mock("convex/react", () => ({
  useMutation: vi.fn(),
  useQuery: vi.fn(),
}));

vi.mock("@/convex/_generated/api", () => ({
  api: {
    campaigns: {
      getCampaignSession: "campaigns:getCampaignSession",
      suggestIdeas: "campaigns:suggestIdeas",
      addIdeaToCampaign: "campaigns:addIdeaToCampaign",
      removeIdeaFromCampaign: "campaigns:removeIdeaFromCampaign",
      rejectIdea: "campaigns:rejectIdea",
      undoIdeaRejection: "campaigns:undoIdeaRejection",
      searchSessionIdeas: "campaigns:searchSessionIdeas",
    },
  },
}));

const useQueryMock = vi.mocked(useQuery);
const useMutationMock = vi.mocked(useMutation);

const CORPUS_ID = "corpus_ab12";
const IDEA_A = {
  _id: "idea_a",
  title: "Pattern worth naming",
  text: "The corpus leads with a claim worth anchoring on.",
  flavor: "insight" as const,
  excerptCitations: [`corpus://corvo/${CORPUS_ID}#excerpt-1`],
  campaignHints: [],
};

const sessionData = {
  campaign: { _id: "campaign_1", title: "Reasoning + acting", brandId: "corvo", status: "active" },
  brief: null,
  corpora: [
    {
      corpus: { _id: CORPUS_ID, version: 1 },
      excerpts: [
        { seq: 1, text: "We explore reasoning traces and actions interleaved.", provenance: "p.1 · Abstract" },
      ],
    },
  ],
  suggested: [{ join: { state: "suggested" }, idea: IDEA_A }],
  workingSet: [],
  rejected: [],
  acceptedShape: null,
};

describe("CampaignSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useQueryMock.mockImplementation((reference: unknown) => {
      if (reference === "campaigns:getCampaignSession") return sessionData;
      if (reference === "campaigns:searchSessionIdeas") {
        return [
          {
            idea: {
              _id: "idea_inbox",
              text: "Could a weekly review digest replace standup for the content team?",
              flavor: "thought" as const,
              excerptCitations: [],
            },
            state: null,
          },
        ];
      }
      return undefined;
    });
    useMutationMock.mockReturnValue(vi.fn().mockResolvedValue({ created: 0, added: true, removed: true }));
  });

  it("renders the three session panels with corpus excerpts and provenance", () => {
    render(<CampaignSession campaignId="campaign_1" />);
    expect(screen.getByText("Reasoning + acting")).toBeDefined();
    expect(screen.getByText("Corpus & excerpts")).toBeDefined();
    expect(screen.getByText("p.1 · Abstract")).toBeDefined();
    expect(screen.getByText("Campaign working set")).toBeDefined();
    expect(screen.getByTestId("working-count").textContent).toContain("0 ideas");
  });

  it("gates suggestion generation behind an explicit mock-mode acknowledgment", async () => {
    const suggestIdeas = vi.fn().mockResolvedValue({ created: 5 });
    useMutationMock.mockImplementation(((reference: unknown) =>
      reference === "campaigns:suggestIdeas" ? suggestIdeas : vi.fn()
    ) as never);

    render(<CampaignSession campaignId="campaign_1" />);
    fireEvent.click(screen.getByTestId("suggest-ideas"));
    expect(await screen.findByTestId("mock-confirm")).toBeDefined();
    expect(screen.getByTestId("mock-confirm").textContent).toContain("mock mode");

    fireEvent.click(screen.getByText("Run in mock mode"));
    await waitFor(() => {
      expect(suggestIdeas).toHaveBeenCalledWith({
        campaignId: "campaign_1",
        mockAcknowledged: true,
      });
    });
  });

  it("renders idea flavors with citation chips that reveal excerpt text", () => {
    render(<CampaignSession campaignId="campaign_1" />);
    expect(screen.getByText("insight")).toBeDefined();
    const chip = screen.getByRole("button", { name: /①1/ });
    fireEvent.click(chip);
    expect(screen.getByRole("tooltip").textContent).toContain(
      "reasoning traces and actions interleaved"
    );
    expect(screen.getByRole("tooltip").textContent).toContain("corpus://corvo/");
  });

  it("adds a suggested idea to the working set with sticky toast", async () => {
    const addIdea = vi.fn().mockResolvedValue({ added: true });
    useMutationMock.mockImplementation(((reference: unknown) =>
      reference === "campaigns:addIdeaToCampaign" ? addIdea : vi.fn()
    ) as never);

    render(<CampaignSession campaignId="campaign_1" />);
    const suggestedCard = screen.getByText("The corpus leads with a claim worth anchoring on.").closest("div[data-idea]") as HTMLElement;
    fireEvent.click(within(suggestedCard).getByText("Add to campaign"));
    await waitFor(() => {
      expect(addIdea).toHaveBeenCalled();
    });
    expect(await screen.findByTestId("session-toast").then((el) => el.textContent)).toContain(
      "campaign-primary"
    );
  });

  it("searches the research inbox with results adjacent to the search input", () => {
    render(<CampaignSession campaignId="campaign_1" />);
    const input = screen.getByLabelText("Search your inbox");
    expect(input.getAttribute("placeholder")).toContain("Search your inbox");
    expect(screen.getByTestId("inbox-results").textContent).toContain(
      "weekly review digest"
    );
  });

  it("shows the one-way membership rule in the working set panel", () => {
    render(<CampaignSession campaignId="campaign_1" />);
    expect(screen.getByText(/one-way/i)).toBeDefined();
  });

  it("renders a not-found state for a missing campaign", () => {
    useQueryMock.mockImplementation((reference: unknown) => {
      if (reference === "campaigns:getCampaignSession") return null;
      if (reference === "campaigns:searchSessionIdeas") return [];
      return undefined;
    });
    render(<CampaignSession campaignId="missing" />);
    expect(screen.getByText("Campaign not found.")).toBeDefined();
  });
});
