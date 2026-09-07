import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CampaignShapeBuilder } from "@/components/campaigns/CampaignShapeBuilder";
import { useMutation, useQuery } from "convex/react";

vi.mock("convex/react", () => ({
  useMutation: vi.fn(),
  useQuery: vi.fn(),
}));

vi.mock("@/convex/_generated/api", () => ({
  api: {
    shapes: {
      getCampaignShape: "shapes:getCampaignShape",
      proposeShape: "shapes:proposeShape",
      updateSlot: "shapes:updateSlot",
      linkSlotIdea: "shapes:linkSlotIdea",
      moveSlot: "shapes:moveSlot",
      acceptShape: "shapes:acceptShape",
      saveBrief: "shapes:saveBrief",
    },
  },
}));

const useQueryMock = vi.mocked(useQuery);
const useMutationMock = vi.mocked(useMutation);

const workingSet = [
  { idea: { _id: "idea_1", text: "Approval UIs should foreground claim lineage.", flavor: "opinion" } },
  { idea: { _id: "idea_2", text: "Every failed agent run is an eval fixture.", flavor: "insight" } },
];

const proposedView = {
  campaign: { _id: "campaign_1", title: "Reasoning + acting" },
  shape: { _id: "shape_1", preset: "standard" as const, status: "proposed" as const },
  slots: [
    { _id: "slot_1", seq: 1, role: "pillar", channel: "corvo-blog", mediaType: "article", title: "Acting without observation", ideaId: "idea_1" },
    { _id: "slot_2", seq: 2, role: "hook", channel: "x", mediaType: "post", ideaId: "idea_2" },
    { _id: "slot_3", seq: 3, role: "satellite", channel: "linkedin", mediaType: "post", ideaId: undefined },
    { _id: "slot_4", seq: 4, role: "cta", channel: "linkedin", mediaType: "post", ideaId: undefined },
  ],
  workingSet,
  brief: { goal: "Position excerpt-first drafting", audience: "Engineering leaders" },
};

const mockMutations = () => {
  const mutations: Record<string, ReturnType<typeof vi.fn>> = {
    "shapes:proposeShape": vi.fn().mockResolvedValue({ shapeId: "shape_1", slotCount: 5 }),
    "shapes:updateSlot": vi.fn().mockResolvedValue({ updated: true }),
    "shapes:linkSlotIdea": vi.fn().mockResolvedValue({ linked: true }),
    "shapes:moveSlot": vi.fn().mockResolvedValue({ moved: true }),
    "shapes:acceptShape": vi.fn().mockResolvedValue({ accepted: true }),
    "shapes:saveBrief": vi.fn().mockResolvedValue({ saved: true }),
  };
  useMutationMock.mockImplementation(((reference: unknown) =>
    mutations[reference as string] ?? vi.fn()) as never);
  return mutations;
};

describe("CampaignShapeBuilder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useQueryMock.mockImplementation((reference: unknown) => {
      if (reference === "shapes:getCampaignShape") return proposedView;
      return undefined;
    });
    mockMutations();
  });

  it("renders preset cards, the legend, and numbered slots", () => {
    render(<CampaignShapeBuilder campaignId="campaign_1" />);
    expect(screen.getByTestId("preset-standard")).toBeDefined();
    expect(screen.getByText("Standard")).toBeDefined();
    expect(screen.getByText("Deep")).toBeDefined();
    expect(screen.getByText(/publishing sequence \(1 → n\)/)).toBeDefined();
    expect(screen.getAllByTestId("slot-row")).toHaveLength(4);
    expect(screen.getByText("Acting without observation")).toBeDefined();
  });

  it("blocks acceptance while slots are incomplete (D-11)", () => {
    render(<CampaignShapeBuilder campaignId="campaign_1" />);
    const hint = screen.getByTestId("accept-hint");
    expect(hint.textContent).toContain("2 slots incomplete");
    expect((screen.getByTestId("accept-shape") as HTMLButtonElement).disabled).toBe(true);
  });

  it("enables acceptance once every slot has a linked idea", () => {
    const completeView = {
      ...proposedView,
      slots: proposedView.slots.map((slot) => ({
        ...slot,
        ideaId: slot.ideaId ?? "idea_2",
      })),
    };
    useQueryMock.mockImplementation((reference: unknown) => {
      if (reference === "shapes:getCampaignShape") return completeView;
      return undefined;
    });

    render(<CampaignShapeBuilder campaignId="campaign_1" />);
    expect(screen.getByTestId("accept-hint").textContent).toContain("All slots linked");
    expect((screen.getByTestId("accept-shape") as HTMLButtonElement).disabled).toBe(false);
  });

  it("switches presets while preserving edits (D-10)", async () => {
    const mutations = mockMutations();
    render(<CampaignShapeBuilder campaignId="campaign_1" />);

    fireEvent.click(screen.getByTestId("preset-deep"));
    await waitFor(() => {
      expect(mutations["shapes:proposeShape"]).toHaveBeenCalledWith({
        campaignId: "campaign_1",
        preset: "deep",
      });
    });
    expect(await screen.findByTestId("shape-toast").then((el) => el.textContent)).toContain(
      "your edits are preserved"
    );
  });

  it("edits a slot title inline with the pencil control", async () => {
    const mutations = mockMutations();
    render(<CampaignShapeBuilder campaignId="campaign_1" />);

    const pillarRow = screen.getByText("Acting without observation").closest("div[data-testid='slot-row']") as HTMLElement;
    fireEvent.click(within(pillarRow).getByLabelText("Edit title"));
    const input = screen.getByLabelText("Slot title") as HTMLInputElement;
    expect(input.value).toBe("Acting without observation");
    fireEvent.change(input, { target: { value: "My new pillar title" } });
    fireEvent.blur(input);

    await waitFor(() => {
      expect(mutations["shapes:updateSlot"]).toHaveBeenCalledWith({
        shapeId: "shape_1",
        slotId: "slot_1",
        title: "My new pillar title",
      });
    });
  });

  it("moves a slot within the publishing sequence", async () => {
    const mutations = mockMutations();
    render(<CampaignShapeBuilder campaignId="campaign_1" />);

    fireEvent.click(screen.getAllByLabelText("Move slot up")[1]);
    await waitFor(() => {
      expect(mutations["shapes:moveSlot"]).toHaveBeenCalledWith({
        shapeId: "shape_1",
        slotId: "slot_2",
        direction: -1,
      });
    });
  });

  it("saves goal and audience to the brief on blur (D-3)", async () => {
    const mutations = mockMutations();
    render(<CampaignShapeBuilder campaignId="campaign_1" />);

    const goalInput = screen.getByLabelText(/Campaign goal/);
    fireEvent.change(goalInput, { target: { value: "Eval-friendly methodology" } });
    fireEvent.blur(goalInput);

    await waitFor(() => {
      expect(mutations["shapes:saveBrief"]).toHaveBeenCalledWith({
        campaignId: "campaign_1",
        goal: "Eval-friendly methodology",
      });
    });
  });
});
