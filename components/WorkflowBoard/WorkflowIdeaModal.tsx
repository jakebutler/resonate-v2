"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import {
  Archive,
  ArrowLeft,
  BookOpenText,
  Compass,
  Link2,
  Plus,
  SearchCheck,
  Sparkles,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/Modal";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import {
  RESEARCH_MODES,
  RESEARCH_SOURCES,
  formatWorkflowTimestamp,
  type ResearchMode,
  type ResearchSource,
} from "@/lib/workflow";

interface WorkflowIdeaModalProps {
  open: boolean;
  ideaId: Id<"ideas"> | null;
  onClose: () => void;
}

export function WorkflowIdeaModal({
  open,
  ideaId,
  onClose,
}: WorkflowIdeaModalProps) {
  const idea = useQuery(api.workflow.getIdea, ideaId ? { id: ideaId } : "skip");
  const updateIdea = useMutation(api.workflow.updateIdea);
  const addIdeaReference = useMutation(api.workflow.addIdeaReference);
  const extractIdeaReferences = useMutation(api.workflow.extractIdeaReferences);
  const moveIdeaToStatus = useMutation(api.workflow.moveIdeaToStatus);

  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [researchObjective, setResearchObjective] = useState("");
  const [researchNotes, setResearchNotes] = useState("");
  const [researchModes, setResearchModes] = useState<ResearchMode[]>([]);
  const [researchSources, setResearchSources] = useState<ResearchSource[]>([]);
  const [referenceUrl, setReferenceUrl] = useState("");
  const [referenceTitle, setReferenceTitle] = useState("");
  const [referenceKind, setReferenceKind] = useState("");
  const [saving, setSaving] = useState(false);
  const [extracting, setExtracting] = useState(false);

  useEffect(() => {
    if (!idea) return;
    setTitle(idea.title || "");
    setText(idea.text);
    setResearchObjective(idea.researchObjective || "");
    setResearchNotes(idea.researchNotes || "");
    setResearchModes(idea.researchModes || []);
    setResearchSources(idea.researchSources || []);
  }, [idea]);

  const toggleSelection = <T extends string>(
    value: T,
    current: T[],
    setter: (next: T[]) => void
  ) => {
    setter(
      current.includes(value)
        ? current.filter((entry) => entry !== value)
        : [...current, value]
    );
  };

  const handleSave = async () => {
    if (!ideaId) return;
    setSaving(true);
    try {
      await updateIdea({
        id: ideaId,
        title: title.trim() || undefined,
        text,
        researchObjective: researchObjective.trim() || undefined,
        researchNotes: researchNotes.trim() || undefined,
        researchModes,
        researchSources,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const handleAddReference = async () => {
    if (!ideaId || !referenceUrl.trim()) return;
    await addIdeaReference({
      id: ideaId,
      reference: {
        url: referenceUrl.trim(),
        title: referenceTitle.trim() || undefined,
        kind: referenceKind.trim() || undefined,
        addedBy: "user",
      },
    });
    setReferenceUrl("");
    setReferenceTitle("");
    setReferenceKind("");
  };

  const handleExtractReferences = async () => {
    if (!ideaId) return;
    setExtracting(true);
    try {
      await extractIdeaReferences({ id: ideaId });
    } finally {
      setExtracting(false);
    }
  };

  const handleMoveToBacklog = async () => {
    if (!ideaId) return;
    await moveIdeaToStatus({ id: ideaId, status: "backlog" });
    onClose();
  };

  const handleArchive = async () => {
    if (!ideaId) return;
    await moveIdeaToStatus({ id: ideaId, status: "archived" });
    onClose();
  };

  const footer = idea ? (
    <div className="flex w-full flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex flex-wrap gap-2">
        <Button onClick={handleMoveToBacklog} variant="ghost">
          <ArrowLeft className="size-4" />
          Send to Inspiration
        </Button>
        <Button onClick={handleArchive} variant="ghost">
          <Archive className="size-4" />
          Archive
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button onClick={onClose} variant="outline">
          <Link2 className="size-4" />
          Close
        </Button>
        <Button disabled={saving || !text.trim()} onClick={handleSave}>
          <Sparkles className="size-4" />
          {saving ? "Saving..." : "Save Idea"}
        </Button>
      </div>
    </div>
  ) : undefined;

  return (
    <Modal
      bodyClassName="min-h-0 overflow-hidden p-0"
      footer={footer}
      onClose={onClose}
      open={open}
      panelClassName="h-[min(54rem,calc(100dvh-1.5rem))] max-h-[min(54rem,calc(100dvh-1.5rem))] w-[min(92rem,calc(100vw-1.5rem))] max-w-[min(92rem,calc(100vw-1.5rem))] bg-[#fcfaf6]"
      size="full"
      title="Idea Workspace"
    >
      {!ideaId || idea === undefined ? (
        <div className="p-6 text-sm text-muted-foreground">Loading idea...</div>
      ) : !idea ? (
        <div className="p-6 text-sm text-muted-foreground">Idea not found.</div>
      ) : (
        <div className="grid h-full min-h-0 overflow-hidden md:grid-cols-[minmax(0,1.2fr)_320px] xl:grid-cols-[minmax(0,1.35fr)_360px]">
          <div className="min-h-0 min-w-0 border-r border-border/80 bg-[#fcfaf6]">
            <ScrollArea className="h-full min-h-0">
              <div className="space-y-5 px-6 py-6">
                <Card className="rounded-[28px] border border-[#ffe0b8] bg-[linear-gradient(135deg,#fffaf0_0%,#fff4e4_100%)] shadow-none">
                  <CardHeader className="gap-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="space-y-2">
                        <Badge
                          className="rounded-full bg-white/90 text-[#8b4513]"
                          variant="secondary"
                        >
                          Primitive idea
                        </Badge>
                        <CardTitle className="font-forum text-[2rem] leading-none text-[var(--ink-black)]">
                          Keep the originating thought intact.
                        </CardTitle>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Badge className="rounded-full bg-white/80 text-[#8b4513]" variant="secondary">
                          {idea.draftCount} downstream draft{idea.draftCount === 1 ? "" : "s"}
                        </Badge>
                        <Badge className="rounded-full bg-white/80 text-muted-foreground" variant="secondary">
                          Updated {formatWorkflowTimestamp(idea.updatedAt)}
                        </Badge>
                      </div>
                    </div>
                    <p className="text-sm leading-6 text-muted-foreground">
                      Research and downstream posts should sharpen this idea, not overwrite it.
                    </p>
                  </CardHeader>
                </Card>

                <Card className="rounded-[28px] border border-border/80 bg-white shadow-none">
                  <CardHeader className="gap-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#fff1db] text-[#8b4513]">
                        <BookOpenText className="size-5" />
                      </div>
                      <div>
                        <CardTitle className="text-base text-[var(--ink-black)]">
                          Core brief
                        </CardTitle>
                        <p className="text-sm text-muted-foreground">
                          Write the idea clearly first. Everything else is supporting structure.
                        </p>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="grid gap-5 pb-6">
                    <div className="space-y-2">
                      <Label htmlFor="idea-title">Working Title</Label>
                      <Input
                        id="idea-title"
                        onChange={(event) => setTitle(event.target.value)}
                        placeholder="Optional title for the idea"
                        value={title}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="idea-text">Core Idea</Label>
                      <Textarea
                        id="idea-text"
                        onChange={(event) => setText(event.target.value)}
                        placeholder="What is the original thought worth exploring?"
                        rows={12}
                        value={text}
                      />
                    </div>
                  </CardContent>
                </Card>

                <Card className="rounded-[28px] border border-border/80 bg-white shadow-none">
                  <CardHeader className="gap-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#e8f6f8] text-[#15616d]">
                        <Compass className="size-5" />
                      </div>
                      <div>
                        <CardTitle className="text-base text-[var(--ink-black)]">
                          Research angle
                        </CardTitle>
                        <p className="text-sm text-muted-foreground">
                          Define what the research should prove, challenge, or clarify.
                        </p>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="grid gap-5 pb-6">
                    <div className="grid gap-5 lg:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="idea-objective">Research Objective</Label>
                        <Textarea
                          id="idea-objective"
                          onChange={(event) => setResearchObjective(event.target.value)}
                          placeholder="What should the research prove, challenge, or clarify?"
                          rows={6}
                          value={researchObjective}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="idea-research-notes">Research Notes</Label>
                        <Textarea
                          id="idea-research-notes"
                          onChange={(event) => setResearchNotes(event.target.value)}
                          placeholder="Capture source notes, examples, stats, and objections here."
                          rows={10}
                          value={researchNotes}
                        />
                      </div>
                    </div>

                    <Separator />

                    <div className="grid gap-5 lg:grid-cols-2">
                      <SelectionSection
                        items={RESEARCH_MODES}
                        selected={researchModes}
                        title="Research Modes"
                        onToggle={(value) =>
                          toggleSelection(
                            value as ResearchMode,
                            researchModes,
                            setResearchModes
                          )
                        }
                      />
                      <SelectionSection
                        items={RESEARCH_SOURCES}
                        selected={researchSources}
                        title="Source Buckets"
                        onToggle={(value) =>
                          toggleSelection(
                            value as ResearchSource,
                            researchSources,
                            setResearchSources
                          )
                        }
                      />
                    </div>
                  </CardContent>
                </Card>
              </div>
            </ScrollArea>
          </div>

          <aside className="min-h-0 min-w-0 bg-[#f6f1e8]">
            <ScrollArea className="h-full min-h-0">
              <div className="space-y-4 px-5 py-6">
                <Card className="rounded-[24px] border border-border/80 bg-white shadow-none">
                  <CardHeader className="gap-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <CardTitle className="text-base text-[var(--ink-black)]">
                          References
                        </CardTitle>
                        <p className="text-sm text-muted-foreground">
                          Pull links out of the note or attach sources manually.
                        </p>
                      </div>
                      <Button
                        disabled={extracting}
                        onClick={handleExtractReferences}
                        size="sm"
                        variant="outline"
                      >
                        <SearchCheck className="size-4" />
                        {extracting ? "Extracting..." : "Extract Links"}
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4 pb-6">
                    <div className="space-y-2">
                      {(idea.references || []).length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-border bg-muted/40 px-4 py-4 text-sm text-muted-foreground">
                          No references attached yet.
                        </div>
                      ) : (
                        idea.references.map((reference) => (
                          <div
                            className="rounded-2xl border border-border/80 bg-[#faf7f2] px-4 py-3"
                            key={reference.url}
                          >
                            <p className="text-sm font-medium text-[var(--ink-black)]">
                              {reference.title || reference.url}
                            </p>
                            {reference.title ? (
                              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                                {reference.url}
                              </p>
                            ) : null}
                          </div>
                        ))
                      )}
                    </div>

                    <Separator />

                    <div className="space-y-3">
                      <div className="space-y-2">
                        <Label htmlFor="reference-url">Reference URL</Label>
                        <Input
                          id="reference-url"
                          onChange={(event) => setReferenceUrl(event.target.value)}
                          placeholder="https://example.com/source"
                          value={referenceUrl}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="reference-title">Optional title</Label>
                        <Input
                          id="reference-title"
                          onChange={(event) => setReferenceTitle(event.target.value)}
                          placeholder="Optional title"
                          value={referenceTitle}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="reference-kind">Kind</Label>
                        <Input
                          id="reference-kind"
                          onChange={(event) => setReferenceKind(event.target.value)}
                          placeholder="article, talk, report..."
                          value={referenceKind}
                        />
                      </div>
                      <Button
                        disabled={!referenceUrl.trim()}
                        onClick={handleAddReference}
                        variant="outline"
                      >
                        <Plus className="size-4" />
                        Add Reference
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                <Card className="rounded-[24px] border border-border/80 bg-white shadow-none">
                  <CardHeader>
                    <CardTitle className="text-base text-[var(--ink-black)]">
                      Workflow note
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pb-6 text-sm leading-6 text-muted-foreground">
                    The board card stays intentionally compact. Context, cleanup, and
                    source management happen here instead of spilling into the lane.
                  </CardContent>
                </Card>
              </div>
            </ScrollArea>
          </aside>
        </div>
      )}
    </Modal>
  );
}

function SelectionSection({
  title,
  items,
  selected,
  onToggle,
}: {
  title: string;
  items: readonly string[];
  selected: string[];
  onToggle: (value: string) => void;
}) {
  return (
    <div className="space-y-3">
      <p className="text-sm font-medium text-[var(--ink-black)]">{title}</p>
      <div className="flex flex-wrap gap-2">
        {items.map((item) => {
          const active = selected.includes(item);
          return (
            <button
              className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
                active
                  ? "border-[var(--ink-black)] bg-[var(--ink-black)] text-white"
                  : "border-border bg-muted/50 text-muted-foreground hover:bg-muted"
              }`}
              key={item}
              onClick={() => onToggle(item)}
              type="button"
            >
              {item.replace(/-/g, " ")}
            </button>
          );
        })}
      </div>
    </div>
  );
}
