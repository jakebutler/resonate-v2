export const IDEA_SELECTION_STATUSES = ["backlog", "idea", "research", "archived"] as const;
export const IDEA_STAGES = ["idea", "research"] as const;
export const DRAFT_STAGES = [
  "outline",
  "copyedit",
  "seo",
  "final",
  "published",
] as const;
export const WORKFLOW_STAGES = [...IDEA_STAGES, ...DRAFT_STAGES] as const;

export const RESEARCH_MODES = [
  "current-news",
  "trends",
  "literature-review",
  "academic",
  "competitive",
  "visual",
] as const;

export const RESEARCH_SOURCES = [
  "blogs",
  "news",
  "x",
  "arxiv",
  "academic-publications",
  "reddit",
  "dribbble",
] as const;

export type IdeaStatus = (typeof IDEA_SELECTION_STATUSES)[number];
export type IdeaStage = (typeof IDEA_STAGES)[number];
export type DraftStage = (typeof DRAFT_STAGES)[number];
export type WorkflowStage = (typeof WORKFLOW_STAGES)[number];
export type ResearchMode = (typeof RESEARCH_MODES)[number];
export type ResearchSource = (typeof RESEARCH_SOURCES)[number];
export type PostType = "blog" | "linkedin";
export type ResearchStatus = "idle" | "queued" | "completed";

export interface WorkflowReference {
  url: string;
  title?: string;
  kind?: string;
  addedBy: "user" | "extractor" | "agent";
}

export interface IdeaStageCheckInput {
  currentStage: IdeaStage;
  nextStage: "research" | "outline";
  title?: string;
  text: string;
  researchObjective?: string;
  researchNotes?: string;
  references?: WorkflowReference[];
}

export interface DraftStageCheckInput {
  currentStage: DraftStage;
  nextStage: DraftStage;
  type: PostType;
  title?: string;
  content?: string;
  scheduledDate?: string;
}

export interface StageCheckResult {
  stage: WorkflowStage;
  ready: boolean;
  summary: string;
  issues: string[];
  recommendedAction: string;
}

export const STAGE_LABELS: Record<WorkflowStage, string> = {
  idea: "Idea",
  research: "Research",
  outline: "Outline / Draft",
  copyedit: "Copyedit + Fact Check",
  seo: "SEO",
  final: "Final Edit",
  published: "Published",
};

export const STAGE_DESCRIPTIONS: Record<WorkflowStage, string> = {
  idea: "Selected ideas waiting to enter the writing workflow.",
  research: "Reference gathering, extraction, and supporting evidence.",
  outline: "Working draft creation tied to a post instance.",
  copyedit: "Clarity, flow, and factual hygiene before optimization.",
  seo: "Search and discoverability pass before final sign-off.",
  final: "Last editorial pass before release.",
  published: "Recently published posts; cards age off after seven days.",
};

export const NEXT_DRAFT_STAGE: Partial<Record<DraftStage, DraftStage>> = {
  outline: "copyedit",
  copyedit: "seo",
  seo: "final",
  final: "published",
};

export function getNextDraftStage(stage: DraftStage): DraftStage | null {
  return NEXT_DRAFT_STAGE[stage] ?? null;
}

export function getStageAgentLabel(stage: WorkflowStage, type?: PostType): string {
  if (stage === "research") return "Research Agent";
  if (stage === "outline") return "Outline Agent";
  if (stage === "copyedit") return "Copyedit Agent";
  if (stage === "seo") return type === "linkedin" ? "Discoverability Agent" : "SEO Agent";
  if (stage === "final") return "Final Edit Agent";
  if (stage === "published") return "Publish Readiness Agent";
  return "Workflow Agent";
}

export function formatWorkflowTitle(title?: string, content?: string): string {
  if (title?.trim()) return title.trim();
  const trimmed = (content ?? "").trim().split("\n")[0] ?? "";
  if (!trimmed) return "Untitled";
  return trimmed.length > 72 ? `${trimmed.slice(0, 72)}…` : trimmed;
}

export function formatWorkflowTimestamp(timestamp?: number): string {
  if (!timestamp) return "Not yet";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(timestamp);
}

export function extractUrls(text: string): string[] {
  const matches = text.match(/https?:\/\/[^\s)]+/g) ?? [];
  const seen = new Set<string>();
  const urls: string[] = [];

  for (const raw of matches) {
    const sanitized = raw.replace(/[.,!?;:]+$/, "");
    if (!seen.has(sanitized)) {
      seen.add(sanitized);
      urls.push(sanitized);
    }
  }

  return urls;
}

export function isPublishedCardVisible(
  publishedAt: number | undefined,
  now = Date.now()
): boolean {
  if (!publishedAt) return true;
  return publishedAt >= now - 7 * 24 * 60 * 60 * 1000;
}

export function summarizeTextPreview(text?: string, maxLength = 180): string {
  const normalized = (text ?? "").trim().replace(/\s+/g, " ");
  if (!normalized) return "";
  return normalized.length > maxLength
    ? `${normalized.slice(0, maxLength)}…`
    : normalized;
}

export function runIdeaStageCheck(input: IdeaStageCheckInput): StageCheckResult {
  const text = input.text.trim();
  const researchNotes = input.researchNotes?.trim() ?? "";
  const researchObjective = input.researchObjective?.trim() ?? "";
  const references = input.references ?? [];
  const issues: string[] = [];

  if (input.nextStage === "research") {
    if (text.length < 20) {
      issues.push("The idea still reads like a fragment instead of a workable prompt.");
    }
    if (text.length < 60 && !input.title?.trim()) {
      issues.push("Adding a title or slightly more context would make research direction clearer.");
    }
  }

  if (input.nextStage === "outline") {
    if (researchNotes.length < 120) {
      issues.push("Research notes are still thin for spawning a strong first draft.");
    }
    if (!researchObjective) {
      issues.push("A research objective is missing, so the downstream draft lacks a clear angle.");
    }
    if (references.length === 0) {
      issues.push("No references are attached yet, which makes the draft harder to ground.");
    }
  }

  if (issues.length === 0) {
    return {
      stage: input.nextStage,
      ready: true,
      summary: `This looks ready for ${STAGE_LABELS[input.nextStage].toLowerCase()}.`,
      issues: [],
      recommendedAction: "advance",
    };
  }

  return {
    stage: input.nextStage,
    ready: false,
    summary: `This does not look ready for ${STAGE_LABELS[input.nextStage].toLowerCase()} yet.`,
    issues,
    recommendedAction: getStageAgentLabel(input.nextStage),
  };
}

export function runDraftStageCheck(input: DraftStageCheckInput): StageCheckResult {
  const content = input.content?.trim() ?? "";
  const title = input.title?.trim() ?? "";
  const issues: string[] = [];

  if (input.nextStage === "copyedit") {
    if (input.type === "blog" && !title) {
      issues.push("The post still needs a working title.");
    }
    if (content.length < 250) {
      issues.push("The draft is still very short for a copyedit pass.");
    }
    if (!/\n/.test(content)) {
      issues.push("The content still looks like notes instead of a structured draft.");
    }
  }

  if (input.nextStage === "seo") {
    if (/(TODO|TK|XXX|\[source\]|\[citation needed\])/i.test(content)) {
      issues.push("Placeholder notes are still present in the draft.");
    }
    if (input.type === "blog" && !/^#|^##/m.test(content)) {
      issues.push("The draft is missing section structure that usually exists before SEO review.");
    }
  }

  if (input.nextStage === "final") {
    if (content.length < 300) {
      issues.push("The content is still thin for a final editorial pass.");
    }
    if (input.type === "blog" && !title) {
      issues.push("A final edit should have a title in place.");
    }
  }

  if (input.nextStage === "published") {
    if (!input.scheduledDate) {
      issues.push("A publish date is still missing.");
    }
    if (/(TODO|TK|XXX|\[source\]|\[citation needed\])/i.test(content)) {
      issues.push("The content still contains unresolved placeholders.");
    }
  }

  if (issues.length === 0) {
    return {
      stage: input.nextStage,
      ready: true,
      summary: `This looks ready for ${STAGE_LABELS[input.nextStage].toLowerCase()}.`,
      issues: [],
      recommendedAction: "advance",
    };
  }

  return {
    stage: input.nextStage,
    ready: false,
    summary: `This does not look ready for ${STAGE_LABELS[input.nextStage].toLowerCase()} yet.`,
    issues,
    recommendedAction: getStageAgentLabel(input.nextStage, input.type),
  };
}

export function buildResearchAgentPrompt(input: {
  title?: string;
  text: string;
  researchObjective?: string;
  researchNotes?: string;
  references?: WorkflowReference[];
}): string {
  const references = formatReferences(input.references);

  return [
    "Create a concise research brief in markdown.",
    "Return only markdown. Do not add preamble or code fences.",
    "Do not invent citations or claims that are not grounded in the provided context.",
    "Use these sections exactly: ## Research Objective, ## Key Angles, ## Evidence Gaps, ## Suggested Sources, ## Notes.",
    "",
    `Idea title: ${input.title?.trim() || "Untitled"}`,
    "Idea:",
    input.text.trim(),
    "",
    `Current research objective: ${input.researchObjective?.trim() || "None yet"}`,
    "Current research notes:",
    input.researchNotes?.trim() || "None yet",
    "",
    "Attached references:",
    references || "- None yet",
  ].join("\n");
}

export function buildOutlineAgentPrompt(input: {
  type: PostType;
  title?: string;
  text: string;
  researchObjective?: string;
  researchNotes?: string;
  references?: WorkflowReference[];
}): string {
  const references = formatReferences(input.references);

  if (input.type === "blog") {
    return [
      "Turn the idea and research context into a strong first blog draft in markdown.",
      "Return only the blog draft body in markdown. Do not add commentary or code fences.",
      "Use descriptive headings and maintain a practical, credible tone.",
      "Do not invent facts or citations. If something is uncertain, phrase it cautiously.",
      "",
      `Working title: ${input.title?.trim() || "Untitled"}`,
      "Core idea:",
      input.text.trim(),
      "",
      `Research objective: ${input.researchObjective?.trim() || "None provided"}`,
      "Research notes:",
      input.researchNotes?.trim() || "None yet",
      "",
      "References:",
      references || "- None yet",
    ].join("\n");
  }

  return [
    "Turn the idea and research context into a strong LinkedIn post draft.",
    "Return only the LinkedIn post text. Do not add commentary or code fences.",
    "Keep it clear, conversational, and under 3000 characters.",
    "Do not invent facts or citations. If something is uncertain, phrase it cautiously.",
    "",
    "Core idea:",
    input.text.trim(),
    "",
    `Research objective: ${input.researchObjective?.trim() || "None provided"}`,
    "Research notes:",
    input.researchNotes?.trim() || "None yet",
    "",
    "References:",
    references || "- None yet",
  ].join("\n");
}

export function buildDraftStageAgentPrompt(input: {
  type: PostType;
  targetStage: DraftStage;
  title?: string;
  content: string;
  scheduledDate?: string;
  ideaTitle?: string;
  ideaText: string;
  researchObjective?: string;
  researchNotes?: string;
  references?: WorkflowReference[];
}): string {
  const references = formatReferences(input.references);
  const stageInstruction =
    input.targetStage === "copyedit"
      ? "Revise the draft for clarity, structure, and factual hygiene while preserving the author's voice."
      : input.targetStage === "seo"
      ? input.type === "blog"
        ? "Improve discoverability with clearer headings, keyword-rich phrasing, and a stronger search-friendly structure."
        : "Improve discoverability for LinkedIn with a stronger hook, scannability, and light keyword reinforcement."
      : input.targetStage === "final"
      ? "Produce a publication-ready final edit with stronger flow and cleaner phrasing."
      : "Perform a final publish-readiness sweep and remove unresolved placeholders.";

  return [
    stageInstruction,
    "Return only the revised post body. Do not add commentary or code fences.",
    "Do not invent facts, sources, or claims that are not supported by the supplied context.",
    "",
    `Target stage: ${STAGE_LABELS[input.targetStage]}`,
    `Post type: ${input.type}`,
    `Working title: ${input.title?.trim() || "Untitled"}`,
    `Scheduled date: ${input.scheduledDate || "Not scheduled"}`,
    "",
    `Source idea title: ${input.ideaTitle?.trim() || "Untitled"}`,
    "Source idea:",
    input.ideaText.trim(),
    "",
    `Research objective: ${input.researchObjective?.trim() || "None provided"}`,
    "Research notes:",
    input.researchNotes?.trim() || "None yet",
    "",
    "References:",
    references || "- None yet",
    "",
    "Current draft:",
    input.content.trim(),
  ].join("\n");
}

function formatReferences(references?: WorkflowReference[]): string {
  return (references ?? [])
    .map((reference) =>
      reference.title
        ? `- ${reference.title} (${reference.url})`
        : `- ${reference.url}`
    )
    .join("\n");
}
