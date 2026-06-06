import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useMutation, useQuery } from "convex/react";
import { WorkflowDraftEditor } from "@/components/WorkflowBoard/WorkflowDraftEditor";

vi.mock("convex/react", () => ({
  useQuery: vi.fn(),
  useMutation: vi.fn(),
}));

vi.mock("@/convex/_generated/api", () => ({
  api: {
    workflow: {
      getDraftForEditor: "workflow:getDraftForEditor",
      updateDraftContent: "workflow:updateDraftContent",
      advanceDraft: "workflow:advanceDraft",
      recordDraftAgentRun: "workflow:recordDraftAgentRun",
    },
  },
}));

vi.mock("@/lib/llmClient", () => ({
  getAssistantResponse: vi.fn().mockResolvedValue("Polished draft output"),
}));

const updateDraftContentMock = vi.fn();
const advanceDraftMock = vi.fn();
const recordDraftAgentRunMock = vi.fn();

const draftData = {
  draft: {
    _id: "draft_1",
    type: "blog" as const,
    stage: "outline" as const,
    stageNotes: "",
    lastGateSummary: undefined,
    lastGateIssues: [],
    lastAgentSummary: undefined,
  },
  post: {
    _id: "post_1",
    title: "Working title",
    content: "## Draft\n\nThis is already substantial enough for a test.",
    status: "draft" as const,
    scheduledDate: "2026-03-18",
    scheduledTime: "10:00",
  },
  idea: {
    title: "Source idea",
    text: "Why editorial systems should preserve primitives.",
    researchObjective: "Show the model split between ideas and drafts.",
    researchNotes: "Use board examples and mention downstream branching.",
    references: [{ url: "https://example.com/source" }],
  },
};

describe("WorkflowDraftEditor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useQuery).mockReturnValue(draftData);
    vi.mocked(useMutation).mockImplementation((reference) => {
      switch (reference) {
        case "workflow:updateDraftContent":
          return updateDraftContentMock;
        case "workflow:advanceDraft":
          return advanceDraftMock;
        case "workflow:recordDraftAgentRun":
          return recordDraftAgentRunMock;
        default:
          throw new Error(`Unexpected mutation reference: ${String(reference)}`);
      }
    });
  });

  it("opens a gate modal when the next stage check blocks advancement", async () => {
    advanceDraftMock.mockResolvedValue({
      blocked: true,
      gate: {
        summary: "This does not look ready for copyedit + fact check yet.",
        issues: ["The draft is still very short for a copyedit pass."],
        recommendedAction: "Copyedit Agent",
      },
    });

    render(<WorkflowDraftEditor open draftId="draft_1" onClose={vi.fn()} />);
    fireEvent.click(screen.getByText("Advance to Copyedit + Fact Check"));

    expect(updateDraftContentMock).toHaveBeenCalled();
    expect(
      await screen.findByText("This does not look ready for copyedit + fact check yet.")
    ).toBeInTheDocument();
  });

  it("renders the split-pane workspace with internal pane scrolling", () => {
    render(<WorkflowDraftEditor open draftId="draft_1" onClose={vi.fn()} />);

    expect(screen.getByText("Draft content")).toBeInTheDocument();

    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeInTheDocument();

    const body = screen.getByText("Draft content").closest(".overflow-hidden.p-0");
    expect(body).not.toBeNull();

    const leftPane = screen.getByText("Draft content").closest(".border-r");
    expect(leftPane).not.toBeNull();
    expect(leftPane).toHaveClass("bg-white");

    const rightPane = dialog.querySelector("aside");
    expect(rightPane).not.toBeNull();
    expect(rightPane).toHaveClass("bg-[#f7f4ee]");
    expect(rightPane).toHaveTextContent("Source idea");
  });

  it("runs the stage agent and records the resulting draft pass", async () => {
    render(<WorkflowDraftEditor open draftId="draft_1" onClose={vi.fn()} />);
    fireEvent.click(screen.getByText("Copyedit Agent"));

    await waitFor(() => {
      expect(recordDraftAgentRunMock).toHaveBeenCalledWith({
        id: "draft_1",
        stage: "copyedit",
        title: "Working title",
        content: "Polished draft output",
        summary: "Copyedit Agent produced a fresh copyedit + fact check pass.",
      });
    });
  });
});
