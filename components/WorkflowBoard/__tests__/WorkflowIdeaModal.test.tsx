import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useMutation, useQuery } from "convex/react";
import { WorkflowIdeaModal } from "@/components/WorkflowBoard/WorkflowIdeaModal";

vi.mock("convex/react", () => ({
  useQuery: vi.fn(),
  useMutation: vi.fn(),
}));

vi.mock("@/convex/_generated/api", () => ({
  api: {
    workflow: {
      getIdea: "workflow:getIdea",
      updateIdea: "workflow:updateIdea",
      addIdeaReference: "workflow:addIdeaReference",
      extractIdeaReferences: "workflow:extractIdeaReferences",
      moveIdeaToStatus: "workflow:moveIdeaToStatus",
    },
  },
}));

const updateIdeaMock = vi.fn();
const addIdeaReferenceMock = vi.fn();
const extractIdeaReferencesMock = vi.fn();
const moveIdeaToStatusMock = vi.fn();

const ideaData = {
  _id: "idea_1",
  title: "Big deal bimagrumab + semaglutide study",
  text: "https://www.nature.com/articles/s41591-026-04204-0\n\nA long raw URL should still wrap cleanly inside the workflow layout.",
  draftCount: 2,
  references: [
    {
      url: "https://example.com/source",
      title: "Example source",
      kind: "article",
      addedBy: "user",
    },
  ],
  researchObjective: "Clarify the mechanism and tradeoffs.",
  researchNotes: "Compare the paper outcomes with prior semaglutide-only coverage.",
  researchModes: ["academic"],
  researchSources: ["academic publications"],
  updatedAt: Date.parse("2026-03-11T18:24:00.000Z"),
};

describe("WorkflowIdeaModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useQuery).mockReturnValue(ideaData);
    vi.mocked(useMutation).mockImplementation((reference) => {
      switch (reference) {
        case "workflow:updateIdea":
          return updateIdeaMock;
        case "workflow:addIdeaReference":
          return addIdeaReferenceMock;
        case "workflow:extractIdeaReferences":
          return extractIdeaReferencesMock;
        case "workflow:moveIdeaToStatus":
          return moveIdeaToStatusMock;
        default:
          throw new Error(`Unexpected mutation reference: ${String(reference)}`);
      }
    });
  });

  it("renders the split workspace with internal pane scrolling", () => {
    render(<WorkflowIdeaModal open ideaId={"idea_1" as never} onClose={vi.fn()} />);

    expect(screen.getByText("Keep the originating thought intact.")).toBeInTheDocument();
    expect(screen.getByText("References")).toBeInTheDocument();
    expect(screen.getByText("Extract Links")).toBeInTheDocument();

    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeInTheDocument();

    const body = screen
      .getByText("Keep the originating thought intact.")
      .closest(".overflow-hidden.p-0");
    expect(body).not.toBeNull();

    const leftPane = screen
      .getByText("Keep the originating thought intact.")
      .closest(".border-r");
    expect(leftPane).not.toBeNull();
    expect(leftPane).toHaveClass("bg-[#fcfaf6]");

    const rightPane = dialog.querySelector("aside");
    expect(rightPane).not.toBeNull();
    expect(rightPane).toHaveClass("bg-[#f6f1e8]");
    expect(rightPane).toHaveTextContent("References");
  });

  it("keeps reference actions available and saves edited idea content", async () => {
    render(<WorkflowIdeaModal open ideaId={"idea_1" as never} onClose={vi.fn()} />);

    fireEvent.click(screen.getByText("Extract Links"));
    expect(extractIdeaReferencesMock).toHaveBeenCalledWith({ id: "idea_1" });

    fireEvent.change(screen.getByLabelText("Reference URL"), {
      target: { value: "https://example.com/extra" },
    });
    fireEvent.change(screen.getByLabelText("Optional title"), {
      target: { value: "Extra source" },
    });
    fireEvent.change(screen.getByLabelText("Kind"), {
      target: { value: "report" },
    });
    fireEvent.click(screen.getByText("Add Reference"));

    await waitFor(() => {
      expect(addIdeaReferenceMock).toHaveBeenCalledWith({
        id: "idea_1",
        reference: {
          url: "https://example.com/extra",
          title: "Extra source",
          kind: "report",
          addedBy: "user",
        },
      });
    });

    fireEvent.change(screen.getByLabelText("Working Title"), {
      target: { value: "Updated workflow title" },
    });
    fireEvent.click(screen.getByText("Save Idea"));

    await waitFor(() => {
      expect(updateIdeaMock).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "idea_1",
          title: "Updated workflow title",
        })
      );
    });
  });
});
