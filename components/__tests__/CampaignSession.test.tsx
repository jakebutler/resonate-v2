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
    corpora: {
      listCorpora: "corpora:listCorpora",
    },
    mockAck: {
      requestMockAcknowledgment: "mockAck:requestMockAcknowledgment",
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
  campaign: {
    _id: "campaign_1",
    title: "Reasoning + acting",
    brandId: "corvo",
    status: "active",
    corpusIds: [CORPUS_ID],
  },
  brief: null,
  corpora: [
    {
      corpus: { _id: CORPUS_ID, version: 1 },
      excerptCount: 1,
    },
  ],
  citedExcerpts: [
    {
      _id: "excerpt_1",
      corpusId: CORPUS_ID,
      seq: 1,
      text: "We explore reasoning traces and actions interleaved.",
      provenance: "p.1 · Abstract",
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
      if (reference === "corpora:listCorpora") {
        return [
          { _id: CORPUS_ID, brandId: "corvo", origin: "upload", version: 1, createdAt: 0 },
        ];
      }
      return undefined;
    });
    useMutationMock.mockReturnValue(vi.fn().mockResolvedValue({ created: 0, added: true, removed: true }));
  });

  it("renders the three session panels with a per-corpus excerpt browser", () => {
    render(<CampaignSession campaignId="campaign_1" />);
    expect(screen.getByText("Reasoning + acting")).toBeDefined();
    expect(screen.getByText("Corpus & excerpts")).toBeDefined();
    expect(screen.getByText("Corpus v1 — 1 excerpt")).toBeDefined();
    expect(screen.getByText("Campaign working set")).toBeDefined();
    expect(screen.getByTestId("working-count").textContent).toContain("0 ideas");
  });

  it("gates suggestion generation behind an explicit mock-mode acknowledgment", async () => {
    const requestMockAcknowledgment = vi
      .fn()
      .mockResolvedValue({ token: "server-issued-token", expiresAt: Date.now() + 60000 });
    const suggestIdeas = vi.fn().mockResolvedValue({ created: 5 });
    useMutationMock.mockImplementation(((reference: unknown) =>
      reference === "mockAck:requestMockAcknowledgment"
        ? requestMockAcknowledgment
        : reference === "campaigns:suggestIdeas"
          ? suggestIdeas
          : vi.fn()) as never);

    render(<CampaignSession campaignId="campaign_1" />);
    fireEvent.click(screen.getByTestId("suggest-ideas"));
    expect(await screen.findByTestId("mock-confirm")).toBeDefined();
    expect(screen.getByTestId("mock-confirm").textContent).toContain("mock mode");

    fireEvent.click(screen.getByText("Run in mock mode"));
    await waitFor(() => {
      // D-21: the confirm dialog mints a server-issued token and the
      // suggestion runs against it — the client never asserts "acknowledged".
      expect(requestMockAcknowledgment).toHaveBeenCalledWith({
        campaignId: "campaign_1",
      });
      expect(suggestIdeas).toHaveBeenCalledWith({
        campaignId: "campaign_1",
        mockAckToken: "server-issued-token",
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

  it("keys citation chips by corpus and sequence so attached versions never collide (C1)", () => {
    // Two corpora, both numbering excerpts from seq 1. The chips must resolve
    // through corpusId:seq — a seq-only key silently overwrites corpus B's
    // excerpt with corpus A's.
    const corporaSession = {
      ...sessionData,
      corpora: [
        { corpus: { _id: "corpus_b", version: 2 }, excerptCount: 1 },
        { corpus: { _id: "corpus_a", version: 1 }, excerptCount: 1 },
      ],
      citedExcerpts: [
        {
          _id: "excerpt_b1",
          corpusId: "corpus_b",
          seq: 1,
          text: "Beta excerpt one: batch cohesion wins.",
          provenance: "b p.1",
        },
        {
          _id: "excerpt_a1",
          corpusId: "corpus_a",
          seq: 1,
          text: "Alpha excerpt one: interleaved reasoning.",
          provenance: "a p.1",
        },
      ],
      suggested: [
        {
          join: { state: "suggested" },
          idea: {
            ...IDEA_A,
            excerptCitations: ["corpus://corvo/corpus_b#excerpt-1"],
          },
        },
      ],
    };
    useQueryMock.mockImplementation((reference: unknown) => {
      if (reference === "campaigns:getCampaignSession") return corporaSession;
      if (reference === "campaigns:searchSessionIdeas") return [];
      return undefined;
    });

    render(<CampaignSession campaignId="campaign_1" />);
    const chip = screen.getByRole("button", { name: /①1/ });
    fireEvent.click(chip);
    // Corpus B appears first in the payload; a seq-only key would resolve
    // this chip to corpus A's "Alpha excerpt one".
    expect(screen.getByRole("tooltip").textContent).toContain(
      "Beta excerpt one: batch cohesion wins."
    );
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
      "working set"
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

  it("hints in-campaign membership beside the flavor, capped at one +N more (D-5)", () => {
    const hintedSession = {
      ...sessionData,
      suggested: [
        {
          join: { state: "suggested" },
          idea: {
            ...IDEA_A,
            campaignHints: [
              { campaignId: "campaign_9", campaignTitle: "Evergreen series" },
              { campaignId: "campaign_8", campaignTitle: "Launch week" },
            ],
          },
        },
        {
          join: { state: "suggested" },
          idea: {
            ...IDEA_A,
            _id: "idea_b",
            text: "A second idea that is in exactly one other campaign.",
            campaignHints: [
              { campaignId: "campaign_7", campaignTitle: "Solo campaign" },
            ],
          },
        },
      ],
    };
    useQueryMock.mockImplementation((reference: unknown) => {
      if (reference === "campaigns:getCampaignSession") return hintedSession;
      if (reference === "campaigns:searchSessionIdeas") return [];
      return undefined;
    });

    render(<CampaignSession campaignId="campaign_1" />);
    // Quiet text beside the flavor — no chip, no navigation, current campaign excluded.
    expect(screen.getAllByText(/already in/i)).toHaveLength(2);
    // Two hints cap at the first name plus "+N more".
    const cappedCard = screen
      .getByText("Evergreen series")
      .closest("[data-idea]") as HTMLElement;
    expect(within(cappedCard).getByText(/\+\d more/)).toBeDefined();
    // A single hint renders no "+N more" suffix.
    const soloCard = screen
      .getByText("Solo campaign")
      .closest("[data-idea]") as HTMLElement;
    expect(within(soloCard).queryByText(/\+\d more/)).toBeNull();
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
