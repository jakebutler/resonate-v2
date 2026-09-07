import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CampaignsHome } from "@/components/campaigns/CampaignsHome";
import { useMutation, useQuery } from "convex/react";

vi.mock("convex/react", () => ({
  useConvexAuth: vi.fn(() => ({ isLoading: false, isAuthenticated: true })),
  useMutation: vi.fn(),
  useQuery: vi.fn(),
}));

vi.mock("@/convex/_generated/api", () => ({
  api: {
    campaigns: {
      listCampaigns: "campaigns:listCampaigns",
      createCampaign: "campaigns:createCampaign",
    },
    corpora: {
      listCorpora: "corpora:listCorpora",
      createCorpusVersion: "corpora:createCorpusVersion",
      recordExcerptCorrection: "corpora:recordExcerptCorrection",
    },
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

const useQueryMock = vi.mocked(useQuery);
const useMutationMock = vi.mocked(useMutation);

const corpora = [
  {
    _id: "corpus_1",
    brandId: "corvo",
    origin: "upload",
    version: 1,
    createdAt: Date.parse("2026-09-01"),
  },
];

const campaigns = [
  {
    _id: "campaign_1",
    title: "Reasoning + acting for editorial pipelines",
    brandId: "corvo",
    status: "active",
    corpusIds: ["corpus_1"],
    updatedAt: Date.parse("2026-09-02"),
  },
  {
    _id: "campaign_other",
    title: "Lower dB campaign",
    brandId: "lower-db",
    status: "active",
    corpusIds: [],
    updatedAt: Date.parse("2026-09-02"),
  },
];

describe("CampaignsHome", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useQueryMock.mockImplementation((reference: unknown) => {
      if (reference === "campaigns:listCampaigns") return campaigns;
      if (reference === "corpora:listCorpora") return corpora;
      return undefined;
    });
    useMutationMock.mockReturnValue(vi.fn().mockResolvedValue({}));
  });

  it("renders corpora and campaigns for the active brand only", () => {
    render(<CampaignsHome />);
    expect(screen.getByText("Corvo Labs corpus · v1")).toBeDefined();
    expect(screen.getByText("Reasoning + acting for editorial pipelines")).toBeDefined();
    expect(screen.queryByText("Lower dB campaign")).toBeNull();
  });

  it("opens the title-only start campaign dialog and creates a campaign", async () => {
    const createCampaign = vi.fn().mockResolvedValue({ campaignId: "campaign_new" });
    useMutationMock.mockImplementation(((reference: unknown) =>
      reference === "campaigns:createCampaign"
        ? createCampaign
        : vi.fn().mockResolvedValue({})) as never);

    const originalHref = window.location.href;
    Object.defineProperty(window, "location", {
      writable: true,
      value: { href: originalHref },
    });

    render(<CampaignsHome />);
    fireEvent.click(screen.getByTestId("toggle-start-campaign"));
    const input = await screen.findByLabelText("Campaign title");
    fireEvent.change(input, { target: { value: "Eval-driven editorial" } });
    fireEvent.click(screen.getByTestId("confirm-start-campaign"));

    await waitFor(() => {
      expect(createCampaign).toHaveBeenCalledWith({
        brandId: "corvo",
        title: "Eval-driven editorial",
      });
    });
  });

  it("shows the ingest flow with upload dropzone and immutable-version hint", async () => {
    render(<CampaignsHome />);
    fireEvent.click(screen.getByTestId("toggle-ingest"));
    expect(await screen.findByTestId("upload-dropzone")).toBeDefined();
    expect(screen.getByText(/immutable corpus version \(v2\)/)).toBeDefined();
  });

  it("jumps to the next corpus version after ingest", () => {
    useQueryMock.mockImplementation((reference: unknown) => {
      if (reference === "campaigns:listCampaigns") return campaigns;
      if (reference === "corpora:listCorpora")
        return [
          { ...corpora[0], version: 3 },
          { ...corpora[0], _id: "corpus_0", version: 2 },
          { ...corpora[0], _id: "corpus_00", version: 1 },
        ];
      return undefined;
    });
    render(<CampaignsHome />);
    expect(screen.getByText("Corvo Labs corpus · v3")).toBeDefined();
  });
});
