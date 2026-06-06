"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import {
  ArrowRight,
  Bot,
  CheckCircle2,
  FileText,
  Layers3,
  MoreHorizontal,
  Plus,
  Sparkles,
  Timer,
  WandSparkles,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { WorkflowDraftEditor } from "@/components/WorkflowBoard/WorkflowDraftEditor";
import { WorkflowIdeaModal } from "@/components/WorkflowBoard/WorkflowIdeaModal";
import {
  KanbanBoard,
  KanbanCard,
  KanbanCards,
  KanbanHeader,
  KanbanProvider,
  type DragEndEvent,
} from "@/components/kibo-ui/kanban";
import {
  Choicebox,
  ChoiceboxIndicator,
  ChoiceboxItem,
  ChoiceboxItemDescription,
  ChoiceboxItemHeader,
  ChoiceboxItemTitle,
} from "@/components/kibo-ui/choicebox";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
} from "@/components/kibo-ui/combobox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/Modal";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { getAssistantResponse } from "@/lib/llmClient";
import {
  buildDraftStageAgentPrompt,
  buildOutlineAgentPrompt,
  buildResearchAgentPrompt,
  formatWorkflowTimestamp,
  formatWorkflowTitle,
  getNextDraftStage,
  getStageAgentLabel,
  STAGE_LABELS,
  type DraftStage,
  type ResearchMode,
  type ResearchSource,
} from "@/lib/workflow";
import {
  canDragToColumn,
  WORKFLOW_COLUMN_OVERFLOW_LIMIT,
  WORKFLOW_REVIEW_COLUMNS,
  type WorkflowReviewColumnKey,
} from "@/lib/workflowBoard";

type NewIdeaDestination = "idea" | "backlog";

type IdeaLookupCard = {
  _id: Id<"ideas">;
  title?: string;
  text: string;
  references: Array<{
    url: string;
    title?: string;
    kind?: string;
    addedBy: "user" | "extractor" | "agent";
  }>;
  researchObjective?: string;
  researchNotes?: string;
  researchModes: ResearchMode[];
  researchSources: ResearchSource[];
  updatedAt: number;
  draftCount: number;
};

type IdeaBoardCard = {
  _id: Id<"ideas">;
  title?: string;
  text: string;
  references: Array<{ url: string; title?: string }>;
  draftCount: number;
  lastResearchRunAt?: number;
  lastGateSummary?: string;
  researchObjective?: string;
  updatedAt: number;
};

type DraftBoardCard = {
  _id: Id<"workflowDrafts">;
  title: string;
  preview: string;
  content: string;
  type: "blog" | "linkedin";
  ideaTitle?: string;
  ideaText: string;
  researchObjective?: string;
  researchNotes?: string;
  references: Array<{ url: string; title?: string; kind?: string; addedBy: "user" | "extractor" | "agent" }>;
  scheduledDate?: string;
  publishedAt?: number;
  updatedAt: number;
  lastAgentSummary?: string;
  lastGateSummary?: string;
  stage: DraftStage;
};

type WorkflowIdeaCardRecord = {
  id: string;
  name: string;
  kind: "idea";
  stage: "idea" | "research";
  column: "idea" | "research";
  idea: IdeaBoardCard;
  title: string;
};

type WorkflowDraftCardRecord = {
  id: string;
  name: string;
  kind: "draft";
  stage: DraftStage;
  column: WorkflowReviewColumnKey;
  draft: DraftBoardCard;
};

type WorkflowCardRecord = WorkflowIdeaCardRecord | WorkflowDraftCardRecord;

type GatePayload = {
  summary: string;
  issues: string[];
  recommendedAction: string;
};

type GateState =
  | {
      kind: "idea";
      ideaId: Id<"ideas">;
      gate: GatePayload;
    }
  | {
      kind: "spawn";
      ideaId: Id<"ideas">;
      postType: "blog" | "linkedin";
      gate: GatePayload;
    }
  | {
      kind: "draft";
      draft: DraftBoardCard & { _id: Id<"workflowDrafts"> };
      gate: GatePayload;
    };

type BoardColumn = {
  id: WorkflowReviewColumnKey;
  label: string;
  description: string;
  accentClassName: string;
  cards: WorkflowCardRecord[];
};

const REVIEW_STAGE_PRIORITY: DraftStage[] = [
  "final",
  "seo",
  "copyedit",
  "outline",
  "published",
];

const workflowCardDateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "2-digit",
  day: "2-digit",
});

function formatWorkflowCardDate(timestamp: number) {
  return workflowCardDateFormatter.format(new Date(timestamp));
}

function cloneWorkflowCards(cards: WorkflowCardRecord[]) {
  return cards.map((card) => ({ ...card }));
}

function getDraftCardBody(draft: DraftBoardCard) {
  const preview = draft.preview.trim();
  if (preview) return preview;

  const agentSummary = draft.lastAgentSummary?.trim();
  if (agentSummary) return agentSummary;

  const gateSummary = draft.lastGateSummary?.trim();
  if (gateSummary) return gateSummary;

  return draft.ideaText.trim();
}

export function WorkflowBoard() {
  const board = useQuery(api.workflow.getBoard);
  const createIdea = useMutation(api.workflow.createIdea);
  const moveIdeaToStatus = useMutation(api.workflow.moveIdeaToStatus);
  const advanceIdeaStage = useMutation(api.workflow.advanceIdeaStage);
  const createDraftFromIdea = useMutation(api.workflow.createDraftFromIdea);
  const recordIdeaResearchRun = useMutation(api.workflow.recordIdeaResearchRun);
  const advanceDraft = useMutation(api.workflow.advanceDraft);
  const recordDraftAgentRun = useMutation(api.workflow.recordDraftAgentRun);

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [inspirationDialogOpen, setInspirationDialogOpen] = useState(false);
  const [overflowColumnId, setOverflowColumnId] =
    useState<WorkflowReviewColumnKey | null>(null);
  const [ideaEditorId, setIdeaEditorId] = useState<Id<"ideas"> | null>(null);
  const [draftEditorId, setDraftEditorId] = useState<Id<"workflowDrafts"> | null>(
    null
  );
  const [gateState, setGateState] = useState<GateState | null>(null);
  const [newIdeaTitle, setNewIdeaTitle] = useState("");
  const [newIdeaText, setNewIdeaText] = useState("");
  const [newIdeaDestination, setNewIdeaDestination] =
    useState<NewIdeaDestination>("idea");
  const [creating, setCreating] = useState(false);
  const [runningAgent, setRunningAgent] = useState(false);
  const [selectedInspirationId, setSelectedInspirationId] = useState<string>("");
  const [boardNotice, setBoardNotice] = useState<string | null>(null);
  const [kanbanItems, setKanbanItems] = useState<WorkflowCardRecord[]>([]);
  const [dragSnapshot, setDragSnapshot] = useState<WorkflowCardRecord[] | null>(null);

  const ideaLookup = useMemo(() => {
    const lookup = new Map<Id<"ideas">, IdeaLookupCard>();
    for (const idea of board?.ideaCards || []) lookup.set(idea._id, idea);
    for (const idea of board?.researchCards || []) lookup.set(idea._id, idea);
    return lookup;
  }, [board]);

  const groupedColumns = useMemo<BoardColumn[]>(() => {
    const emptyColumns = WORKFLOW_REVIEW_COLUMNS.map((column) => ({
      ...column,
      cards: [] as WorkflowCardRecord[],
    }));

    if (!board) return emptyColumns;

    const columns = new Map<WorkflowReviewColumnKey, BoardColumn>(
      emptyColumns.map((column) => [column.id, column])
    );

    for (const idea of board.ideaCards) {
      columns.get("idea")?.cards.push({
        id: `idea:${idea._id}`,
        name: formatWorkflowTitle(idea.title, idea.text),
        kind: "idea",
        stage: "idea",
        column: "idea",
        idea,
        title: formatWorkflowTitle(idea.title, idea.text),
      });
    }

    for (const idea of board.researchCards) {
      columns.get("research")?.cards.push({
        id: `idea:${idea._id}`,
        name: formatWorkflowTitle(idea.title, idea.text),
        kind: "idea",
        stage: "research",
        column: "research",
        idea,
        title: formatWorkflowTitle(idea.title, idea.text),
      });
    }

    const draftLookup = new Map<DraftStage, DraftBoardCard[]>(
      board.draftColumns.map((column) => [
        column.stage as DraftStage,
        column.cards as DraftBoardCard[],
      ])
    );

    const orderedDrafts = [
      ...(draftLookup.get("outline") || []).map((draft) => ({
        draft,
        column: "outline" as const,
      })),
      ...REVIEW_STAGE_PRIORITY.flatMap((stage) =>
        stage === "outline" || stage === "published"
          ? []
          : (draftLookup.get(stage) || []).map((draft) => ({
              draft,
              column: "review" as const,
            }))
      ),
      ...(draftLookup.get("published") || []).map((draft) => ({
        draft,
        column: "published" as const,
      })),
    ];

    for (const { draft, column } of orderedDrafts) {
      columns.get(column)?.cards.push({
        id: `draft:${draft._id}`,
        name: draft.title,
        kind: "draft",
        stage: draft.stage,
        column,
        draft,
      });
    }

    return WORKFLOW_REVIEW_COLUMNS.map((column) => columns.get(column.id)!);
  }, [board]);

  const visibleCards = useMemo(
    () =>
      groupedColumns.flatMap((column) =>
        column.cards.slice(0, WORKFLOW_COLUMN_OVERFLOW_LIMIT)
      ),
    [groupedColumns]
  );

  useEffect(() => {
    setKanbanItems(visibleCards);
  }, [visibleCards]);

  useEffect(() => {
    if (!selectedInspirationId && board?.availableIdeas?.length) {
      setSelectedInspirationId(String(board.availableIdeas[0]?._id || ""));
    }
  }, [board?.availableIdeas, selectedInspirationId]);

  const overflowColumn = groupedColumns.find(
    (column) => column.id === overflowColumnId
  );

  const selectedInspiration =
    board?.availableIdeas.find((idea) => String(idea._id) === selectedInspirationId) ||
    board?.availableIdeas[0] ||
    null;

  const inspirationOptions = (board?.availableIdeas || []).map((idea) => ({
    label: formatWorkflowTitle(idea.title, idea.text),
    value: String(idea._id),
  }));

  const clearComposer = () => {
    setNewIdeaTitle("");
    setNewIdeaText("");
    setNewIdeaDestination("idea");
  };

  const handleCreateIdea = async () => {
    if (!newIdeaText.trim()) return;
    setCreating(true);
    try {
      await createIdea({
        title: newIdeaTitle.trim() || undefined,
        text: newIdeaText,
        status: newIdeaDestination,
      });
      clearComposer();
      setCreateDialogOpen(false);
    } finally {
      setCreating(false);
    }
  };

  const handlePromoteInspiration = async (ideaId: Id<"ideas">) => {
    await moveIdeaToStatus({ id: ideaId, status: "idea" });
    setInspirationDialogOpen(false);
  };

  const handleAdvanceIdea = async (ideaId: Id<"ideas">, force = false) => {
    const result = await advanceIdeaStage({ id: ideaId, force });
    if (result?.blocked && result.gate) {
      setGateState({ kind: "idea", ideaId, gate: result.gate });
      return false;
    }
    return true;
  };

  const handleSpawnDraft = async (
    ideaId: Id<"ideas">,
    postType: "blog" | "linkedin",
    force = false,
    seedContent?: string,
    agentSummary?: string
  ) => {
    const result = await createDraftFromIdea({
      ideaId,
      type: postType,
      force,
      seedContent,
      agentSummary,
    });
    if (result?.blocked && result.gate) {
      setGateState({ kind: "spawn", ideaId, postType, gate: result.gate });
      return false;
    }
    if (result?.draftId) {
      setDraftEditorId(result.draftId);
    }
    return true;
  };

  const handleAdvanceDraft = async (
    draftId: Id<"workflowDrafts">,
    force = false
  ) => {
    const result = await advanceDraft({ id: draftId, force });
    if (result?.blocked && result.gate) {
      const draft = groupedColumns
        .flatMap((column) => column.cards)
        .find(
          (card): card is WorkflowDraftCardRecord =>
            card.kind === "draft" && card.draft._id === draftId
        )?.draft;
      if (draft) {
        setGateState({ kind: "draft", draft: draft as DraftBoardCard & { _id: Id<"workflowDrafts"> }, gate: result.gate });
      }
      return false;
    }
    return true;
  };

  const runDraftAgent = async (draft: DraftBoardCard) => {
    const nextStage = getNextDraftStage(draft.stage);
    if (!nextStage) return;

    setRunningAgent(true);
    try {
      const generated = await getAssistantResponse({
        assistantType: draft.type,
        messages: [
          {
            role: "user",
            content: buildDraftStageAgentPrompt({
              type: draft.type,
              targetStage: nextStage,
              title: draft.type === "blog" ? draft.title : undefined,
              content: draft.content,
              scheduledDate: draft.scheduledDate,
              ideaTitle: draft.ideaTitle,
              ideaText: draft.ideaText,
              researchObjective: draft.researchObjective,
              researchNotes: draft.researchNotes,
              references: draft.references,
            }),
          },
        ],
      });

      await recordDraftAgentRun({
        id: draft._id,
        stage: nextStage,
        title: draft.type === "blog" ? draft.title : undefined,
        content: generated,
        summary: `${getStageAgentLabel(nextStage, draft.type)} produced a fresh ${STAGE_LABELS[nextStage].toLowerCase()} pass.`,
      });

      setGateState(null);
      setBoardNotice(`${getStageAgentLabel(nextStage, draft.type)} refreshed ${draft.title}.`);
    } finally {
      setRunningAgent(false);
    }
  };

  const handleRunGateAgent = async () => {
    if (!gateState) return;

    if (gateState.kind === "draft") {
      await runDraftAgent(gateState.draft);
      return;
    }

    const idea = ideaLookup.get(gateState.ideaId);
    if (!idea) return;

    setRunningAgent(true);
    try {
      if (gateState.kind === "idea") {
        const researchNotes = await getAssistantResponse({
          assistantType: "blog",
          messages: [
            {
              role: "user",
              content: buildResearchAgentPrompt({
                title: idea.title,
                text: idea.text,
                researchObjective: idea.researchObjective,
                researchNotes: idea.researchNotes,
                references: idea.references,
              }),
            },
          ],
        });

        await recordIdeaResearchRun({
          id: gateState.ideaId,
          researchObjective: idea.researchObjective,
          researchModes: idea.researchModes,
          researchSources: idea.researchSources,
          researchNotes,
        });
      }

      if (gateState.kind === "spawn") {
        const generated = await getAssistantResponse({
          assistantType: gateState.postType,
          messages: [
            {
              role: "user",
              content: buildOutlineAgentPrompt({
                type: gateState.postType,
                title: idea.title,
                text: idea.text,
                researchObjective: idea.researchObjective,
                researchNotes: idea.researchNotes,
                references: idea.references,
              }),
            },
          ],
        });

        await handleSpawnDraft(
          gateState.ideaId,
          gateState.postType,
          true,
          generated,
          `${getStageAgentLabel("outline", gateState.postType)} created the initial draft.`
        );
      }

      setGateState(null);
    } finally {
      setRunningAgent(false);
    }
  };

  const handleForceAdvance = async () => {
    if (!gateState) return;
    if (gateState.kind === "idea") {
      await handleAdvanceIdea(gateState.ideaId, true);
    } else if (gateState.kind === "spawn") {
      await handleSpawnDraft(gateState.ideaId, gateState.postType, true);
    } else {
      await handleAdvanceDraft(gateState.draft._id, true);
    }
    setGateState(null);
  };

  const handleCardTransition = async (
    card: WorkflowCardRecord,
    targetColumn: WorkflowReviewColumnKey
  ) => {
    if (card.kind === "idea") {
      if (card.stage === "idea" && targetColumn === "research") {
        return await handleAdvanceIdea(card.idea._id);
      }

      setBoardNotice(
        "Research cards spawn draft instances through Blog Draft or LinkedIn Draft."
      );
      return false;
    }

    if (card.stage === "outline" && targetColumn === "review") {
      return await handleAdvanceDraft(card.draft._id);
    }

    if (card.stage === "final" && targetColumn === "published") {
      return await handleAdvanceDraft(card.draft._id);
    }

    if (targetColumn === "published") {
      setBoardNotice("Only final-edit drafts can move into Published.");
      return false;
    }

    setBoardNotice(
      "Advance cards inside Review from the card actions or the full editor."
    );
    return false;
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const activeId = String(event.active.id);
    const overId = event.over ? String(event.over.id) : null;

    if (!dragSnapshot || !overId) {
      setDragSnapshot(null);
      return;
    }

    const activeCard =
      dragSnapshot.find((item) => item.id === activeId) ||
      kanbanItems.find((item) => item.id === activeId);
    const overCard = kanbanItems.find((item) => item.id === overId);
    const targetColumn =
      overCard?.column ||
      WORKFLOW_REVIEW_COLUMNS.find((column) => column.id === overId)?.id ||
      null;

    if (!activeCard || !targetColumn) {
      setKanbanItems(cloneWorkflowCards(dragSnapshot));
      setDragSnapshot(null);
      return;
    }

    if (targetColumn === activeCard.column) {
      setDragSnapshot(null);
      return;
    }

    if (!canDragToColumn(activeCard.stage, targetColumn)) {
      setKanbanItems(cloneWorkflowCards(dragSnapshot));
      if (activeCard.kind === "idea" && activeCard.stage === "research") {
        setBoardNotice(
          "Use Blog Draft or LinkedIn Draft to choose the post instance you want to create."
        );
      } else {
        setBoardNotice("That move is not supported directly from the board.");
      }
      setDragSnapshot(null);
      return;
    }

    try {
      const transitioned = await handleCardTransition(activeCard, targetColumn);
      if (!transitioned) {
        setKanbanItems(cloneWorkflowCards(dragSnapshot));
      }
    } catch {
      setKanbanItems(cloneWorkflowCards(dragSnapshot));
    } finally {
      setDragSnapshot(null);
    }
  };

  return (
    <>
      <section className="space-y-5">
        <div className="overflow-hidden rounded-[28px] border border-border/80 bg-white shadow-[0_24px_60px_rgba(0,21,36,0.06)]">
          <div className="border-b border-border/80 px-5 py-4">
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-sm font-medium text-[var(--ink-black)]">
                  Kanban
                </p>
                <p className="text-sm text-muted-foreground">
                  Drag cards when the move is unambiguous. Use the card actions when the
                  board needs more context than a simple lane change can express.
                </p>
              </div>
            </div>
            {boardNotice ? (
              <div className="mt-4 flex items-center justify-between rounded-2xl border border-[#ffe1b7] bg-[#fff7ea] px-4 py-3 text-sm text-[#8b4513]">
                <span>{boardNotice}</span>
                <Button
                  className="h-auto px-0 text-[#8b4513] hover:bg-transparent"
                  onClick={() => setBoardNotice(null)}
                  variant="ghost"
                >
                  Dismiss
                </Button>
              </div>
            ) : null}
          </div>

          <div className="overflow-x-auto px-4 py-4">
            {board === undefined ? (
              <div className="grid min-w-[1320px] auto-cols-[minmax(260px,1fr)] grid-flow-col gap-0">
                {WORKFLOW_REVIEW_COLUMNS.map((column) => (
                  <div
                    key={column.id}
                    className="h-[480px] animate-pulse border-l border-border/80 bg-muted/20 px-4 first:border-l-0 first:pl-0"
                  />
                ))}
              </div>
            ) : (
              <KanbanProvider<
                WorkflowCardRecord,
                { id: WorkflowReviewColumnKey; name: string }
              >
                className="min-w-[1320px] auto-cols-[minmax(260px,1fr)] gap-0"
                columns={WORKFLOW_REVIEW_COLUMNS.map(({ id, label }) => ({
                  id,
                  name: label,
                }))}
                data={kanbanItems}
                onDataChange={setKanbanItems}
                onDragEnd={handleDragEnd}
                onDragStart={() => setDragSnapshot(cloneWorkflowCards(kanbanItems))}
              >
                {(column) => {
                  const definition = WORKFLOW_REVIEW_COLUMNS.find(
                    (entry) => entry.id === column.id
                  )!;
                  const isIdeaColumn = column.id === "idea";
                  const isFirstColumn = column.id === WORKFLOW_REVIEW_COLUMNS[0]?.id;
                  const columnData = groupedColumns.find(
                    (entry) => entry.id === column.id
                  )!;
                  const hiddenCount = Math.max(
                    columnData.cards.length - WORKFLOW_COLUMN_OVERFLOW_LIMIT,
                    0
                  );

                    return (
                      <KanbanBoard
                        className={`min-h-[520px] overflow-visible rounded-none border-0 bg-transparent pr-4 shadow-none ring-0 ${!isFirstColumn ? "border-l border-border/80 pl-4" : ""}`}
                        id={column.id}
                        key={column.id}
                      >
                      <KanbanHeader className="space-y-3 px-0 py-0">
                        <div className="flex items-start justify-between gap-3 pb-4">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-base font-semibold text-[var(--ink-black)]">
                                {definition.label}
                              </p>
                              <Badge
                                className="rounded-full bg-muted text-muted-foreground shadow-none"
                                variant="secondary"
                              >
                                {columnData.cards.length}
                              </Badge>
                            </div>
                            <p className="mt-1 text-sm leading-6 text-muted-foreground">
                              {definition.description}
                            </p>
                          </div>
                        </div>

                        {isIdeaColumn ? (
                          <div className="grid gap-2 pb-4">
                            <Button
                              className="justify-start rounded-2xl"
                              onClick={() => setCreateDialogOpen(true)}
                            >
                              <Plus className="size-4" />
                              Add Idea Card
                            </Button>
                            <Button
                              className="justify-start rounded-2xl"
                              onClick={() => {
                                setSelectedInspirationId(
                                  String(board?.availableIdeas[0]?._id || "")
                                );
                                setInspirationDialogOpen(true);
                              }}
                              variant="outline"
                            >
                              <Layers3 className="size-4" />
                              Use Inspiration
                            </Button>
                          </div>
                        ) : null}
                      </KanbanHeader>

                      {columnData.cards.length === 0 ? (
                        <div className="flex-1">
                          <p className="text-sm text-muted-foreground">
                            Nothing here right now.
                          </p>
                        </div>
                      ) : (
                        <>
                          <KanbanCards<WorkflowCardRecord>
                            className="gap-3 p-0"
                            id={column.id}
                          >
                            {(item) => (
                              <KanbanCard
                                className="rounded-[20px] border-0 bg-transparent p-0 shadow-none"
                                column={item.column}
                                id={item.id}
                                key={item.id}
                                name={item.name}
                              >
                                <BoardCard
                                  card={item}
                                  onAdvanceDraft={handleAdvanceDraft}
                                  onAdvanceIdea={handleAdvanceIdea}
                                  onArchiveIdea={async (ideaId) => {
                                    await moveIdeaToStatus({ id: ideaId, status: "archived" });
                                  }}
                                  onMoveIdeaToBacklog={async (ideaId) => {
                                    await moveIdeaToStatus({ id: ideaId, status: "backlog" });
                                  }}
                                  onOpenDraft={(draftId) => setDraftEditorId(draftId)}
                                  onOpenIdea={(ideaId) => setIdeaEditorId(ideaId)}
                                  onOverflow={() => setOverflowColumnId(column.id)}
                                  onPublishDraft={handleAdvanceDraft}
                                  onRunDraftAgent={runDraftAgent}
                                  onSpawnDraft={handleSpawnDraft}
                                />
                              </KanbanCard>
                            )}
                          </KanbanCards>

                          {hiddenCount > 0 ? (
                            <div className="mt-3">
                              <Button
                                className="w-full rounded-full"
                                onClick={() => setOverflowColumnId(column.id)}
                                variant="outline"
                              >
                                +{hiddenCount} more
                              </Button>
                            </div>
                          ) : null}
                        </>
                      )}
                    </KanbanBoard>
                  );
                }}
              </KanbanProvider>
            )}
          </div>
        </div>
      </section>

      <Modal
        bodyClassName="space-y-4"
        onClose={() => {
          clearComposer();
          setCreateDialogOpen(false);
        }}
        open={createDialogOpen}
        title="Add Idea Card"
      >
        <div className="space-y-2">
          <Label htmlFor="workflow-new-title">Working Title</Label>
          <Input
            id="workflow-new-title"
            onChange={(event) => setNewIdeaTitle(event.target.value)}
            placeholder="Optional title"
            value={newIdeaTitle}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="workflow-new-idea">Idea</Label>
          <Textarea
            id="workflow-new-idea"
            onChange={(event) => setNewIdeaText(event.target.value)}
            placeholder="Capture the thought that should become a workflow card."
            rows={7}
            value={newIdeaText}
          />
        </div>

        <div className="space-y-3">
          <Label>Where should this go first?</Label>
          <Choicebox
            onValueChange={(value) =>
              setNewIdeaDestination(value as NewIdeaDestination)
            }
            value={newIdeaDestination}
          >
            <div className="grid gap-3 md:grid-cols-2">
              <ChoiceboxItem
                className="rounded-[20px] border border-border/80 bg-white p-4"
                id="destination-idea"
                value="idea"
              >
                <ChoiceboxIndicator id="destination-idea" />
                <ChoiceboxItemHeader>
                  <ChoiceboxItemTitle>Add to Idea column</ChoiceboxItemTitle>
                  <ChoiceboxItemDescription>
                    This enters the active board immediately.
                  </ChoiceboxItemDescription>
                </ChoiceboxItemHeader>
              </ChoiceboxItem>

              <ChoiceboxItem
                className="rounded-[20px] border border-border/80 bg-white p-4"
                id="destination-backlog"
                value="backlog"
              >
                <ChoiceboxIndicator id="destination-backlog" />
                <ChoiceboxItemHeader>
                  <ChoiceboxItemTitle>Save as inspiration</ChoiceboxItemTitle>
                  <ChoiceboxItemDescription>
                    Keep it out of column one until you intentionally select it.
                  </ChoiceboxItemDescription>
                </ChoiceboxItemHeader>
              </ChoiceboxItem>
            </div>
          </Choicebox>
        </div>

        <div className="flex justify-end gap-2">
          <Button onClick={() => setCreateDialogOpen(false)} variant="outline">
            Cancel
          </Button>
          <Button
            disabled={creating || !newIdeaText.trim()}
            onClick={handleCreateIdea}
          >
            <Plus className="size-4" />
            {creating ? "Saving..." : "Create Idea"}
          </Button>
        </div>
      </Modal>

      <Modal
        bodyClassName="space-y-4"
        onClose={() => setInspirationDialogOpen(false)}
        open={inspirationDialogOpen}
        title="Use Inspiration"
      >
        <div className="space-y-2">
          <Label>Saved inspiration</Label>
          <Combobox
            data={inspirationOptions}
            onValueChange={setSelectedInspirationId}
            type="idea"
            value={selectedInspirationId}
          >
            <ComboboxTrigger className="w-full justify-between rounded-xl" />
            <ComboboxContent>
              <ComboboxInput />
              <ComboboxList>
                <ComboboxEmpty>No saved ideas found.</ComboboxEmpty>
                <ComboboxGroup>
                  {inspirationOptions.map((option) => (
                    <ComboboxItem key={option.value} value={option.value}>
                      {option.label}
                    </ComboboxItem>
                  ))}
                </ComboboxGroup>
              </ComboboxList>
            </ComboboxContent>
          </Combobox>
        </div>

        {selectedInspiration ? (
          <Card className="rounded-[24px] border border-border/80 bg-[#fcfaf6] shadow-none">
            <CardHeader className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="font-forum text-[1.7rem] leading-none text-[var(--ink-black)]">
                  {formatWorkflowTitle(
                    selectedInspiration.title,
                    selectedInspiration.text
                  )}
                </CardTitle>
                <Badge className="rounded-full" variant="secondary">
                  {selectedInspiration.referencesCount} refs
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="line-clamp-4 text-sm leading-6 text-muted-foreground">
                {selectedInspiration.text}
              </p>
              <p className="text-xs text-muted-foreground">
                Updated {formatWorkflowTimestamp(selectedInspiration.updatedAt)}
              </p>
            </CardContent>
            <CardFooter className="justify-end gap-2 border-t border-border/80 bg-white/80">
              <Button onClick={() => setInspirationDialogOpen(false)} variant="outline">
                Cancel
              </Button>
              <Button
                onClick={() => handlePromoteInspiration(selectedInspiration._id)}
              >
                Select
              </Button>
            </CardFooter>
          </Card>
        ) : (
          <div className="rounded-[24px] border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
            No inspiration items are waiting. Save a new idea to inspiration first.
          </div>
        )}
      </Modal>

      <WorkflowIdeaModal
        ideaId={ideaEditorId}
        onClose={() => setIdeaEditorId(null)}
        open={Boolean(ideaEditorId)}
      />

      <WorkflowDraftEditor
        draftId={draftEditorId}
        onClose={() => setDraftEditorId(null)}
        open={Boolean(draftEditorId)}
      />

      <Modal
        bodyClassName="space-y-4"
        onClose={() => setOverflowColumnId(null)}
        open={Boolean(overflowColumn)}
        size="xl"
        title={overflowColumn ? `${overflowColumn.label} overflow` : "Overflow"}
      >
        {overflowColumn ? (
          <ScrollArea className="max-h-[70dvh] pr-4">
            <div className="space-y-3">
              {overflowColumn.cards.map((card) => (
                <BoardCard
                  card={card}
                  key={`${overflowColumn.id}-${card.id}`}
                  onAdvanceDraft={handleAdvanceDraft}
                  onAdvanceIdea={handleAdvanceIdea}
                  onArchiveIdea={async (ideaId) => {
                    await moveIdeaToStatus({ id: ideaId, status: "archived" });
                  }}
                  onMoveIdeaToBacklog={async (ideaId) => {
                    await moveIdeaToStatus({ id: ideaId, status: "backlog" });
                  }}
                  onOpenDraft={(draftId) => setDraftEditorId(draftId)}
                  onOpenIdea={(ideaId) => setIdeaEditorId(ideaId)}
                  onPublishDraft={handleAdvanceDraft}
                  onRunDraftAgent={runDraftAgent}
                  onSpawnDraft={handleSpawnDraft}
                />
              ))}
            </div>
          </ScrollArea>
        ) : null}
      </Modal>

      <Modal
        bodyClassName="space-y-4"
        onClose={() => setGateState(null)}
        open={Boolean(gateState)}
        title={gateState ? `${gateState.gate.recommendedAction} Recommended` : "Gate Check"}
      >
        {gateState ? (
          <>
            <div className="rounded-[20px] border border-[#ffe1b7] bg-[#fff7ea] px-4 py-3 text-sm text-[#8b4513]">
              {gateState.gate.summary}
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium text-[var(--ink-black)]">
                What still looks weak
              </p>
              <ul className="space-y-2 text-sm text-muted-foreground">
                {gateState.gate.issues.map((issue) => (
                  <li key={issue}>• {issue}</li>
                ))}
              </ul>
            </div>

            <div className="flex flex-wrap justify-end gap-2">
              <Button onClick={() => setGateState(null)} variant="outline">
                Cancel
              </Button>
              <Button
                disabled={runningAgent}
                onClick={handleRunGateAgent}
                variant="outline"
              >
                <Bot className="size-4" />
                {runningAgent ? "Running..." : gateState.gate.recommendedAction}
              </Button>
              <Button onClick={handleForceAdvance}>
                <ArrowRight className="size-4" />
                Move Anyway
              </Button>
            </div>
          </>
        ) : null}
      </Modal>
    </>
  );
}

function BoardCard({
  card,
  onOpenIdea,
  onOpenDraft,
  onAdvanceIdea,
  onAdvanceDraft,
  onPublishDraft,
  onSpawnDraft,
  onRunDraftAgent,
  onMoveIdeaToBacklog,
  onArchiveIdea,
  onOverflow,
}: {
  card: WorkflowCardRecord;
  onOpenIdea: (ideaId: Id<"ideas">) => void;
  onOpenDraft: (draftId: Id<"workflowDrafts">) => void;
  onAdvanceIdea: (ideaId: Id<"ideas">) => Promise<boolean>;
  onAdvanceDraft: (draftId: Id<"workflowDrafts">) => Promise<boolean>;
  onPublishDraft: (draftId: Id<"workflowDrafts">) => Promise<boolean>;
  onSpawnDraft: (
    ideaId: Id<"ideas">,
    postType: "blog" | "linkedin"
  ) => Promise<boolean>;
  onRunDraftAgent: (draft: DraftBoardCard) => Promise<void>;
  onMoveIdeaToBacklog?: (ideaId: Id<"ideas">) => Promise<void>;
  onArchiveIdea?: (ideaId: Id<"ideas">) => Promise<void>;
  onOverflow?: () => void;
}) {
  const stopCardAction = (event: { stopPropagation: () => void }) => {
    event.stopPropagation();
  };

  const cardButtonClass =
    "border-black/10 bg-white text-[var(--ink-black)] shadow-[0_4px_14px_rgba(0,21,36,0.08)] hover:bg-white";
  const cardOutlineButtonClass =
    "border-black/10 bg-white/80 text-[var(--ink-black)] shadow-[0_4px_14px_rgba(0,21,36,0.06)] hover:bg-white";
  const cardMetaClass =
    "inline-flex items-center gap-1.5 text-[11px] font-medium tabular-nums text-muted-foreground";

  if (card.kind === "idea") {
    const isResearch = card.stage === "research";

    return (
      <Card
        className={`min-w-0 rounded-[20px] border py-0 shadow-[0_8px_18px_rgba(0,21,36,0.06)] ${
          isResearch
            ? "border-[#b8dce1] bg-[#f4fbfd]"
            : "border-[#ffd59c] bg-[#fff8ec]"
        }`}
        size="sm"
      >
        <CardHeader className="gap-2.5 border-b border-border/70 px-4 pt-2.5 pb-3">
          <div className="flex items-start justify-between gap-3">
            <span className={cardMetaClass}>
              <Timer className="size-3" />
              {formatWorkflowCardDate(card.idea.updatedAt)}
            </span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  data-no-dnd="true"
                  className="text-muted-foreground hover:bg-black/5"
                  onClick={stopCardAction}
                  onPointerDown={stopCardAction}
                  size="icon-sm"
                  variant="ghost"
                >
                  <MoreHorizontal className="size-4" />
                  <span className="sr-only">Open idea actions</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => onOpenIdea(card.idea._id)}>
                  Open workspace
                </DropdownMenuItem>
                {card.stage === "idea" ? (
                  <DropdownMenuItem onClick={() => onAdvanceIdea(card.idea._id)}>
                    Move to Research
                  </DropdownMenuItem>
                ) : null}
                {onMoveIdeaToBacklog ? (
                  <DropdownMenuItem onClick={() => onMoveIdeaToBacklog(card.idea._id)}>
                    Send to Inspiration
                  </DropdownMenuItem>
                ) : null}
                {onArchiveIdea ? (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => onArchiveIdea(card.idea._id)}>
                      Archive
                    </DropdownMenuItem>
                  </>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <CardTitle
            className="w-full truncate pr-1 text-sm leading-5 font-medium text-[var(--ink-black)]"
            title={card.title}
          >
            {card.title}
          </CardTitle>
        </CardHeader>

        <CardContent className="py-2.5">
          <p
            className="line-clamp-3 h-[3.75rem] overflow-hidden break-words text-sm leading-5 text-muted-foreground [overflow-wrap:anywhere]"
            title={card.idea.text}
          >
            {card.idea.text}
          </p>
        </CardContent>

        <CardFooter className="flex-col items-stretch gap-2 border-t border-border/70 bg-transparent">
          {card.stage === "idea" ? (
            <div className="grid w-full grid-cols-[0.92fr_1.08fr] gap-2">
              <Button
                data-no-dnd="true"
                className={`w-full justify-center ${cardButtonClass}`}
                onClick={(event) => {
                  stopCardAction(event);
                  onOpenIdea(card.idea._id);
                }}
                onPointerDown={stopCardAction}
                variant="secondary"
              >
                Open
              </Button>
              <Button
                data-no-dnd="true"
                className="w-full justify-center"
                onClick={(event) => {
                  stopCardAction(event);
                  onAdvanceIdea(card.idea._id);
                }}
                onPointerDown={stopCardAction}
              >
                <ArrowRight className="size-4" />
                Move
              </Button>
            </div>
          ) : (
            <div className="grid w-full gap-2">
              <Button
                data-no-dnd="true"
                className={`w-full justify-center ${cardButtonClass}`}
                onClick={(event) => {
                  stopCardAction(event);
                  onOpenIdea(card.idea._id);
                }}
                onPointerDown={stopCardAction}
                variant="secondary"
              >
                Open
              </Button>
              <Button
                data-no-dnd="true"
                className={`w-full justify-center ${cardOutlineButtonClass}`}
                onClick={(event) => {
                  stopCardAction(event);
                  onSpawnDraft(card.idea._id, "blog");
                }}
                onPointerDown={stopCardAction}
                variant="outline"
              >
                <FileText className="size-4" />
                Blog Draft
              </Button>
              <Button
                data-no-dnd="true"
                className={`w-full justify-center ${cardOutlineButtonClass}`}
                onClick={(event) => {
                  stopCardAction(event);
                  onSpawnDraft(card.idea._id, "linkedin");
                }}
                onPointerDown={stopCardAction}
                variant="outline"
              >
                <Sparkles className="size-4" />
                LinkedIn Draft
              </Button>
            </div>
          )}
        </CardFooter>
      </Card>
    );
  }

  const nextStage = getNextDraftStage(card.stage);
  const canPublish = card.stage === "final";
  const draftBody = getDraftCardBody(card.draft);

  return (
    <Card
      className="min-w-0 rounded-[20px] border border-[#d8dff2]/85 bg-[#f8f9ff] py-0 shadow-[0_8px_18px_rgba(0,21,36,0.06)]"
      size="sm"
    >
        <CardHeader className="gap-2.5 border-b border-border/70 px-4 pt-2.5 pb-3">
        <div className="flex items-start justify-between gap-3">
          <span className={cardMetaClass}>
            <Timer className="size-3" />
            {formatWorkflowCardDate(card.draft.updatedAt)}
          </span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                data-no-dnd="true"
                className="text-muted-foreground hover:bg-black/5"
                onClick={stopCardAction}
                onPointerDown={stopCardAction}
                size="icon-sm"
                variant="ghost"
              >
                <MoreHorizontal className="size-4" />
                <span className="sr-only">Open draft actions</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onOpenDraft(card.draft._id)}>
                Open workspace
              </DropdownMenuItem>
              {nextStage ? (
                <DropdownMenuItem onClick={() => onRunDraftAgent(card.draft)}>
                  {getStageAgentLabel(nextStage, card.draft.type)}
                </DropdownMenuItem>
              ) : null}
              {card.stage === "final" ? (
                <DropdownMenuItem onClick={() => onPublishDraft(card.draft._id)}>
                  Publish
                </DropdownMenuItem>
              ) : nextStage ? (
                <DropdownMenuItem onClick={() => onAdvanceDraft(card.draft._id)}>
                  Advance to {STAGE_LABELS[nextStage]}
                </DropdownMenuItem>
              ) : null}
              {onOverflow ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={onOverflow}>
                    View full column
                  </DropdownMenuItem>
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <CardTitle
          className="w-full truncate pr-1 text-sm leading-5 font-medium text-[var(--ink-black)]"
          title={card.draft.title}
        >
          {card.draft.title}
        </CardTitle>
      </CardHeader>

      <CardContent className="py-2.5">
        <p
          className="line-clamp-3 h-[3.75rem] overflow-hidden break-words text-sm leading-5 text-muted-foreground [overflow-wrap:anywhere]"
          title={draftBody}
        >
          {draftBody}
        </p>
      </CardContent>

      <CardFooter className="flex-col items-stretch gap-2 border-t border-border/70 bg-transparent">
        <Button
          data-no-dnd="true"
          className={`w-full justify-center ${cardButtonClass}`}
          onClick={(event) => {
            stopCardAction(event);
            onOpenDraft(card.draft._id);
          }}
          onPointerDown={stopCardAction}
          variant="secondary"
        >
          Open
        </Button>
        <div className="grid w-full gap-2">
          {nextStage ? (
            <Button
              data-no-dnd="true"
              className={`w-full justify-center ${cardOutlineButtonClass}`}
              onClick={(event) => {
                stopCardAction(event);
                onRunDraftAgent(card.draft);
              }}
              onPointerDown={stopCardAction}
              variant="outline"
            >
              <Bot className="size-4" />
              Agent
            </Button>
          ) : null}
          {canPublish ? (
            <Button
              data-no-dnd="true"
              className="w-full justify-center"
              onClick={(event) => {
                stopCardAction(event);
                onPublishDraft(card.draft._id);
              }}
              onPointerDown={stopCardAction}
            >
              <CheckCircle2 className="size-4" />
              Publish
            </Button>
          ) : nextStage ? (
            <Button
              data-no-dnd="true"
              className="w-full justify-center"
              onClick={(event) => {
                stopCardAction(event);
                onAdvanceDraft(card.draft._id);
              }}
              onPointerDown={stopCardAction}
            >
              {card.stage === "outline" ? (
                <WandSparkles className="size-4" />
              ) : (
                <ArrowRight className="size-4" />
              )}
              {card.stage === "outline" ? "Send to Review" : "Advance"}
            </Button>
          ) : null}
        </div>
      </CardFooter>
    </Card>
  );
}
