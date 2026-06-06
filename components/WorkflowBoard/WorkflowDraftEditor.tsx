"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import {
  ArrowRight,
  Bot,
  CalendarDays,
  CheckCircle2,
  Clock3,
} from "lucide-react";
import type { Id } from "@/convex/_generated/dataModel";
import { api } from "@/convex/_generated/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/Modal";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { getAssistantResponse } from "@/lib/llmClient";
import {
  STAGE_LABELS,
  buildDraftStageAgentPrompt,
  formatWorkflowTimestamp,
  getNextDraftStage,
  getStageAgentLabel,
} from "@/lib/workflow";

interface WorkflowDraftEditorProps {
  open: boolean;
  draftId: Id<"workflowDrafts"> | null;
  onClose: () => void;
}

interface DraftGateState {
  stage: string;
  summary: string;
  issues: string[];
  recommendedAction: string;
}

export function WorkflowDraftEditor({
  open,
  draftId,
  onClose,
}: WorkflowDraftEditorProps) {
  const data = useQuery(api.workflow.getDraftForEditor, draftId ? { id: draftId } : "skip");
  const updateDraftContent = useMutation(api.workflow.updateDraftContent);
  const advanceDraft = useMutation(api.workflow.advanceDraft);
  const recordDraftAgentRun = useMutation(api.workflow.recordDraftAgentRun);

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [scheduledDate, setScheduledDate] = useState("");
  const [scheduledTime, setScheduledTime] = useState("");
  const [stageNotes, setStageNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [advancing, setAdvancing] = useState(false);
  const [runningAgent, setRunningAgent] = useState(false);
  const [gateState, setGateState] = useState<DraftGateState | null>(null);

  useEffect(() => {
    if (!data) return;
    setTitle(data.post.title || "");
    setContent(data.post.content);
    setScheduledDate(data.post.scheduledDate || "");
    setScheduledTime(data.post.scheduledTime || "");
    setStageNotes(data.draft.stageNotes || "");
  }, [data]);

  const nextStage = data ? getNextDraftStage(data.draft.stage) : null;
  const nextAgentLabel = nextStage
    ? getStageAgentLabel(nextStage, data?.draft.type)
    : null;

  const persistDraft = async () => {
    if (!draftId) return;
    await updateDraftContent({
      id: draftId,
      title: title.trim() || undefined,
      content,
      scheduledDate: scheduledDate || undefined,
      scheduledTime: scheduledTime || undefined,
      stageNotes: stageNotes.trim() || undefined,
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await persistDraft();
    } finally {
      setSaving(false);
    }
  };

  const handleAdvance = async (force = false) => {
    if (!draftId) return;
    setAdvancing(true);
    try {
      await persistDraft();
      const result = await advanceDraft({ id: draftId, force });
      if (result?.blocked && result.gate) {
        setGateState(result.gate);
      } else {
        setGateState(null);
      }
    } finally {
      setAdvancing(false);
    }
  };

  const handleRunAgent = async () => {
    if (!draftId || !data || !nextStage) return;
    setRunningAgent(true);
    try {
      await persistDraft();
      const generated = await getAssistantResponse({
        assistantType: data.draft.type,
        messages: [
          {
            role: "user",
            content: buildDraftStageAgentPrompt({
              type: data.draft.type,
              targetStage: nextStage,
              title: title.trim() || undefined,
              content,
              scheduledDate: scheduledDate || undefined,
              ideaTitle: data.idea.title,
              ideaText: data.idea.text,
              researchObjective: data.idea.researchObjective,
              researchNotes: data.idea.researchNotes,
              references: data.idea.references,
            }),
          },
        ],
      });

      await recordDraftAgentRun({
        id: draftId,
        stage: nextStage,
        title: title.trim() || undefined,
        content: generated,
        summary: `${getStageAgentLabel(nextStage, data.draft.type)} produced a fresh ${STAGE_LABELS[nextStage].toLowerCase()} pass.`,
      });

      setContent(generated);
      setGateState(null);
    } finally {
      setRunningAgent(false);
    }
  };

  const footer = data ? (
    <div className="flex w-full flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex flex-wrap gap-2">
        <Badge className="rounded-full bg-muted text-muted-foreground" variant="secondary">
          {data.draft.type === "blog" ? "Blog draft" : "LinkedIn draft"}
        </Badge>
        <Badge className="rounded-full bg-[#eef2ff] text-[#4257a0]" variant="secondary">
          {STAGE_LABELS[data.draft.stage]}
        </Badge>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button onClick={onClose} variant="outline">
          Close
        </Button>
        {nextStage ? (
          <Button
            disabled={runningAgent || advancing}
            onClick={handleRunAgent}
            variant="outline"
          >
            <Bot className="size-4" />
            {runningAgent ? "Running..." : nextAgentLabel}
          </Button>
        ) : null}
        <Button disabled={saving || advancing} onClick={handleSave} variant="outline">
          <CheckCircle2 className="size-4" />
          {saving ? "Saving..." : "Save"}
        </Button>
        {nextStage ? (
          <Button
            disabled={advancing || runningAgent}
            onClick={() => handleAdvance(false)}
          >
            <ArrowRight className="size-4" />
            {advancing ? "Checking..." : `Advance to ${STAGE_LABELS[nextStage]}`}
          </Button>
        ) : null}
      </div>
    </div>
  ) : undefined;

  return (
    <>
      <Modal
        bodyClassName="min-h-0 overflow-hidden p-0"
        footer={footer}
        onClose={onClose}
        open={open}
        panelClassName="h-[calc(100dvh-2rem)]"
        size="full"
        title={data ? STAGE_LABELS[data.draft.stage] : "Draft Workspace"}
      >
        {data === undefined ? (
          <div className="p-6 text-sm text-muted-foreground">Loading draft...</div>
        ) : !data ? (
          <div className="p-6 text-sm text-muted-foreground">Draft not found.</div>
        ) : (
          <div className="grid h-full min-h-0 overflow-hidden lg:grid-cols-[minmax(0,1fr)_360px]">
            <div className="min-h-0 min-w-0 border-r border-border/80 bg-white">
              <ScrollArea className="h-full min-h-0">
                <div className="space-y-5 px-6 py-6">
                  <Card className="rounded-[28px] border border-border/80 bg-[linear-gradient(135deg,#061b29_0%,#124159_100%)] text-white shadow-none">
                    <CardHeader className="gap-3">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="space-y-2">
                          <Badge className="rounded-full bg-white/10 text-white" variant="secondary">
                            Full-screen workflow editor
                          </Badge>
                          <CardTitle className="font-forum text-[2rem] leading-none text-white">
                            {STAGE_LABELS[data.draft.stage]}
                          </CardTitle>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Badge className="rounded-full bg-white/12 text-white" variant="secondary">
                            {data.draft.type === "blog" ? "Blog" : "LinkedIn"}
                          </Badge>
                          <Badge className="rounded-full bg-white/12 text-white" variant="secondary">
                            Updated {formatWorkflowTimestamp(data.draft.updatedAt)}
                          </Badge>
                        </div>
                      </div>
                      <p className="text-sm leading-6 text-white/80">
                        Use the board to triage, then finish substantive work here without the
                        lane layout getting in the way.
                      </p>
                    </CardHeader>
                  </Card>

                  <Card className="rounded-[28px] border border-border/80 bg-white shadow-none">
                    <CardHeader>
                      <CardTitle className="text-base text-[var(--ink-black)]">
                        Draft content
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="grid gap-5 pb-6">
                      {data.draft.type === "blog" ? (
                        <div className="space-y-2">
                          <Label htmlFor="draft-title">Working Title</Label>
                          <Input
                            id="draft-title"
                            onChange={(event) => setTitle(event.target.value)}
                            placeholder="Untitled blog draft"
                            value={title}
                          />
                        </div>
                      ) : null}

                      <div className="grid gap-5 md:grid-cols-2">
                        <div className="space-y-2">
                          <Label htmlFor="draft-date">Publish Date</Label>
                          <div className="relative">
                            <CalendarDays className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                            <Input
                              className="pl-10"
                              id="draft-date"
                              onChange={(event) => setScheduledDate(event.target.value)}
                              type="date"
                              value={scheduledDate}
                            />
                          </div>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="draft-time">Publish Time</Label>
                          <div className="relative">
                            <Clock3 className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                            <Input
                              className="pl-10"
                              id="draft-time"
                              onChange={(event) => setScheduledTime(event.target.value)}
                              type="time"
                              value={scheduledTime}
                            />
                          </div>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="draft-content">Draft Body</Label>
                        <Textarea
                          id="draft-content"
                          onChange={(event) => setContent(event.target.value)}
                          rows={22}
                          value={content}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="draft-stage-notes">Stage Notes</Label>
                        <Textarea
                          id="draft-stage-notes"
                          onChange={(event) => setStageNotes(event.target.value)}
                          placeholder="Capture feedback, open questions, or direction for the next pass."
                          rows={5}
                          value={stageNotes}
                        />
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </ScrollArea>
            </div>

            <aside className="min-h-0 min-w-0 bg-[#f7f4ee]">
              <ScrollArea className="h-full min-h-0">
                <div className="space-y-4 px-5 py-6">
                  <Card className="rounded-[24px] border border-border/80 bg-white shadow-none">
                    <CardHeader>
                      <CardTitle className="text-base text-[var(--ink-black)]">
                        Source idea
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4 pb-6">
                      <div className="rounded-2xl bg-[#faf7f2] px-4 py-4">
                        <p className="font-medium text-[var(--ink-black)]">
                          {data.idea.title || "Untitled idea"}
                        </p>
                        <p className="mt-2 text-sm leading-6 text-muted-foreground">
                          {data.idea.text}
                        </p>
                      </div>
                      <div className="space-y-2 text-sm text-muted-foreground">
                        <p>
                          <span className="font-medium text-[var(--ink-black)]">
                            Research objective:
                          </span>{" "}
                          {data.idea.researchObjective || "None yet"}
                        </p>
                        <p className="leading-6">
                          <span className="font-medium text-[var(--ink-black)]">
                            Research notes:
                          </span>{" "}
                          {data.idea.researchNotes || "None yet"}
                        </p>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="rounded-[24px] border border-border/80 bg-white shadow-none">
                    <CardHeader>
                      <CardTitle className="text-base text-[var(--ink-black)]">
                        References
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 pb-6">
                      {data.idea.references.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-border bg-muted/40 px-4 py-4 text-sm text-muted-foreground">
                          No references attached yet.
                        </div>
                      ) : (
                        data.idea.references.map((reference) => (
                          <a
                            className="block rounded-2xl border border-border/80 bg-[#faf7f2] px-4 py-3 transition-colors hover:border-[#15616d]/30 hover:bg-[#f4fbfc]"
                            href={reference.url}
                            key={reference.url}
                            rel="noreferrer"
                            target="_blank"
                          >
                            <p className="text-sm font-medium text-[var(--ink-black)]">
                              {reference.title || reference.url}
                            </p>
                            {reference.title ? (
                              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                                {reference.url}
                              </p>
                            ) : null}
                          </a>
                        ))
                      )}
                    </CardContent>
                  </Card>

                  {(data.draft.lastAgentSummary || data.draft.lastGateSummary) ? (
                    <Card className="rounded-[24px] border border-border/80 bg-white shadow-none">
                      <CardHeader>
                        <CardTitle className="text-base text-[var(--ink-black)]">
                          Latest workflow signals
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3 pb-6">
                        {data.draft.lastAgentSummary ? (
                          <p className="rounded-2xl bg-[#eef8fb] px-4 py-3 text-sm text-[#15616d]">
                            {data.draft.lastAgentSummary}
                          </p>
                        ) : null}
                        {data.draft.lastGateSummary ? (
                          <p className="rounded-2xl bg-[#fff7ea] px-4 py-3 text-sm text-[#8b4513]">
                            {data.draft.lastGateSummary}
                          </p>
                        ) : null}
                      </CardContent>
                    </Card>
                  ) : null}
                </div>
              </ScrollArea>
            </aside>
          </div>
        )}
      </Modal>

      <Modal onClose={() => setGateState(null)} open={Boolean(gateState)} title="Gate Check">
        {gateState ? (
          <div className="space-y-4">
            <div className="rounded-[20px] border border-[#ffe1b7] bg-[#fff7ea] px-4 py-3 text-sm text-[#8b4513]">
              {gateState.summary}
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium text-[var(--ink-black)]">
                What still looks weak
              </p>
              <ul className="space-y-2 text-sm text-muted-foreground">
                {gateState.issues.map((issue) => (
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
                onClick={handleRunAgent}
                variant="outline"
              >
                <Bot className="size-4" />
                {runningAgent ? "Running..." : gateState.recommendedAction}
              </Button>
              <Button disabled={advancing} onClick={() => handleAdvance(true)}>
                <ArrowRight className="size-4" />
                Move Anyway
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>
    </>
  );
}
