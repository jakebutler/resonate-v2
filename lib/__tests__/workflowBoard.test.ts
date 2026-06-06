import { describe, expect, it } from "vitest";
import {
  WORKFLOW_COLUMN_OVERFLOW_LIMIT,
  WORKFLOW_REVIEW_COLUMNS,
  canDragToColumn,
  getReviewColumnBadgeLabel,
  mapWorkflowStageToReviewColumn,
} from "@/lib/workflowBoard";

describe("workflow board helpers", () => {
  it("exposes the expected review columns and overflow limit", () => {
    expect(WORKFLOW_REVIEW_COLUMNS.map((column) => column.id)).toEqual([
      "idea",
      "research",
      "outline",
      "review",
      "published",
    ]);
    expect(WORKFLOW_COLUMN_OVERFLOW_LIMIT).toBe(4);
  });

  it("maps each workflow stage into the correct review column", () => {
    expect(mapWorkflowStageToReviewColumn("idea")).toBe("idea");
    expect(mapWorkflowStageToReviewColumn("research")).toBe("research");
    expect(mapWorkflowStageToReviewColumn("outline")).toBe("outline");
    expect(mapWorkflowStageToReviewColumn("copyedit")).toBe("review");
    expect(mapWorkflowStageToReviewColumn("seo")).toBe("review");
    expect(mapWorkflowStageToReviewColumn("final")).toBe("review");
    expect(mapWorkflowStageToReviewColumn("published")).toBe("published");
  });

  it("returns badge labels only for review-board draft stages", () => {
    expect(getReviewColumnBadgeLabel()).toBeNull();
    expect(getReviewColumnBadgeLabel("outline")).toBe("Outline");
    expect(getReviewColumnBadgeLabel("copyedit")).toBe("Copyedit");
    expect(getReviewColumnBadgeLabel("seo")).toBe("SEO");
    expect(getReviewColumnBadgeLabel("final")).toBe("Final");
    expect(getReviewColumnBadgeLabel("published")).toBe("Published");
  });

  it("allows dragging only to valid target columns", () => {
    expect(canDragToColumn("idea", "idea")).toBe(true);
    expect(canDragToColumn("idea", "research")).toBe(true);
    expect(canDragToColumn("idea", "review")).toBe(false);

    expect(canDragToColumn("research", "research")).toBe(true);
    expect(canDragToColumn("research", "outline")).toBe(false);

    expect(canDragToColumn("outline", "outline")).toBe(true);
    expect(canDragToColumn("outline", "review")).toBe(true);
    expect(canDragToColumn("outline", "published")).toBe(false);

    expect(canDragToColumn("copyedit", "review")).toBe(true);
    expect(canDragToColumn("copyedit", "published")).toBe(false);

    expect(canDragToColumn("final", "review")).toBe(true);
    expect(canDragToColumn("final", "published")).toBe(true);

    expect(canDragToColumn("published", "published")).toBe(true);
    expect(canDragToColumn("published", "review")).toBe(false);
  });
});
