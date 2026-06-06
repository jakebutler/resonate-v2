import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useMutation, useQuery } from "convex/react";
import { WorkflowBoard } from "@/components/WorkflowBoard/WorkflowBoard";

vi.mock("convex/react", () => ({
  useQuery: vi.fn(),
  useMutation: vi.fn(),
}));

vi.mock("@/convex/_generated/api", () => ({
  api: {
    workflow: {
      getBoard: "workflow:getBoard",
      createIdea: "workflow:createIdea",
      moveIdeaToStatus: "workflow:moveIdeaToStatus",
      advanceIdeaStage: "workflow:advanceIdeaStage",
      createDraftFromIdea: "workflow:createDraftFromIdea",
      recordIdeaResearchRun: "workflow:recordIdeaResearchRun",
      advanceDraft: "workflow:advanceDraft",
      recordDraftAgentRun: "workflow:recordDraftAgentRun",
    },
  },
}));

vi.mock("@/components/WorkflowBoard/WorkflowIdeaModal", () => ({
  WorkflowIdeaModal: ({ open }: { open: boolean }) =>
    open ? <div data-testid="idea-modal" /> : null,
}));

vi.mock("@/components/WorkflowBoard/WorkflowDraftEditor", () => ({
  WorkflowDraftEditor: ({
    open,
    draftId,
  }: {
    open: boolean;
    draftId: string | null;
  }) => (open ? <div data-testid="draft-editor">{draftId}</div> : null),
}));

const createIdeaMock = vi.fn();
const moveIdeaToStatusMock = vi.fn();
const advanceIdeaStageMock = vi.fn();
const createDraftFromIdeaMock = vi.fn();
const recordIdeaResearchRunMock = vi.fn();
const advanceDraftMock = vi.fn();
const recordDraftAgentRunMock = vi.fn();

const boardData = {
  ideaCards: [
    {
      _id: "idea_1",
      title: "Editorial system notes",
      text: "A strong content workflow separates idea primitives from drafts.",
      references: [],
      draftCount: 0,
      researchModes: [],
      researchSources: [],
      updatedAt: Date.parse("2026-03-11T10:00:00.000Z"),
    },
  ],
  researchCards: [
    {
      _id: "idea_2",
      title: "AI ops angle",
      text: "Research why operational readiness matters more than model choice.",
      references: [{ url: "https://example.com/source" }],
      draftCount: 1,
      researchObjective: "Explain what teams miss after the prototype.",
      researchNotes: "Use real process examples and show where handoffs break.",
      researchModes: [],
      researchSources: [],
      updatedAt: Date.parse("2026-03-11T09:00:00.000Z"),
    },
  ],
  availableIdeas: [
    {
      _id: "idea_backlog",
      title: "Saved inspiration",
      text: "A backlog idea waiting to be selected.",
      updatedAt: Date.parse("2026-03-10T09:00:00.000Z"),
      referencesCount: 2,
    },
  ],
  draftColumns: [
    { stage: "outline", cards: [] },
    { stage: "copyedit", cards: [] },
    { stage: "seo", cards: [] },
    { stage: "final", cards: [] },
    { stage: "published", cards: [] },
  ],
};

describe("WorkflowBoard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useQuery).mockReturnValue(boardData);
    vi.mocked(useMutation).mockImplementation((reference) => {
      switch (reference) {
        case "workflow:createIdea":
          return createIdeaMock;
        case "workflow:moveIdeaToStatus":
          return moveIdeaToStatusMock;
        case "workflow:advanceIdeaStage":
          return advanceIdeaStageMock;
        case "workflow:createDraftFromIdea":
          return createDraftFromIdeaMock;
        case "workflow:recordIdeaResearchRun":
          return recordIdeaResearchRunMock;
        case "workflow:advanceDraft":
          return advanceDraftMock;
        case "workflow:recordDraftAgentRun":
          return recordDraftAgentRunMock;
        default:
          throw new Error(`Unexpected mutation reference: ${String(reference)}`);
      }
    });
  });

  it("creates a new selected idea card from the composer", async () => {
    render(<WorkflowBoard />);

    fireEvent.click(screen.getByText("Add Idea Card"));
    fireEvent.change(screen.getByLabelText("Working Title"), {
      target: { value: "New angle" },
    });
    fireEvent.change(screen.getByLabelText("Idea"), {
      target: { value: "This should enter the active board." },
    });
    fireEvent.click(screen.getByText("Create Idea"));

    await waitFor(() => {
      expect(createIdeaMock).toHaveBeenCalledWith({
        title: "New angle",
        text: "This should enter the active board.",
        status: "idea",
      });
    });
  });

  it("opens the idea detail view from the card action", async () => {
    render(<WorkflowBoard />);

    const card = screen.getByText("Editorial system notes").closest("[data-slot='card']");
    expect(card).not.toBeNull();
    fireEvent.click(within(card as HTMLElement).getByText("Open"));

    expect(await screen.findByTestId("idea-modal")).toBeInTheDocument();
  });

  it("promotes an inspiration item into the idea column", async () => {
    render(<WorkflowBoard />);

    fireEvent.click(screen.getByText("Use Inspiration"));
    fireEvent.click(screen.getByText("Select"));

    await waitFor(() => {
      expect(moveIdeaToStatusMock).toHaveBeenCalledWith({
        id: "idea_backlog",
        status: "idea",
      });
    });
  });

  it("removes the workflow summary chrome from the board", () => {
    render(<WorkflowBoard />);

    expect(screen.queryByText("Workflow board")).not.toBeInTheDocument();
    expect(screen.queryByText("Idea to published progression")).not.toBeInTheDocument();
    expect(screen.getByText("Kanban")).toBeInTheDocument();
  });

  it("shows the gate modal and allows force-advancing when an idea is blocked", async () => {
    advanceIdeaStageMock
      .mockResolvedValueOnce({
        blocked: true,
        gate: {
          summary: "This does not look ready for research yet.",
          issues: ["The idea still reads like a fragment instead of a workable prompt."],
          recommendedAction: "Research Agent",
        },
      })
      .mockResolvedValueOnce({
        blocked: false,
        advancedTo: "research",
      });

    render(<WorkflowBoard />);
    await act(async () => {
      fireEvent.click(screen.getByText("Move"));
    });

    expect(
      await screen.findByText("This does not look ready for research yet.")
    ).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByText("Move Anyway"));
    });

    expect(advanceIdeaStageMock).toHaveBeenLastCalledWith({
      id: "idea_1",
      force: true,
    });
  });

  it("opens the draft editor after creating a draft from research", async () => {
    createDraftFromIdeaMock.mockResolvedValue({
      blocked: false,
      draftId: "draft_1",
    });

    render(<WorkflowBoard />);
    fireEvent.click(screen.getByText("Blog Draft"));

    await waitFor(() => {
      expect(createDraftFromIdeaMock).toHaveBeenCalledWith(
        expect.objectContaining({
          ideaId: "idea_2",
          type: "blog",
        })
      );
    });
    expect(await screen.findByTestId("draft-editor")).toHaveTextContent("draft_1");
  });
});
