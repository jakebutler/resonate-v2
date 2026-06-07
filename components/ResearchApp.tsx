"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { BrandSelector } from "@/components/shell/BrandSelector";
import {
  HighlightCard,
  HighlightTitle,
} from "@/components/shell/HighlightCard";
import { MainCard } from "@/components/shell/MainCard";
import { Notice } from "@/components/shell/Notice";
import { PageHeader } from "@/components/shell/PageHeader";
import { PanelHeading } from "@/components/shell/PanelHeading";
import { SegmentedControl } from "@/components/shell/SegmentedControl";
import { WorkspaceLayout } from "@/components/shell/WorkspaceLayout";
import { tokens } from "@/components/shell/tokens";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { Lightbulb } from "lucide-react";
import {
  capturedIdeaTitle,
  ideaDetailToIdea,
  variantsFromIdeaDetail,
} from "@/lib/ideasAdapter";
import {
  buildClarifyingContext,
  buildClarifyingQuestions,
  buildFallbackDraft,
  buildIdeaSeedText,
  CLAIM_STATUS_LABELS,
  CLAIM_STATUSES,
  DEFAULT_WORKSPACE_STATE,
  EVIDENCE_LABEL_DESCRIPTIONS,
  EVIDENCE_LABELS,
  FRESHPROOF_SEED_BRIEF,
  makeClaimMap,
  makeResearchBrief,
  normalizeIdeaSourceUrl,
  BRANDS,
  CHANNEL_LABELS,
  type BrandId,
  type ChannelId,
  type Claim,
  type ClaimMap,
  type ClaimStatus,
  type ClarifyingAnswer,
  type EditorialOutline,
  type IdeaStatus,
  type ResearchBrief,
  type ResearchDepth,
  type ResearchRiskLevel,
  type SourceRecord,
} from "@/lib/domain";

type ResearchTab = "capture" | "ideas" | "research";

function today() {
  return new Date().toISOString().slice(0, 10);
}

function renderableText(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(renderableText).filter(Boolean).join("; ");
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const preferred = [
      record.primarySources,
      record.secondarySources,
      record.citationStrategy,
      record.citationStyle,
      record.evidenceHierarchy,
      record.caveatsHandling,
      record.title,
      record.name,
      record.url,
    ]
      .map(renderableText)
      .filter(Boolean)
      .join("; ");
    return preferred || JSON.stringify(value);
  }
  return "";
}

function normalizeEditorialOutlineForPersistence(outline: EditorialOutline): EditorialOutline {
  return {
    ...outline,
    thesis: renderableText(outline.thesis),
    sections: outline.sections.map((section) => ({
      heading: renderableText(section.heading),
      notes: renderableText(section.notes),
      claimIds: section.claimIds.map(renderableText).filter(Boolean),
      evidenceLabels: section.evidenceLabels.map(renderableText),
    })) as EditorialOutline["sections"],
    takeawayTable: outline.takeawayTable.map((row) => ({
      finding: renderableText(row.finding),
      evidenceLabel: renderableText(row.evidenceLabel),
      source: renderableText(row.source),
    })) as EditorialOutline["takeawayTable"],
    citationPlan: renderableText(outline.citationPlan),
  };
}

export function ResearchApp({
  initialTab = "capture",
}: {
  initialTab?: ResearchTab;
} = {}) {
  const { isLoading: isConvexAuthLoading, isAuthenticated: isConvexAuthenticated } =
    useConvexAuth();
  const savePersistedResearchBrief = useMutation(api.research.saveResearchBrief);
  const savePersistedClaimMap = useMutation(api.research.saveClaimMap);
  const savePersistedEditorialOutline = useMutation(api.research.saveEditorialOutline);
  const savePersistedLongFormDraft = useMutation(api.research.saveLongFormDraft);
  const reviewPersistedSource = useMutation(api.research.reviewSource);
  const reviewPersistedClaim = useMutation(api.research.reviewClaim);
  const createIdeaMutation = useMutation(api.ideas.create);
  const appendIdeaEntry = useMutation(api.ideas.appendEntry);
  const updateIdeaMeta = useMutation(api.ideas.updateMeta);
  const createVariantPost = useMutation(api.publishing.createVariantPost);
  const [voicePacks] = useState(DEFAULT_WORKSPACE_STATE.voicePacks);
  const [activeTab, setActiveTab] = useState<ResearchTab>(initialTab);
  const [lastCapturedIdeaId, setLastCapturedIdeaId] = useState<Id<"capturedIdeas"> | null>(
    null
  );
  const [brandId, setBrandId] = useState<BrandId>("corvo");
  const [ideaTitle, setIdeaTitle] = useState("");
  const [ideaNote, setIdeaNote] = useState("");
  const [ideaSourceUrl, setIdeaSourceUrl] = useState("");
  const [ideaTags, setIdeaTags] = useState("");
  const [selectedIdeaId, setSelectedIdeaId] = useState<Id<"capturedIdeas"> | null>(null);
  const [selectedChannels, setSelectedChannels] = useState<Set<ChannelId>>(
    new Set(["corvo-blog"])
  );
  const [generatingChannels, setGeneratingChannels] = useState<Set<ChannelId>>(new Set());
  const [clarifyingAnswers, setClarifyingAnswers] = useState<Record<string, string>>({});
  const [clarifyingPromptOpen, setClarifyingPromptOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editTags, setEditTags] = useState("");
  const [editStatus, setEditStatus] = useState<IdeaStatus>("inbox");
  const [savingIdeaMeta, setSavingIdeaMeta] = useState(false);

  // Research pipeline state (#52)
  const [researchBrief, setResearchBrief] = useState<ResearchBrief | null>(null);
  const [researchTopic, setResearchTopic] = useState(FRESHPROOF_SEED_BRIEF.topic);
  const [researchAudience, setResearchAudience] = useState(FRESHPROOF_SEED_BRIEF.audience);
  const [researchThesis, setResearchThesis] = useState(FRESHPROOF_SEED_BRIEF.thesis);
  const [researchDepth, setResearchDepth] = useState<ResearchDepth>("rigorous");
  const [researchRisk, setResearchRisk] = useState<ResearchRiskLevel>("high");
  const [researchBusy, setResearchBusy] = useState(false);
  const [sourceReviewNotes, setSourceReviewNotes] = useState<Record<string, string>>({});
  const [persistedResearchBriefId, setPersistedResearchBriefId] =
    useState<Id<"v2ResearchBriefs"> | null>(null);

  // Claim map state (#53)
  const [claimMap, setClaimMap] = useState<ClaimMap | null>(null);
  const [claimMapBusy, setClaimMapBusy] = useState(false);
  const [claimReviewNotes, setClaimReviewNotes] = useState<Record<string, string>>({});
  const [persistedClaimMapId, setPersistedClaimMapId] =
    useState<Id<"v2ClaimMaps"> | null>(null);

  // Editorial outline + long-form draft state (#54)
  const [editorialOutline, setEditorialOutline] = useState<EditorialOutline | null>(null);
  const [outlineBusy, setOutlineBusy] = useState(false);
  const [persistedEditorialOutlineId, setPersistedEditorialOutlineId] =
    useState<Id<"v2EditorialOutlines"> | null>(null);
  const [longFormDraft, setLongFormDraft] = useState<string | null>(null);
  const [draftBusy, setDraftBusy] = useState(false);

  const normalizedSourceUrlForQuery = useMemo(
    () => normalizeIdeaSourceUrl(ideaSourceUrl.trim() || undefined),
    [ideaSourceUrl]
  );

  const persistedIdeas = useQuery(
    api.ideas.list,
    isConvexAuthenticated ? { brandId } : "skip"
  );
  const selectedIdeaDetail = useQuery(
    api.ideas.getById,
    isConvexAuthenticated && selectedIdeaId ? { id: selectedIdeaId } : "skip"
  );
  const duplicateIdeas = useQuery(
    api.ideas.findByNormalizedSourceUrl,
    isConvexAuthenticated && normalizedSourceUrlForQuery
      ? { normalizedSourceUrl: normalizedSourceUrlForQuery }
      : "skip"
  );
  const brand = BRANDS.find((item) => item.id === brandId) ?? BRANDS[1];
  const ideas = persistedIdeas ?? [];
  const selectedIdea = useMemo(
    () =>
      selectedIdeaDetail
        ? ideaDetailToIdea(selectedIdeaDetail, brandId)
        : null,
    [brandId, selectedIdeaDetail]
  );
  const variants = useMemo(
    () =>
      selectedIdeaId
        ? variantsFromIdeaDetail(selectedIdeaDetail, selectedIdeaId)
        : [],
    [selectedIdeaDetail, selectedIdeaId]
  );
  const voicePack =
    voicePacks.find((pack) => pack.brandId === brandId && pack.isDefault) ??
    voicePacks.find((pack) => pack.brandId === brandId) ??
    voicePacks[0];
  useEffect(() => {
    if (!selectedIdeaDetail) return;
    setEditTitle(selectedIdeaDetail.sourceTitle ?? "");
    setEditTags(selectedIdeaDetail.tags.join(", "));
    setEditStatus((selectedIdeaDetail.status as IdeaStatus) ?? "inbox");
  }, [selectedIdeaDetail]);

  useEffect(() => {
    if (!isConvexAuthenticated || !ideas.length || activeTab !== "ideas") return;
    if (!selectedIdeaId || !ideas.some((idea) => idea._id === selectedIdeaId)) {
      setSelectedIdeaId(ideas[0]._id);
    }
  }, [activeTab, ideas, isConvexAuthenticated, selectedIdeaId]);

  const targetOptions = useMemo(() => {
    const channels = new Set<ChannelId>([
      ...brand.validatedChannels,
      ...brand.targetChannels,
    ]);
    return [...channels];
  }, [brand.targetChannels, brand.validatedChannels]);
  const selectedChannelList = useMemo(
    () => [...selectedChannels].sort(),
    [selectedChannels]
  );
  const clarifyingQuestions = useMemo(
    () =>
      selectedIdea
        ? buildClarifyingQuestions({
            idea: selectedIdea,
            brand,
            channels: selectedChannelList,
          })
        : [],
    [brand, selectedChannelList, selectedIdea]
  );
  const answeredClarifyingQuestions = useMemo<ClarifyingAnswer[]>(
    () =>
      clarifyingQuestions
        .map((question) => ({
          question,
          answer: clarifyingAnswers[question] ?? "",
        }))
        .filter((item) => item.answer.trim()),
    [clarifyingAnswers, clarifyingQuestions]
  );
  const missingClarifyingAnswers = clarifyingQuestions.filter(
    (question) => !(clarifyingAnswers[question] ?? "").trim()
  );

  useEffect(() => {
    setGeneratingChannels(new Set());
    setClarifyingAnswers({});
    setClarifyingPromptOpen(false);
  }, [selectedIdeaId]);

  useEffect(() => {
    setSelectedChannels((prev) => {
      const available = new Set(targetOptions);
      const next = new Set([...prev].filter((c) => available.has(c)));
      return next.size > 0 ? next : new Set(targetOptions.slice(0, 1));
    });
    setClarifyingAnswers({});
    setClarifyingPromptOpen(false);
  }, [brandId, targetOptions]);

  function toggleChannel(channelId: ChannelId) {
    setSelectedChannels((prev) => {
      const next = new Set(prev);
      if (next.has(channelId)) {
        next.delete(channelId);
      } else {
        next.add(channelId);
      }
      return next;
    });
  }

  async function createIdea() {
    if (!isConvexAuthenticated) {
      setNotice("Sign in and connect Convex before capturing ideas.");
      return;
    }
    if (!ideaNote.trim()) {
      setNotice("Add a note before capturing an Idea.");
      return;
    }

    const sourceUrl = ideaSourceUrl.trim() || undefined;
    const normalizedSourceUrl = normalizeIdeaSourceUrl(sourceUrl);
    const tags = ideaTags
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);
    const matchingIdea =
      normalizedSourceUrl && duplicateIdeas?.length
        ? duplicateIdeas.find((idea) => idea.brandId === brandId) ?? duplicateIdeas[0]
        : undefined;

    setNotice(null);
    try {
      if (matchingIdea) {
        await appendIdeaEntry({
          ideaId: matchingIdea._id,
          content: ideaNote.trim(),
        });
        setSelectedIdeaId(matchingIdea._id);
        setLastCapturedIdeaId(matchingIdea._id);
        setNotice("Matched existing source and appended this note to the Idea.");
      } else {
        const ideaId = await createIdeaMutation({
          brandId,
          content: ideaNote.trim(),
          tags,
          sourceUrl,
          normalizedSourceUrl,
          sourceTitle: ideaTitle.trim() || undefined,
        });
        setSelectedIdeaId(ideaId);
        setLastCapturedIdeaId(ideaId);
        setNotice("Captured a new Idea.");
      }

      setIdeaTitle("");
      setIdeaNote("");
      setIdeaSourceUrl("");
      setIdeaTags("");
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "Failed to capture idea in Convex."
      );
    }
  }

  async function generateVariants() {
    if (!isConvexAuthenticated || !selectedIdeaId || !selectedIdea || !voicePack) return;
    if (selectedChannels.size === 0) return;

    if (missingClarifyingAnswers.length > 0) {
      setClarifyingPromptOpen(true);
      setNotice("Answer the clarifying questions before generating drafts.");
      return;
    }

    setNotice(null);

    const channels = selectedChannelList;
    const clarifyingContext = buildClarifyingContext(answeredClarifyingQuestions);
    setGeneratingChannels(new Set(channels));
    const errors: string[] = [];

    await Promise.all(
      channels.map(async (channelId) => {
        try {
          const response = await fetch("/api/generate-draft", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              idea: selectedIdea,
              voicePackMarkdown: voicePack.markdown,
              channel: channelId,
              clarifyingAnswers: answeredClarifyingQuestions,
            }),
          });
          const data = await response.json();
          const content =
            typeof data.draft === "string"
              ? data.draft
              : buildFallbackDraft({
                  idea: selectedIdea,
                  channelId,
                  voicePackMarkdown: voicePack.markdown,
                  clarifyingContext,
                });
          const title =
            channelId === "youtube"
              ? `${selectedIdea.title} - YouTube outline`
              : selectedIdea.title;

          await createVariantPost({
            ideaId: selectedIdeaId,
            brandId,
            channelId,
            title,
            content,
            scheduledDate: today(),
            scheduledTime: "09:00",
            timezone: "America/Los_Angeles",
          });
        } catch (error) {
          errors.push(
            error instanceof Error
              ? `${CHANNEL_LABELS[channelId]}: ${error.message}`
              : `${CHANNEL_LABELS[channelId]}: failed to persist variant`
          );
        } finally {
          setGeneratingChannels((prev) => {
            const next = new Set(prev);
            next.delete(channelId);
            return next;
          });
        }
      })
    );

    if (errors.length > 0) {
      setNotice(errors.join(" "));
      return;
    }

    setNotice(
      `Generated ${channels.length} variant${channels.length > 1 ? "s" : ""}. Review each one before accepting.`
    );
  }

  async function saveIdeaMeta() {
    if (!isConvexAuthenticated || !selectedIdeaId) return;
    setSavingIdeaMeta(true);
    setNotice(null);
    try {
      await updateIdeaMeta({
        id: selectedIdeaId,
        sourceTitle: editTitle.trim() || null,
        tags: editTags
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean),
        status: editStatus,
      });
      setNotice("Saved idea details.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Failed to save idea details.");
    } finally {
      setSavingIdeaMeta(false);
    }
  }

  function openCapturedIdeaInIdeasTab(ideaId: Id<"capturedIdeas">) {
    setSelectedIdeaId(ideaId);
    setActiveTab("ideas");
  }

  async function generateClaimMap() {
    if (!researchBrief) return;
    const accepted = researchBrief.sources.filter((s) => s.status === "accepted");
    if (accepted.length === 0) return;
    setClaimMapBusy(true);
    setNotice(null);

    try {
      const response = await fetch("/api/claim-map", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: researchBrief.topic,
          thesis: researchBrief.thesis,
          brandId: researchBrief.brandId,
          acceptedSources: accepted,
        }),
      });
      const data = await response.json();
      const claims: Claim[] = Array.isArray(data.claims) ? data.claims : [];
      const map = makeClaimMap({
        brandId: researchBrief.brandId,
        topic: researchBrief.topic,
        thesis: researchBrief.thesis,
      });
      setClaimMap({ ...map, claims, status: "review-ready" });
      setPersistedClaimMapId(null);
      try {
        const persisted = await savePersistedClaimMap({
          localClaimMapId: map.id,
          researchBriefId: persistedResearchBriefId ?? undefined,
          brandId: map.brandId,
          topic: map.topic,
          thesis: map.thesis,
          provider: typeof data.provider === "string" ? data.provider : "unknown",
          warning: typeof data.warning === "string" ? data.warning : undefined,
          claims: claims.map((claim) => ({
            id: claim.id,
            text: claim.text,
            sourceIds: claim.sourceIds,
            evidenceLabel: claim.evidenceLabel,
            confidence: claim.confidence,
            caveats: claim.caveats,
            reviewerNotes: claim.reviewerNotes,
            status: claim.status,
            raw: claim,
          })),
        });
        setPersistedClaimMapId(persisted.claimMapId);
        setNotice(
          data.warning ??
            `Generated ${claims.length} candidate claim${claims.length !== 1 ? "s" : ""} and persisted the claim map. Review each before drafting.`
        );
      } catch {
        setNotice(
          data.warning ??
            `Generated ${claims.length} candidate claim${claims.length !== 1 ? "s" : ""}. Seed the Convex workspace to persist claim maps.`
        );
      }
    } finally {
      setClaimMapBusy(false);
    }
  }

  async function reviewClaim(claimId: string, status: ClaimStatus, notes?: string) {
    setClaimMap((prev) => {
      if (!prev) return prev;
      const updatedClaims = prev.claims.map((c) =>
        c.id === claimId
          ? { ...c, status, reviewerNotes: notes ?? c.reviewerNotes }
          : c
      );
      const allReviewed = updatedClaims.every((c) => c.status !== "unreviewed");
      return {
        ...prev,
        claims: updatedClaims,
        status: allReviewed ? "reviewed" : "review-ready",
        updatedAt: new Date().toISOString(),
      };
    });
    if (notes) setClaimReviewNotes((prev) => ({ ...prev, [claimId]: notes }));
    if (persistedClaimMapId) {
      try {
        await reviewPersistedClaim({
          claimMapId: persistedClaimMapId,
          claimId,
          status,
          reviewerNotes: notes,
        });
      } catch {
        setNotice("Updated local claim review. Persisted claim review needs workspace access.");
      }
    }
  }

  async function generateOutline() {
    if (!claimMap || !researchBrief) return;
    const accepted = claimMap.claims.filter((c) => c.status === "accepted");
    if (accepted.length === 0) return;
    setOutlineBusy(true);
    setLongFormDraft(null);
    setNotice(null);

    try {
      const response = await fetch("/api/editorial-outline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          thesis: researchBrief.thesis || claimMap.thesis,
          claimMapId: claimMap.id,
          brandId: claimMap.brandId,
          topic: researchBrief.topic,
          acceptedClaims: accepted,
        }),
      });
      const data = await response.json();
      if (data.outline) {
        const outline = normalizeEditorialOutlineForPersistence(
          data.outline as EditorialOutline
        );
        setEditorialOutline(outline);
        setPersistedEditorialOutlineId(null);
        try {
          const persisted = await savePersistedEditorialOutline({
            localOutlineId: outline.id,
            localClaimMapId: claimMap.id,
            claimMapId: persistedClaimMapId ?? undefined,
            brandId: outline.brandId,
            thesis: outline.thesis,
            sections: outline.sections,
            takeawayTable: outline.takeawayTable,
            citationPlan: outline.citationPlan,
            status: outline.status,
            provider: typeof data.provider === "string" ? data.provider : "unknown",
            warning: typeof data.warning === "string" ? data.warning : undefined,
            raw: data.outline,
          });
          setPersistedEditorialOutlineId(persisted.outlineId);
          setNotice(
            data.warning ??
              `Editorial outline generated and persisted — ${outline.sections.length} section${outline.sections.length !== 1 ? "s" : ""}. Review and approve before drafting.`
          );
        } catch {
          setNotice(
            data.warning ??
              `Editorial outline generated — ${outline.sections.length} section${outline.sections.length !== 1 ? "s" : ""}. Seed the Convex workspace to persist outlines.`
          );
        }
      }
    } finally {
      setOutlineBusy(false);
    }
  }

  async function generateLongFormDraft() {
    if (!editorialOutline || !claimMap) return;
    const accepted = claimMap.claims.filter((c) => c.status === "accepted");
    if (accepted.length === 0) return;
    const approvedOutline = { ...editorialOutline, status: "approved" as const };
    setDraftBusy(true);
    setNotice(null);

    try {
      const response = await fetch("/api/long-form-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          outline: approvedOutline,
          acceptedClaims: accepted,
          brandId: claimMap.brandId,
        }),
      });
      const data = await response.json();
      if (typeof data.draft === "string") {
        setLongFormDraft(data.draft);
        setEditorialOutline((prev) => prev ? { ...prev, status: "approved" } : prev);
        try {
          await savePersistedLongFormDraft({
            outlineId: persistedEditorialOutlineId ?? undefined,
            localOutlineId: approvedOutline.id,
            claimMapId: persistedClaimMapId ?? undefined,
            localClaimMapId: claimMap.id,
            brandId: claimMap.brandId,
            markdown: data.draft,
            provider: typeof data.provider === "string" ? data.provider : "unknown",
            warning: typeof data.warning === "string" ? data.warning : undefined,
            acceptedClaimIds: accepted.map((claim) => claim.id),
            raw: { draft: data.draft },
          });
          setNotice(
            data.warning ??
              "Long-form draft generated and persisted. Review carefully before publishing — AI never auto-publishes."
          );
        } catch {
          setNotice(
            data.warning ??
              "Long-form draft generated. Seed the Convex workspace to persist draft artifacts."
          );
        }
      }
    } finally {
      setDraftBusy(false);
    }
  }

  async function runSourceDiscovery() {
    if (!researchTopic.trim() || !researchAudience.trim()) return;
    setResearchBusy(true);
    setNotice(null);

    const brief = makeResearchBrief({
      brandId,
      topic: researchTopic,
      audience: researchAudience,
      thesis: researchThesis,
      depth: researchDepth,
      riskLevel: researchRisk,
      targetOutputs: FRESHPROOF_SEED_BRIEF.targetOutputs,
    });

    try {
      const response = await fetch("/api/research-brief", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: brief.topic,
          audience: brief.audience,
          thesis: brief.thesis,
          depth: brief.depth,
          riskLevel: brief.riskLevel,
          brandId: brief.brandId,
          targetOutputs: brief.targetOutputs,
        }),
      });
      const data = await response.json();
      const sources: SourceRecord[] = Array.isArray(data.sources) ? data.sources : [];
      setResearchBrief({ ...brief, sources, status: "source-review" });
      setPersistedResearchBriefId(null);
      setPersistedClaimMapId(null);
      try {
        const persisted = await savePersistedResearchBrief({
          localBriefId: brief.id,
          brandId: brief.brandId,
          topic: brief.topic,
          audience: brief.audience,
          thesis: brief.thesis,
          depth: brief.depth,
          riskLevel: brief.riskLevel,
          targetOutputs: brief.targetOutputs,
          provider: typeof data.provider === "string" ? data.provider : "unknown",
          warning: typeof data.warning === "string" ? data.warning : undefined,
          sources: sources.map((source) => ({
            id: source.id,
            title: source.title,
            url: source.url,
            domain: source.domain,
            evidenceLabel: source.evidenceLabel,
            relevanceScore: source.relevanceScore,
            publishedYear: source.publishedYear,
            useCase: source.useCase,
            addedBy: source.addedBy,
            status: source.status,
            reviewerNotes: source.reviewerNotes,
            raw: source,
          })),
        });
        setPersistedResearchBriefId(persisted.researchBriefId);
        setNotice(
          data.warning ??
            `Source discovery complete. ${sources.length} sources found and persisted. Review each before using in drafts.`
        );
      } catch {
        setNotice(
          data.warning ??
            `Source discovery complete. ${sources.length} sources found. Seed the Convex workspace to persist research artifacts.`
        );
      }
    } finally {
      setResearchBusy(false);
    }
  }

  async function vetSource(
    sourceId: string,
    newStatus: SourceRecord["status"],
    notes?: string
  ) {
    setResearchBrief((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        sources: prev.sources.map((s) =>
          s.id === sourceId
            ? { ...s, status: newStatus, reviewerNotes: notes ?? s.reviewerNotes }
            : s
        ),
      };
    });
    if (notes) {
      setSourceReviewNotes((prev) => ({ ...prev, [sourceId]: notes }));
    }
    if (persistedResearchBriefId) {
      try {
        await reviewPersistedSource({
          researchBriefId: persistedResearchBriefId,
          sourceId,
          status: newStatus,
          reviewerNotes: notes,
        });
      } catch {
        setNotice("Updated local source review. Persisted source review needs workspace access.");
      }
    }
  }

  const pendingVariants = variants.filter((v) => v.status === "pending");
  const isGenerating = generatingChannels.size > 0;

  const statusBanner = isConvexAuthLoading ? (
    <Notice>Connecting your Convex workspace…</Notice>
  ) : !isConvexAuthenticated ? (
    <Notice variant="warning">
      Convex auth is not ready for this session. Sign in to capture ideas and persist draft
      variants.
    </Notice>
  ) : notice ? (
    <Notice>{notice}</Notice>
  ) : null;

  return (
    <WorkspaceLayout
      banner={statusBanner}
      header={
        <PageHeader
          description={
            <>
              Ideas and variants persist to Convex. Accepted variants hand off to the{" "}
              <Link className={cn("font-medium underline", tokens.accent)} href="/calendar">
                calendar
              </Link>
              .
            </>
          }
          icon={<Lightbulb size={16} />}
          label="Research & AI"
          title="Capture, draft, and research"
        />
      }
      sidebar={
        <BrandSelector
          brandId={brandId}
          onBrandChange={(nextBrandId) => {
            setBrandId(nextBrandId);
            setSelectedIdeaId(null);
          }}
          voicePack={
            voicePack
              ? { name: voicePack.name, markdown: voicePack.markdown }
              : undefined
          }
        />
      }
    >
      <MainCard className="p-4">
        <SegmentedControl
          ariaLabel="Research workspace"
          onChange={(value) => setActiveTab(value)}
          options={[
            { value: "capture", label: "Capture" },
            { value: "ideas", label: "Ideas" },
            { value: "research", label: "Research" },
          ]}
          value={activeTab}
        />

        {activeTab === "capture" && (
          <section className="mt-5">
            <PanelHeading
              description="The note is the atomic value. Capture first, then draft from Ideas."
              title="Capture an idea"
            />
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Input
                onChange={(event) => setIdeaTitle(event.target.value)}
                placeholder="Idea title"
                value={ideaTitle}
              />
              <Input
                onChange={(event) => setIdeaSourceUrl(event.target.value)}
                placeholder="Optional source URL"
                value={ideaSourceUrl}
              />
              <Input
                className="sm:col-span-2"
                onChange={(event) => setIdeaTags(event.target.value)}
                placeholder="Tags, comma separated"
                value={ideaTags}
              />
              <Textarea
                className="min-h-28 sm:col-span-2"
                onChange={(event) => setIdeaNote(event.target.value)}
                placeholder="Capture the thought. The note is the atomic value."
                value={ideaNote}
              />
            </div>
            <Button className="mt-3" onClick={createIdea} type="button" variant="accent">
              Capture Idea
            </Button>

            {lastCapturedIdeaId && (
              <HighlightCard className="mt-5">
                <HighlightTitle>Idea captured.</HighlightTitle>
                <p className={cn("mt-1 text-sm", tokens.textMuted)}>
                  Open it in Ideas to answer clarifying questions and generate channel drafts.
                </p>
                <Button
                  className="mt-3"
                  onClick={() => openCapturedIdeaInIdeasTab(lastCapturedIdeaId)}
                  type="button"
                  variant="accent"
                >
                  Draft from this idea
                </Button>
              </HighlightCard>
            )}
          </section>
        )}

        {activeTab === "ideas" && (
          <section className="mt-5 grid gap-5 border-t border-black/10 pt-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
              <div>
                <PanelHeading title="Ideas" />
                <div className="mt-4 space-y-3">
                  {ideas.length === 0 && isConvexAuthenticated && (
                    <p className={cn("text-sm", tokens.textMuted)}>
                      No ideas for this brand yet. Capture one on the Capture tab.
                    </p>
                  )}
                  {ideas.map((idea) => (
                    <button
                      className={cn(
                        "w-full rounded-lg border p-4 text-left",
                        selectedIdeaId === idea._id
                          ? "border-[#15616d]/30 bg-[#f1fbfc]"
                          : cn(tokens.border, "hover:bg-black/5")
                      )}
                      key={idea._id}
                      onClick={() => setSelectedIdeaId(idea._id)}
                      type="button"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h3 className="font-medium">{capturedIdeaTitle(idea)}</h3>
                        <span className="rounded-full bg-black/5 px-2 py-1 text-xs">
                          {idea.status}
                        </span>
                      </div>
                      <p className={cn("mt-2 line-clamp-2 text-sm", tokens.textMuted)}>
                        {idea.latestEntryPreview}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {idea.tags.map((tag) => (
                          <span className="rounded-full bg-[#fff4e6] px-2 py-1 text-xs" key={tag}>
                            {tag}
                          </span>
                        ))}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="border-t border-black/10 pt-5 xl:border-t-0 xl:border-l xl:pl-5 xl:pt-0">
                <PanelHeading title="Selected idea" />
                {selectedIdea ? (
                  <>
                    <div className="mt-4 grid gap-3">
                      <label className="block text-sm">
                        <span className="font-medium">Title</span>
                        <input
                          className="mt-1 w-full rounded-md border border-black/15 px-3 py-2 text-sm"
                          onChange={(event) => setEditTitle(event.target.value)}
                          value={editTitle}
                        />
                      </label>
                      <label className="block text-sm">
                        <span className="font-medium">Tags</span>
                        <input
                          className="mt-1 w-full rounded-md border border-black/15 px-3 py-2 text-sm"
                          onChange={(event) => setEditTags(event.target.value)}
                          placeholder="comma separated"
                          value={editTags}
                        />
                      </label>
                      <label className="block text-sm">
                        <span className="font-medium">Status</span>
                        <select
                          className="mt-1 w-full rounded-md border border-black/15 px-3 py-2 text-sm"
                          onChange={(event) =>
                            setEditStatus(event.target.value as IdeaStatus)
                          }
                          value={editStatus}
                        >
                          <option value="inbox">inbox</option>
                          <option value="reviewing">reviewing</option>
                          <option value="ready">ready</option>
                          <option value="used">used</option>
                          <option value="archived">archived</option>
                        </select>
                      </label>
                      <Button
                        disabled={savingIdeaMeta}
                        onClick={saveIdeaMeta}
                        type="button"
                        variant="outline"
                      >
                        {savingIdeaMeta ? "Saving…" : "Save changes"}
                      </Button>
                    </div>

                    <pre className="mt-4 max-h-40 overflow-auto whitespace-pre-wrap rounded-md bg-black/5 p-3 text-xs">
                      {buildIdeaSeedText(selectedIdea)}
                    </pre>

                    <fieldset className="mt-4">
                      <legend className="text-sm font-medium">Target channels</legend>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {targetOptions.map((id) => {
                          const checked = selectedChannels.has(id);
                          const isValidated = brand.validatedChannels.includes(id);
                          return (
                            <label
                              key={id}
                              className={`flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                                checked
                                  ? "border-[#15616d] bg-[#e8f3f4] text-[#15616d]"
                                  : "border-black/10 text-[#111827]/70 hover:bg-black/5"
                              }`}
                            >
                              <input
                                checked={checked}
                                className="sr-only"
                                onChange={() => toggleChannel(id)}
                                type="checkbox"
                              />
                              {CHANNEL_LABELS[id]}
                              {isValidated && (
                                <span className="ml-1 rounded-full bg-[#15616d] px-1 text-[10px] text-white">
                                  ✓
                                </span>
                              )}
                            </label>
                          );
                        })}
                      </div>
                    </fieldset>

                    {(clarifyingPromptOpen || clarifyingQuestions.length > 0) && (
                      <section className="mt-4 rounded-md border border-[#ff7d00]/25 bg-[#fff8f0] p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <h3 className="text-sm font-semibold text-[#001524]">
                              Clarifying context
                            </h3>
                            <p className="mt-1 text-xs text-[#111827]/70">
                              Answer these before drafting so each channel variant has enough context.
                            </p>
                          </div>
                          {missingClarifyingAnswers.length === 0 && (
                            <span className="rounded-full bg-[#e8f3f4] px-2 py-0.5 text-xs font-medium text-[#15616d]">
                              Ready
                            </span>
                          )}
                        </div>
                        <div className="mt-3 space-y-3">
                          {clarifyingQuestions.map((question) => (
                            <label key={question} className="block">
                              <span className="text-xs font-medium text-[#001524]">
                                {question}
                              </span>
                              <textarea
                                className="mt-1 min-h-20 w-full rounded-md border border-black/15 bg-white px-3 py-2 text-sm outline-none focus:border-[#ff7d00] focus:ring-2 focus:ring-[#ff7d00]/15"
                                onChange={(event) =>
                                  setClarifyingAnswers((current) => ({
                                    ...current,
                                    [question]: event.target.value,
                                  }))
                                }
                                value={clarifyingAnswers[question] ?? ""}
                              />
                            </label>
                          ))}
                        </div>
                      </section>
                    )}

                    <Button
                      className="mt-4 w-full"
                      disabled={isGenerating || selectedChannels.size === 0}
                      onClick={generateVariants}
                      type="button"
                    >
                      {isGenerating
                        ? `Generating ${generatingChannels.size} remaining…`
                        : `Generate ${selectedChannels.size > 1 ? `${selectedChannels.size} Variants` : "Draft"}`}
                    </Button>

                    {selectedChannels.size === 0 && (
                      <p className="mt-2 text-xs text-[#111827]/60">
                        Select at least one channel to generate variants.
                      </p>
                    )}

                    {variants.length > 0 && (
                      <div className="mt-5 space-y-4">
                        <h3 className="text-sm font-semibold">
                          Variants
                          {pendingVariants.length > 0 && (
                            <span className="ml-2 rounded-full bg-[#fff4e6] px-2 py-0.5 text-xs text-[#8a4b00]">
                              {pendingVariants.length} pending review
                            </span>
                          )}
                        </h3>

                        {[...generatingChannels].map((channelId) => (
                          <div
                            key={channelId}
                            className="rounded-lg border border-black/10 bg-black/[0.02] p-4"
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-medium text-[#111827]/60">
                                {CHANNEL_LABELS[channelId]}
                              </span>
                              <span className="rounded-full bg-black/5 px-2 py-0.5 text-xs text-[#111827]/60">
                                generating…
                              </span>
                            </div>
                          </div>
                        ))}

                        {variants.map((variant) => (
                          <div
                            key={variant.id}
                            className={`rounded-lg border p-4 ${
                              variant.status === "accepted"
                                ? "border-[#15616d]/30 bg-[#f1fbfc]"
                                : variant.status === "rejected"
                                  ? "border-black/10 bg-black/[0.02] opacity-60"
                                  : "border-[#ff7d00]/30 bg-[#fff8f0]"
                            }`}
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="text-sm font-semibold">
                                {CHANNEL_LABELS[variant.channelId]}
                              </span>
                              <div className="flex items-center gap-2">
                                <span className="rounded-full bg-black/5 px-2 py-0.5 text-xs">
                                  {variant.provider}
                                </span>
                                {variant.status === "pending" && variant.postId && (
                                  <Button asChild size="sm">
                                    <Link href={`/research/review/${variant.postId}`}>
                                      Review
                                    </Link>
                                  </Button>
                                )}
                                {variant.status === "accepted" && (
                                  <Button asChild size="sm" variant="outline">
                                    <Link href={`/calendar?postId=${variant.postId}`}>
                                      Open in calendar
                                    </Link>
                                  </Button>
                                )}
                                {variant.status === "rejected" && (
                                  <span className="rounded-full bg-black/5 px-2 py-0.5 text-xs text-[#111827]/60">
                                    Rejected
                                  </span>
                                )}
                              </div>
                            </div>
                            <p className="mt-3 line-clamp-4 text-sm text-[#111827]/80">
                              {variant.content}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  <p className={cn("mt-2 text-sm", tokens.textMuted)}>
                    Select an idea from the list, or capture one on the Capture tab.
                  </p>
                )}
              </div>
          </section>
        )}

        {activeTab === "research" && (
          <div className="mt-5 space-y-5">
            <section>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">Research Editorial Pipeline</h2>
                  <p className="mt-1 text-sm text-[#111827]/60">
                    Prototype spike for rigorous, evidence-heavy content. Source discovery returns
                    candidate sources — all require human review before use.
                  </p>
                </div>
                <span className="rounded-full bg-[#fff4e6] px-3 py-1 text-xs font-medium text-[#8a4b00]">
                  Spike / FreshProof
                </span>
              </div>

              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <div className="space-y-3">
                  <label className="block text-sm font-medium">Topic</label>
                  <textarea
                    className="w-full rounded-md border border-black/15 px-3 py-2 text-sm"
                    onChange={(e) => setResearchTopic(e.target.value)}
                    rows={2}
                    value={researchTopic}
                  />
                  <label className="block text-sm font-medium">Audience</label>
                  <input
                    className="w-full rounded-md border border-black/15 px-3 py-2 text-sm"
                    onChange={(e) => setResearchAudience(e.target.value)}
                    value={researchAudience}
                  />
                  <label className="block text-sm font-medium">Thesis / question</label>
                  <textarea
                    className="w-full rounded-md border border-black/15 px-3 py-2 text-sm"
                    onChange={(e) => setResearchThesis(e.target.value)}
                    rows={3}
                    value={researchThesis}
                  />
                  <div className="flex flex-wrap gap-3">
                    <div className="flex-1">
                      <label className="block text-xs font-medium text-[#111827]/60">Depth</label>
                      <select
                        className="mt-1 w-full rounded-md border border-black/15 px-2 py-1.5 text-sm"
                        onChange={(e) => setResearchDepth(e.target.value as ResearchDepth)}
                        value={researchDepth}
                      >
                        <option value="light">Light</option>
                        <option value="standard">Standard</option>
                        <option value="rigorous">Rigorous</option>
                      </select>
                    </div>
                    <div className="flex-1">
                      <label className="block text-xs font-medium text-[#111827]/60">Risk level</label>
                      <select
                        className="mt-1 w-full rounded-md border border-black/15 px-2 py-1.5 text-sm"
                        onChange={(e) => setResearchRisk(e.target.value as ResearchRiskLevel)}
                        value={researchRisk}
                      >
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="high">High (clinical/scientific)</option>
                      </select>
                    </div>
                  </div>
                  <Button
                    variant="accent"
                    disabled={researchBusy || !researchTopic.trim() || !researchAudience.trim()}
                    onClick={runSourceDiscovery}
                    type="button"
                  >
                    {researchBusy ? "Discovering sources…" : "Run Source Discovery"}
                  </Button>
                </div>

                <div className="space-y-3">
                  <h3 className="text-sm font-semibold">Evidence Labels Rubric</h3>
                  <div className="space-y-2">
                    {EVIDENCE_LABELS.map((label) => (
                      <div key={label} className="rounded-md border border-black/10 p-2">
                        <p className="text-xs font-semibold">{label}</p>
                        <p className="mt-0.5 text-xs text-[#111827]/60">
                          {EVIDENCE_LABEL_DESCRIPTIONS[label]}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {researchBrief && researchBrief.sources.length > 0 && (
                <div className="mt-6">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-base font-semibold">
                      Sources for Review
                      <span className="ml-2 text-sm font-normal text-[#111827]/60">
                        ({researchBrief.sources.filter((s) => s.status === "accepted").length} accepted
                        / {researchBrief.sources.filter((s) => s.status === "unvetted").length} unvetted)
                      </span>
                    </h3>
                    <p className="rounded-full bg-red-50 px-3 py-1 text-xs text-red-700">
                      Human review required — do not treat AI summaries as ground truth
                    </p>
                  </div>
                  <div className="mt-3 space-y-3">
                    {researchBrief.sources.map((source) => (
                      <div
                        key={source.id}
                        className={`rounded-lg border p-4 ${
                          source.status === "accepted"
                            ? "border-[#15616d]/30 bg-[#f1fbfc]"
                            : source.status === "rejected"
                              ? "border-black/10 bg-black/[0.02] opacity-60"
                              : source.status === "flagged"
                                ? "border-yellow-300 bg-yellow-50"
                                : "border-black/10"
                        }`}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <a
                              className="text-sm font-medium text-[#15616d] underline"
                              href={source.url}
                              rel="noreferrer"
                              target="_blank"
                            >
                              {source.title}
                            </a>
                            <p className="mt-0.5 text-xs text-[#111827]/60">
                              {source.domain}
                              {source.publishedYear ? ` · ${source.publishedYear}` : ""}
                              {" · "}
                              <span className="font-medium">{source.evidenceLabel}</span>
                              {" · "}
                              <span
                                className={
                                  source.qualityRating === "strong"
                                    ? "text-[#15616d]"
                                    : source.qualityRating === "moderate"
                                      ? "text-[#8a4b00]"
                                      : "text-[#111827]/60"
                                }
                              >
                                {source.qualityRating}
                              </span>
                            </p>
                            <p className="mt-1 text-xs text-[#111827]/70">{source.useCase}</p>
                            {source.reviewerNotes && (
                              <p className="mt-1 text-xs italic text-[#111827]/60">
                                Notes: {source.reviewerNotes}
                              </p>
                            )}
                          </div>
                          <div className="flex flex-shrink-0 flex-wrap gap-1.5">
                            {source.status === "unvetted" || source.status === "flagged" ? (
                              <>
                                <Button
                                  className="h-7 px-2.5 text-xs"
                                  onClick={() => vetSource(source.id, "accepted")}
                                  variant="accent"
                                  size="sm"
                                  type="button"
                                >
                                  Accept
                                </Button>
                                <Button
                                  className="h-7 border-yellow-400 bg-yellow-50 px-2.5 text-xs text-yellow-800 hover:bg-yellow-100"
                                  onClick={() => vetSource(source.id, "flagged")}
                                  size="sm"
                                  type="button"
                                  variant="outline"
                                >
                                  Flag
                                </Button>
                                <Button
                                  className="h-7 px-2.5 text-xs"
                                  onClick={() => vetSource(source.id, "rejected")}
                                  size="sm"
                                  type="button"
                                  variant="outline"
                                >
                                  Reject
                                </Button>
                              </>
                            ) : (
                              <span
                                className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                                  source.status === "accepted"
                                    ? "bg-[#e8f3f4] text-[#15616d]"
                                    : source.status === "rejected"
                                      ? "bg-black/5 text-[#111827]/60"
                                      : "bg-yellow-100 text-yellow-800"
                                }`}
                              >
                                {source.status}
                              </span>
                            )}
                          </div>
                        </div>
                        {(source.status === "unvetted" || source.status === "flagged") && (
                          <div className="mt-2">
                            <input
                              className="w-full rounded-md border border-black/15 px-2 py-1 text-xs"
                              onChange={(e) =>
                                setSourceReviewNotes((prev) => ({
                                  ...prev,
                                  [source.id]: e.target.value,
                                }))
                              }
                              placeholder="Reviewer notes (optional)"
                              value={sourceReviewNotes[source.id] ?? ""}
                            />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                  {researchBrief.sources.filter((s) => s.status === "accepted").length > 0 && (
                    <div className="mt-4 rounded-lg border border-[#15616d]/30 bg-[#f1fbfc] p-4">
                      <p className="text-sm font-medium text-[#15616d]">
                        {researchBrief.sources.filter((s) => s.status === "accepted").length} source
                        {researchBrief.sources.filter((s) => s.status === "accepted").length > 1
                          ? "s"
                          : ""}{" "}
                        accepted — ready to feed into a claim map.
                      </p>
                      <p className="mt-1 text-xs text-[#0f4c55]">
                        Rejected and flagged sources are excluded from draft generation by default.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </section>

            {researchBrief &&
              researchBrief.sources.filter((s) => s.status === "accepted").length > 0 && (
                <section className="border-t border-black/10 pt-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-semibold">Claim Map</h2>
                      <p className="mt-1 text-sm text-[#111827]/60">
                        Candidate claims derived from accepted sources. Review each before drafting.
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      {claimMap && (
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-medium ${
                            claimMap.status === "reviewed"
                              ? "bg-[#e8f3f4] text-[#15616d]"
                              : "bg-[#fff4e6] text-[#8a4b00]"
                          }`}
                        >
                          {claimMap.status}
                        </span>
                      )}
                      <Button
                        variant="accent"
                        disabled={claimMapBusy}
                        onClick={generateClaimMap}
                        type="button"
                      >
                        {claimMapBusy
                          ? "Generating…"
                          : claimMap
                            ? "Regenerate Claim Map"
                            : "Generate Claim Map"}
                      </Button>
                    </div>
                  </div>

                  {claimMap && claimMap.claims.length > 0 && (
                    <div className="mt-5 space-y-3">
                      <div className="flex flex-wrap gap-3 text-xs text-[#111827]/60">
                        {CLAIM_STATUSES.filter((s) => s !== "unreviewed").map((s) => {
                          const count = claimMap.claims.filter((c) => c.status === s).length;
                          return count > 0 ? (
                            <span key={s}>
                              {CLAIM_STATUS_LABELS[s]}: {count}
                            </span>
                          ) : null;
                        })}
                        <span>
                          Unreviewed:{" "}
                          {claimMap.claims.filter((c) => c.status === "unreviewed").length}
                        </span>
                      </div>

                      {claimMap.claims.map((claim) => (
                        <div
                          key={claim.id}
                          className={`rounded-lg border p-4 ${
                            claim.status === "accepted"
                              ? "border-[#15616d]/30 bg-[#f1fbfc]"
                              : claim.status === "unsupported" ||
                                  claim.status === "too-risky" ||
                                  claim.status === "out-of-scope"
                                ? "border-black/10 bg-black/[0.02] opacity-60"
                                : claim.status === "needs-revision"
                                  ? "border-yellow-300 bg-yellow-50"
                                  : "border-black/10"
                          }`}
                        >
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium">{claim.text}</p>
                              <div className="mt-1 flex flex-wrap gap-2 text-xs text-[#111827]/60">
                                <span className="font-medium">{claim.evidenceLabel}</span>
                                <span>confidence: {claim.confidence}</span>
                                {claim.sourceIds.length > 0 && (
                                  <span>
                                    {claim.sourceIds.length} source
                                    {claim.sourceIds.length > 1 ? "s" : ""}
                                  </span>
                                )}
                              </div>
                              {claim.caveats && (
                                <p className="mt-1 text-xs italic text-[#111827]/60">
                                  Caveat: {claim.caveats}
                                </p>
                              )}
                              {claim.reviewerNotes && (
                                <p className="mt-1 text-xs text-[#111827]/60">
                                  Notes: {claim.reviewerNotes}
                                </p>
                              )}
                            </div>

                            <div className="flex flex-shrink-0 flex-col gap-1.5">
                              {claim.status === "unreviewed" || claim.status === "needs-revision" ? (
                                <div className="flex flex-wrap gap-1.5">
                                  <Button
                                    className="h-7 px-2.5 text-xs"
                                    onClick={() =>
                                      reviewClaim(claim.id, "accepted", claimReviewNotes[claim.id])
                                    }
                                    size="sm"
                                    type="button"
                                    variant="accent"
                                  >
                                    Accept
                                  </Button>
                                  <Button
                                    className="h-7 border-yellow-400 bg-yellow-50 px-2.5 text-xs text-yellow-800 hover:bg-yellow-100"
                                    onClick={() => reviewClaim(claim.id, "needs-revision")}
                                    size="sm"
                                    type="button"
                                    variant="outline"
                                  >
                                    Needs Revision
                                  </Button>
                                  <Button
                                    className="h-7 border-red-300 bg-red-50 px-2.5 text-xs text-red-700 hover:bg-red-100"
                                    onClick={() => reviewClaim(claim.id, "too-risky")}
                                    size="sm"
                                    type="button"
                                    variant="outline"
                                  >
                                    Too Risky
                                  </Button>
                                  <Button
                                    className="h-7 px-2.5 text-xs"
                                    onClick={() => reviewClaim(claim.id, "unsupported")}
                                    size="sm"
                                    type="button"
                                    variant="outline"
                                  >
                                    Unsupported
                                  </Button>
                                  <Button
                                    className="h-7 px-2.5 text-xs"
                                    onClick={() => reviewClaim(claim.id, "out-of-scope")}
                                    size="sm"
                                    type="button"
                                    variant="outline"
                                  >
                                    Out of Scope
                                  </Button>
                                </div>
                              ) : (
                                <span
                                  className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                                    claim.status === "accepted"
                                      ? "bg-[#e8f3f4] text-[#15616d]"
                                      : "bg-black/5 text-[#111827]/60"
                                  }`}
                                >
                                  {CLAIM_STATUS_LABELS[claim.status]}
                                </span>
                              )}
                            </div>
                          </div>

                          {(claim.status === "unreviewed" || claim.status === "needs-revision") && (
                            <div className="mt-2">
                              <input
                                className="w-full rounded-md border border-black/15 px-2 py-1 text-xs"
                                onChange={(e) =>
                                  setClaimReviewNotes((prev) => ({
                                    ...prev,
                                    [claim.id]: e.target.value,
                                  }))
                                }
                                placeholder="Reviewer notes (optional — included when accepting)"
                                value={claimReviewNotes[claim.id] ?? ""}
                              />
                            </div>
                          )}
                        </div>
                      ))}

                      {claimMap.status === "reviewed" && (
                        <div className="rounded-lg border border-[#15616d]/30 bg-[#f1fbfc] p-4">
                          <p className="text-sm font-medium text-[#15616d]">
                            {claimMap.claims.filter((c) => c.status === "accepted").length} claim
                            {claimMap.claims.filter((c) => c.status === "accepted").length !== 1
                              ? "s"
                              : ""}{" "}
                            accepted — ready to generate an editorial outline.
                          </p>
                          <p className="mt-1 text-xs text-[#0f4c55]">
                            Unsupported, too-risky, and out-of-scope claims are excluded from draft
                            generation by default.
                          </p>
                          <Button
                            className="mt-3 bg-[#15616d] hover:bg-[#104d56]"
                            disabled={
                              outlineBusy ||
                              claimMap.claims.filter((c) => c.status === "accepted").length === 0
                            }
                            onClick={generateOutline}
                            type="button"
                          >
                            {outlineBusy ? "Generating outline…" : "Generate Editorial Outline"}
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </section>
              )}

            {editorialOutline && (
              <section className="border-t border-black/10 pt-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold">Editorial Outline</h2>
                    <p className="mt-1 text-sm text-[#111827]/60">
                      Review the structure and approve before generating the long-form draft. AI never
                      auto-publishes — human approval required.
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-medium ${
                      editorialOutline.status === "approved"
                        ? "bg-[#e8f3f4] text-[#15616d]"
                        : editorialOutline.status === "generating-draft"
                          ? "bg-[#fff4e6] text-[#8a4b00]"
                          : "bg-black/5 text-[#111827]/70"
                    }`}
                  >
                    {editorialOutline.status}
                  </span>
                </div>

                <div className="mt-4 rounded-lg border border-black/10 bg-black/[0.02] p-4">
                  <p className="text-sm font-semibold">Thesis</p>
                  <p className="mt-1 text-sm text-[#111827]/80">
                    {renderableText(editorialOutline.thesis)}
                  </p>
                </div>

                <div className="mt-4 space-y-3">
                  <h3 className="text-sm font-semibold">
                    Sections ({editorialOutline.sections.length})
                  </h3>
                  {editorialOutline.sections.map((section, i) => (
                    <div key={i} className="rounded-lg border border-black/10 p-4">
                      <p className="text-sm font-medium">
                        {i + 1}. {renderableText(section.heading)}
                      </p>
                      <p className="mt-1 text-xs text-[#111827]/60">
                        {renderableText(section.notes)}
                      </p>
                      {section.evidenceLabels.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {section.evidenceLabels.map((label) => (
                            <span
                              key={renderableText(label)}
                              className="rounded-full bg-[#fff4e6] px-2 py-0.5 text-xs text-[#8a4b00]"
                            >
                              {renderableText(label)}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {editorialOutline.takeawayTable.length > 0 && (
                  <div className="mt-5">
                    <h3 className="text-sm font-semibold">Key Takeaways</h3>
                    <div className="mt-2 overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-black/10 text-left">
                            <th className="pb-2 pr-4 font-medium">Finding</th>
                            <th className="pb-2 pr-4 font-medium">Evidence</th>
                            <th className="pb-2 font-medium">Source</th>
                          </tr>
                        </thead>
                        <tbody>
                          {editorialOutline.takeawayTable.map((row, i) => (
                            <tr key={i} className="border-b border-black/5">
                              <td className="py-2 pr-4 text-[#111827]/80">
                                {renderableText(row.finding)}
                              </td>
                              <td className="py-2 pr-4 text-[#8a4b00]">
                                {renderableText(row.evidenceLabel)}
                              </td>
                              <td className="py-2 text-[#111827]/60">
                                {renderableText(row.source)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {editorialOutline.citationPlan && (
                  <div className="mt-4 rounded-lg border border-black/10 bg-black/[0.02] p-3">
                    <p className="text-xs font-semibold text-[#111827]/60">Citation plan</p>
                    <p className="mt-1 text-xs text-[#111827]/70">
                      {renderableText(editorialOutline.citationPlan)}
                    </p>
                  </div>
                )}

                {editorialOutline.status !== "approved" && !longFormDraft && (
                  <div className="mt-5 flex flex-wrap gap-3">
                    <Button
                      variant="accent"
                      disabled={draftBusy || !claimMap}
                      onClick={generateLongFormDraft}
                      type="button"
                    >
                      {draftBusy ? "Generating draft…" : "Approve & Generate Long-form Draft"}
                    </Button>
                  </div>
                )}

                {longFormDraft && (
                  <div className="mt-6">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="text-base font-semibold">Long-form Draft</h3>
                      <p className="rounded-full bg-red-50 px-3 py-1 text-xs text-red-700">
                        AI never auto-publishes — human review required before scheduling
                      </p>
                    </div>
                    <div className="mt-3 overflow-x-auto rounded-lg border border-black/10 bg-black/[0.02] p-4">
                      <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-[#111827]">
                        {longFormDraft}
                      </pre>
                    </div>
                    <p className="mt-2 text-xs text-[#111827]/50">
                      Copy this draft into your CMS or editor. Review all claims and citations before
                      publishing.
                    </p>
                  </div>
                )}

                {longFormDraft && !draftBusy && (
                  <div className="mt-4 rounded-lg border border-[#15616d]/30 bg-[#f1fbfc] p-4">
                    <p className="text-sm font-medium text-[#15616d]">
                      Long-form draft ready for human editorial review.
                    </p>
                    <p className="mt-1 text-xs text-[#0f4c55]">
                      Next step: review, edit, and schedule via your standard editorial workflow.
                      Regenerate if the draft needs major revision.
                    </p>
                    <Button
                      className="mt-2 border-[#15616d] text-[#15616d] hover:bg-[#e8f3f4]"
                      disabled={draftBusy}
                      onClick={generateLongFormDraft}
                      type="button"
                      variant="outline"
                    >
                      {draftBusy ? "Regenerating…" : "Regenerate Draft"}
                    </Button>
                  </div>
                )}
              </section>
            )}
          </div>
        )}
      </MainCard>
    </WorkspaceLayout>
  );
}
