import type { DraftStage, WorkflowStage } from "@/lib/workflow";

export type WorkflowReviewColumnKey =
  | "idea"
  | "research"
  | "outline"
  | "review"
  | "published";

export const WORKFLOW_REVIEW_COLUMNS: Array<{
  id: WorkflowReviewColumnKey;
  label: string;
  description: string;
  accentClassName: string;
}> = [
  {
    id: "idea",
    label: "Ideas",
    description: "Capture and select ideas worth taking seriously.",
    accentClassName:
      "border-[#ffd59c] bg-[linear-gradient(180deg,#fff9ef_0%,#fff4de_100%)]",
  },
  {
    id: "research",
    label: "Research",
    description: "Develop the evidence and angle before a draft exists.",
    accentClassName:
      "border-[#b8dce1] bg-[linear-gradient(180deg,#f3fbfd_0%,#e9f7fa_100%)]",
  },
  {
    id: "outline",
    label: "Outline",
    description: "Turn research into a concrete post thesis and shape.",
    accentClassName:
      "border-[#ffe0b6] bg-[linear-gradient(180deg,#fff9ef_0%,#fff4e6_100%)]",
  },
  {
    id: "review",
    label: "Review",
    description: "Copyedit, SEO, and final edit stay together here.",
    accentClassName:
      "border-[#d8dff2] bg-[linear-gradient(180deg,#f8f9ff_0%,#eef2ff_100%)]",
  },
  {
    id: "published",
    label: "Published",
    description: "Recent releases stay visible for one week, then age off.",
    accentClassName:
      "border-[#ddd8cf] bg-[linear-gradient(180deg,#fbfaf7_0%,#f3efe8_100%)]",
  },
];

export const WORKFLOW_COLUMN_OVERFLOW_LIMIT = 4;

export function mapWorkflowStageToReviewColumn(
  stage: WorkflowStage
): WorkflowReviewColumnKey {
  switch (stage) {
    case "idea":
      return "idea";
    case "research":
      return "research";
    case "outline":
      return "outline";
    case "copyedit":
    case "seo":
    case "final":
      return "review";
    case "published":
      return "published";
    default:
      return "idea";
  }
}

export function getReviewColumnBadgeLabel(stage?: DraftStage) {
  if (!stage) return null;
  if (stage === "copyedit") return "Copyedit";
  if (stage === "seo") return "SEO";
  if (stage === "final") return "Final";
  if (stage === "outline") return "Outline";
  if (stage === "published") return "Published";
  return null;
}

export function canDragToColumn(
  currentStage: WorkflowStage,
  targetColumn: WorkflowReviewColumnKey
) {
  if (targetColumn === mapWorkflowStageToReviewColumn(currentStage)) {
    return true;
  }

  if (currentStage === "idea") {
    return targetColumn === "research";
  }

  if (currentStage === "research") {
    return false;
  }

  if (currentStage === "outline") {
    return targetColumn === "review";
  }

  if (currentStage === "final") {
    return targetColumn === "published";
  }

  return false;
}
