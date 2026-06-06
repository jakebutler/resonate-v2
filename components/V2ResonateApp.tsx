"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  buildClarifyingContext,
  buildClarifyingQuestions,
  buildFallbackDraft,
  buildIdeaSeedText,
  CLAIM_STATUS_LABELS,
  CLAIM_STATUSES,
  DEFAULT_V2_STATE,
  EVIDENCE_LABEL_DESCRIPTIONS,
  EVIDENCE_LABELS,
  filterPostsForView,
  FRESHPROOF_SEED_BRIEF,
  makeClaimMap,
  makeId,
  makeResearchBrief,
  normalizeIdeaSourceUrl,
  V2_BRANDS,
  V2_CHANNEL_LABELS,
  V2_STATUS_LABELS,
  type V2BrandId,
  type V2ChannelId,
  type V2Claim,
  type V2ClaimMap,
  type V2ClaimStatus,
  type V2ClarifyingAnswer,
  type V2DraftVariant,
  type V2EditorialOutline,
  type V2Idea,
  type V2Post,
  type V2ResearchBrief,
  type V2ResearchDepth,
  type V2ResearchRiskLevel,
  type V2SourceRecord,
  type V2WorkspaceState,
} from "@/lib/v2";

const STORAGE_KEY = "resonate:v2:workspace";
const CORVO_HERO_IMAGE = "/images/corvo-labs-stacked.svg";

function nowIso() {
  return new Date().toISOString();
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function currentTimezone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Los_Angeles";
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

function normalizeEditorialOutlineForPersistence(outline: V2EditorialOutline): V2EditorialOutline {
  return {
    ...outline,
    thesis: renderableText(outline.thesis),
    sections: outline.sections.map((section) => ({
      heading: renderableText(section.heading),
      notes: renderableText(section.notes),
      claimIds: section.claimIds.map(renderableText).filter(Boolean),
      evidenceLabels: section.evidenceLabels.map(renderableText),
    })) as V2EditorialOutline["sections"],
    takeawayTable: outline.takeawayTable.map((row) => ({
      finding: renderableText(row.finding),
      evidenceLabel: renderableText(row.evidenceLabel),
      source: renderableText(row.source),
    })) as V2EditorialOutline["takeawayTable"],
    citationPlan: renderableText(outline.citationPlan),
  };
}

function loadState(): V2WorkspaceState {
  if (typeof window === "undefined") return DEFAULT_V2_STATE;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return DEFAULT_V2_STATE;
  try {
    const parsed = JSON.parse(raw) as V2WorkspaceState;
    return {
      ideas: Array.isArray(parsed.ideas) ? parsed.ideas : DEFAULT_V2_STATE.ideas,
      posts: Array.isArray(parsed.posts) ? parsed.posts : [],
      voicePacks: Array.isArray(parsed.voicePacks)
        ? parsed.voicePacks
        : DEFAULT_V2_STATE.voicePacks,
    };
  } catch {
    return DEFAULT_V2_STATE;
  }
}

function saveState(state: V2WorkspaceState) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

const STATUS_LABELS: Record<V2Post["status"], string> = {
  ...V2_STATUS_LABELS,
};

export function V2ResonateApp() {
  const createPersistedPostWithIntent = useMutation(
    api.v2Publishing.createPostWithIntent
  );
  const savePersistedResearchBrief = useMutation(api.v2Research.saveResearchBrief);
  const savePersistedClaimMap = useMutation(api.v2Research.saveClaimMap);
  const savePersistedEditorialOutline = useMutation(api.v2Research.saveEditorialOutline);
  const savePersistedLongFormDraft = useMutation(api.v2Research.saveLongFormDraft);
  const reviewPersistedSource = useMutation(api.v2Research.reviewSource);
  const reviewPersistedClaim = useMutation(api.v2Research.reviewClaim);
  const [state, setState] = useState<V2WorkspaceState>(DEFAULT_V2_STATE);
  const [brandId, setBrandId] = useState<V2BrandId>("corvo");
  const [ideaTitle, setIdeaTitle] = useState("");
  const [ideaNote, setIdeaNote] = useState("");
  const [ideaSourceUrl, setIdeaSourceUrl] = useState("");
  const [ideaTags, setIdeaTags] = useState("");
  const [selectedIdeaId, setSelectedIdeaId] = useState("idea-corvo-golden-sets");
  const [selectedChannels, setSelectedChannels] = useState<Set<V2ChannelId>>(
    new Set(["corvo-blog"])
  );
  const [variants, setVariants] = useState<V2DraftVariant[]>([]);
  const [generatingChannels, setGeneratingChannels] = useState<Set<V2ChannelId>>(new Set());
  const [clarifyingAnswers, setClarifyingAnswers] = useState<Record<string, string>>({});
  const [clarifyingPromptOpen, setClarifyingPromptOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [scheduleDates, setScheduleDates] = useState<Record<string, string>>({});
  const [allBrandsDrafts, setAllBrandsDrafts] = useState(false);
  const [draftStatusFilter, setDraftStatusFilter] = useState<V2Post["status"] | "">("");

  // Research pipeline state (#52)
  const [researchBrief, setResearchBrief] = useState<V2ResearchBrief | null>(null);
  const [researchTopic, setResearchTopic] = useState(FRESHPROOF_SEED_BRIEF.topic);
  const [researchAudience, setResearchAudience] = useState(FRESHPROOF_SEED_BRIEF.audience);
  const [researchThesis, setResearchThesis] = useState(FRESHPROOF_SEED_BRIEF.thesis);
  const [researchDepth, setResearchDepth] = useState<V2ResearchDepth>("rigorous");
  const [researchRisk, setResearchRisk] = useState<V2ResearchRiskLevel>("high");
  const [researchBusy, setResearchBusy] = useState(false);
  const [sourceReviewNotes, setSourceReviewNotes] = useState<Record<string, string>>({});
  const [persistedResearchBriefId, setPersistedResearchBriefId] =
    useState<Id<"v2ResearchBriefs"> | null>(null);

  // Claim map state (#53)
  const [claimMap, setClaimMap] = useState<V2ClaimMap | null>(null);
  const [claimMapBusy, setClaimMapBusy] = useState(false);
  const [claimReviewNotes, setClaimReviewNotes] = useState<Record<string, string>>({});
  const [persistedClaimMapId, setPersistedClaimMapId] =
    useState<Id<"v2ClaimMaps"> | null>(null);

  // Editorial outline + long-form draft state (#54)
  const [editorialOutline, setEditorialOutline] = useState<V2EditorialOutline | null>(null);
  const [outlineBusy, setOutlineBusy] = useState(false);
  const [persistedEditorialOutlineId, setPersistedEditorialOutlineId] =
    useState<Id<"v2EditorialOutlines"> | null>(null);
  const [longFormDraft, setLongFormDraft] = useState<string | null>(null);
  const [draftBusy, setDraftBusy] = useState(false);

  useEffect(() => {
    setState(loadState());
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") saveState(state);
  }, [state]);

  const brand = V2_BRANDS.find((item) => item.id === brandId) ?? V2_BRANDS[1];
  const ideas = state.ideas.filter((idea) => idea.brandId === brandId);
  const selectedIdea =
    ideas.find((idea) => idea.id === selectedIdeaId) ?? ideas[0] ?? null;
  const visiblePosts = filterPostsForView(
    state.posts,
    brandId,
    allBrandsDrafts,
    draftStatusFilter || undefined
  );
  const voicePack =
    state.voicePacks.find((pack) => pack.brandId === brandId && pack.isDefault) ??
    state.voicePacks.find((pack) => pack.brandId === brandId) ??
    state.voicePacks[0];

  const targetOptions = useMemo(() => {
    const channels = new Set<V2ChannelId>([
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
  const answeredClarifyingQuestions = useMemo<V2ClarifyingAnswer[]>(
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

  // Clear variant state when the selected Idea changes
  useEffect(() => {
    setVariants([]);
    setGeneratingChannels(new Set());
    setClarifyingAnswers({});
    setClarifyingPromptOpen(false);
  }, [selectedIdeaId]);

  // Sync channel selection to available options when brand changes
  useEffect(() => {
    setSelectedChannels((prev) => {
      const available = new Set(targetOptions);
      const next = new Set([...prev].filter((c) => available.has(c)));
      return next.size > 0 ? next : new Set(targetOptions.slice(0, 1));
    });
    setVariants([]);
    setClarifyingAnswers({});
    setClarifyingPromptOpen(false);
  }, [brandId, targetOptions]);

  function updateState(updater: (current: V2WorkspaceState) => V2WorkspaceState) {
    setState((current) => updater(current));
  }

  function toggleChannel(channelId: V2ChannelId) {
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

  function createIdea() {
    if (!ideaNote.trim()) {
      setNotice("Add a note before capturing an Idea.");
      return;
    }

    const id = makeId("idea");
    const sourceUrl = ideaSourceUrl.trim() || undefined;
    const normalizedSourceUrl = normalizeIdeaSourceUrl(sourceUrl);
    const tags = ideaTags
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);
    const createdAt = nowIso();

    const matchingIdea = normalizedSourceUrl
      ? ideas.find((idea) => idea.normalizedSourceUrl === normalizedSourceUrl)
      : undefined;

    if (matchingIdea) {
      updateState((current) => ({
        ...current,
        ideas: current.ideas.map((idea) =>
          idea.id === matchingIdea.id
            ? {
                ...idea,
                entries: [
                  ...idea.entries,
                  { id: makeId("entry"), content: ideaNote.trim(), createdAt },
                ],
                updatedAt: createdAt,
              }
            : idea
        ),
      }));
      setSelectedIdeaId(matchingIdea.id);
      setNotice("Matched existing source and appended this note to the Idea.");
    } else {
      const nextIdea: V2Idea = {
        id,
        brandId,
        title: ideaTitle.trim() || ideaNote.trim().slice(0, 80),
        sourceUrl,
        normalizedSourceUrl,
        tags,
        status: "inbox",
        entries: [{ id: makeId("entry"), content: ideaNote.trim(), createdAt }],
        linkedPostIds: [],
        createdAt,
        updatedAt: createdAt,
      };
      updateState((current) => ({ ...current, ideas: [nextIdea, ...current.ideas] }));
      setSelectedIdeaId(id);
      setNotice("Captured a new Idea.");
    }

    setIdeaTitle("");
    setIdeaNote("");
    setIdeaSourceUrl("");
    setIdeaTags("");
  }

  async function generateVariants() {
    if (!selectedIdea || !voicePack || selectedChannels.size === 0) return;

    if (missingClarifyingAnswers.length > 0) {
      setClarifyingPromptOpen(true);
      setNotice("Answer the clarifying questions before generating drafts.");
      return;
    }

    setNotice(null);
    setVariants([]);

    const channels = selectedChannelList;
    const clarifyingContext = buildClarifyingContext(answeredClarifyingQuestions);
    setGeneratingChannels(new Set(channels));

    await Promise.all(
      channels.map(async (channelId) => {
        try {
          const response = await fetch("/api/v2/generate-draft", {
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

          const variant: V2DraftVariant = {
            id: makeId("variant"),
            ideaId: selectedIdea.id,
            channelId,
            content,
            provider: data.provider ?? "local-placeholder",
            status: "pending",
          };

          setVariants((prev) => [...prev, variant]);
        } finally {
          setGeneratingChannels((prev) => {
            const next = new Set(prev);
            next.delete(channelId);
            return next;
          });
        }
      })
    );

    setNotice(
      `Generated ${channels.length} variant${channels.length > 1 ? "s" : ""}. Review and accept or reject each one.`
    );
  }

  async function acceptVariant(variant: V2DraftVariant) {
    if (!selectedIdea) return;
    const postId = makeId("post");
    const createdAt = nowIso();
    const title =
      variant.channelId === "youtube"
        ? `${selectedIdea.title} - YouTube outline`
        : selectedIdea.title;
    const post: V2Post = {
      id: postId,
      brandId,
      channelId: variant.channelId,
      ideaId: selectedIdea.id,
      title,
      content: variant.content,
      status: "draft",
      scheduledDate: today(),
      approvalState: "unapproved",
      createdAt,
      updatedAt: createdAt,
    };

    updateState((current) => ({
      ...current,
      posts: [post, ...current.posts],
      ideas: current.ideas.map((idea) =>
        idea.id === selectedIdea.id
          ? {
              ...idea,
              status: idea.status === "inbox" ? "reviewing" : idea.status,
              linkedPostIds: [...new Set([...idea.linkedPostIds, postId])],
              updatedAt: createdAt,
            }
          : idea
      ),
    }));

    setVariants((prev) =>
      prev.map((v) =>
        v.id === variant.id ? { ...v, status: "accepted", postId } : v
      )
    );

    try {
      const persisted = await createPersistedPostWithIntent({
        brandId,
        channelId: variant.channelId,
        title,
        content: variant.content,
        scheduledDate: post.scheduledDate,
        scheduledTime: "09:00",
        timezone: "America/Los_Angeles",
        sourceIdeaId: selectedIdea.id,
      });

      setVariants((prev) =>
        prev.map((v) =>
          v.id === variant.id
            ? { ...v, postId: String(persisted.postId) }
            : v
        )
      );
      setNotice(
        "Accepted variant and created a persisted scheduled-but-unapproved publishing intent."
      );
    } catch (error) {
      setNotice(
        error instanceof Error
          ? `Accepted locally. Persisted handoff needs workspace setup: ${error.message}`
          : "Accepted locally. Persisted handoff needs workspace setup."
      );
    }
  }

  function rejectVariant(variantId: string) {
    setVariants((prev) =>
      prev.map((v) => (v.id === variantId ? { ...v, status: "rejected" } : v))
    );
  }

  async function validateYouTube(post: V2Post) {
    setBusy("Validating YouTube placeholder");
    setNotice(null);
    try {
      const response = await fetch("/api/v2/validate-youtube", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: post.title,
          description: post.content,
          scheduledDate: post.scheduledDate,
        }),
      });
      const data = await response.json();
      if (data.ok) {
        updateState((current) => ({
          ...current,
          posts: current.posts.map((item) =>
            item.id === post.id
              ? { ...item, status: "scheduled", updatedAt: nowIso() }
              : item
          ),
        }));
      }
      setNotice(data.ok ? data.message : `${data.message} ${data.issues?.join(" ")}`);
    } finally {
      setBusy(null);
    }
  }

  async function createCorvoBlogPr(post: V2Post) {
    setBusy("Creating Corvo Labs PR");
    setNotice(null);
    try {
      const response = await fetch("/api/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: post.title,
          content: post.content,
          scheduledDate: post.scheduledDate ?? today(),
          scheduledTime: post.scheduledTime ?? "09:00",
          timezone: post.timezone ?? currentTimezone(),
          scheduleTrigger: "pr-body",
          status: "draft",
          excerpt:
            "A Corvo Labs draft generated from the Postiz-based Resonate v2 workflow.",
          author: "Jake Butler",
          tags: ["Corvo Labs", "Evals", "Claim Validation"],
          category: "strategy",
          featured: false,
          coverImageAlt: "Corvo Labs logo used as a placeholder blog hero.",
          images: [
            {
              sourceUrl: CORVO_HERO_IMAGE,
              alt: "Corvo Labs logo used as a placeholder blog hero.",
              isCover: true,
            },
          ],
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        setNotice(data.error || "GitHub PR creation failed.");
        return;
      }

      updateState((current) => ({
        ...current,
        posts: current.posts.map((item) =>
          item.id === post.id
            ? {
                ...item,
                status: "pr-created",
                prUrl: data.prUrl,
                branchName: data.branchName,
                scheduledDate: post.scheduledDate ?? today(),
                scheduledTime: post.scheduledTime ?? "09:00",
                timezone: post.timezone ?? currentTimezone(),
                providerState: {
                  providerId: "github-pr",
                  status: "submitted",
                  prUrl: data.prUrl,
                  lastResponseSummary:
                    data.sanitizedResponse?.number != null
                      ? `GitHub PR #${data.sanitizedResponse.number} created for manual review.`
                      : "GitHub PR created for manual review.",
                  updatedAt: nowIso(),
                },
                updatedAt: nowIso(),
              }
            : item
        ),
      }));
      setNotice(`Created Corvo Labs blog PR: ${data.prUrl}`);
    } finally {
      setBusy(null);
    }
  }

  function schedulePost(post: V2Post) {
    const date = scheduleDates[post.id] ?? post.scheduledDate ?? today();
    updateState((current) => ({
      ...current,
      posts: current.posts.map((item) =>
        item.id === post.id
          ? { ...item, status: "scheduled", scheduledDate: date, updatedAt: nowIso() }
          : item
      ),
    }));
    setNotice(`Scheduled "${post.title}" for ${date}.`);
  }

  async function generateClaimMap() {
    if (!researchBrief) return;
    const accepted = researchBrief.sources.filter((s) => s.status === "accepted");
    if (accepted.length === 0) return;
    setClaimMapBusy(true);
    setNotice(null);

    try {
      const response = await fetch("/api/v2/claim-map", {
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
      const claims: V2Claim[] = Array.isArray(data.claims) ? data.claims : [];
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

  async function reviewClaim(claimId: string, status: V2ClaimStatus, notes?: string) {
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
      const response = await fetch("/api/v2/editorial-outline", {
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
          data.outline as V2EditorialOutline
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
      const response = await fetch("/api/v2/long-form-draft", {
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
      const response = await fetch("/api/v2/research-brief", {
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
      const sources: V2SourceRecord[] = Array.isArray(data.sources) ? data.sources : [];
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
    newStatus: V2SourceRecord["status"],
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

  function resetDemo() {
    setState(DEFAULT_V2_STATE);
    setBrandId("corvo");
    setSelectedIdeaId("idea-corvo-golden-sets");
    setVariants([]);
    setGeneratingChannels(new Set());
    setResearchBrief(null);
    setPersistedResearchBriefId(null);
    setClaimMap(null);
    setPersistedClaimMapId(null);
    setEditorialOutline(null);
    setPersistedEditorialOutlineId(null);
    setLongFormDraft(null);
    setNotice("Reset v2 demo data.");
  }

  const pendingVariants = variants.filter((v) => v.status === "pending");
  const isGenerating = generatingChannels.size > 0;

  return (
    <main className="min-h-screen bg-[#f7f7f4] text-[#111827]">
      <header className="border-b border-black/10 bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-6 py-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#15616d]">
              Resonate v2
            </p>
            <h1 className="mt-1 text-2xl font-semibold">
              Postiz-based multi-brand content operations
            </h1>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/"
              className="rounded-md border border-black/15 px-3 py-2 text-sm font-medium hover:bg-black/5"
            >
              Legacy Resonate
            </Link>
            <button
              className="rounded-md border border-black/15 px-3 py-2 text-sm font-medium hover:bg-black/5"
              onClick={resetDemo}
              type="button"
            >
              Reset Demo
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-5 px-6 py-6 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="space-y-4">
          <section className="rounded-lg border border-black/10 bg-white p-4">
            <h2 className="text-sm font-semibold">Brand Workspaces</h2>
            <div className="mt-3 space-y-2">
              {V2_BRANDS.map((item) => (
                <button
                  className={`w-full rounded-md border px-3 py-2 text-left text-sm ${
                    item.id === brandId
                      ? "border-[#15616d] bg-[#e8f3f4]"
                      : "border-black/10 hover:bg-black/5"
                  }`}
                  key={item.id}
                  onClick={() => {
                    setBrandId(item.id);
                    setSelectedIdeaId(
                      state.ideas.find((idea) => idea.brandId === item.id)?.id ?? ""
                    );
                  }}
                  type="button"
                >
                  <span className="block font-medium">{item.name}</span>
                  <span className="block text-xs text-gray-500">
                    {item.validatedChannels.length
                      ? `${item.validatedChannels.length} validated channel(s)`
                      : "Manual-post placeholders"}
                  </span>
                </button>
              ))}
            </div>
          </section>

          <section className="rounded-lg border border-black/10 bg-white p-4">
            <h2 className="text-sm font-semibold">Default Voice Pack</h2>
            <p className="mt-2 text-sm font-medium">{voicePack?.name}</p>
            <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap rounded-md bg-[#111827] p-3 text-xs text-white">
              {voicePack?.markdown}
            </pre>
          </section>
        </aside>

        <div className="space-y-5">
          <section className="rounded-lg border border-black/10 bg-white p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold">{brand.name}</h2>
                <p className="mt-1 max-w-2xl text-sm text-gray-600">
                  {brand.description}
                </p>
              </div>
              <div className="text-sm text-gray-600">
                Target: {brand.targetChannels.map((id) => V2_CHANNEL_LABELS[id]).join(", ")}
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {brand.validatedChannels.map((id) => (
                <span
                  className="rounded-full bg-[#e8f3f4] px-3 py-1 text-xs font-medium text-[#15616d]"
                  key={id}
                >
                  Validated: {V2_CHANNEL_LABELS[id]}
                </span>
              ))}
              {!brand.validatedChannels.length && (
                <span className="rounded-full bg-[#fff4e6] px-3 py-1 text-xs font-medium text-[#8a4b00]">
                  Channels are manual-post placeholders for MVP
                </span>
              )}
            </div>
          </section>

          {notice && (
            <div className="rounded-lg border border-[#15616d]/30 bg-[#e8f3f4] px-4 py-3 text-sm text-[#0f4c55]">
              {notice}
            </div>
          )}

          <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
            <div className="rounded-lg border border-black/10 bg-white p-5">
              <h2 className="text-lg font-semibold">Ideas</h2>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <input
                  className="rounded-md border border-black/15 px-3 py-2 text-sm"
                  onChange={(event) => setIdeaTitle(event.target.value)}
                  placeholder="Idea title"
                  value={ideaTitle}
                />
                <input
                  className="rounded-md border border-black/15 px-3 py-2 text-sm"
                  onChange={(event) => setIdeaSourceUrl(event.target.value)}
                  placeholder="Optional source URL"
                  value={ideaSourceUrl}
                />
                <input
                  className="rounded-md border border-black/15 px-3 py-2 text-sm sm:col-span-2"
                  onChange={(event) => setIdeaTags(event.target.value)}
                  placeholder="Tags, comma separated"
                  value={ideaTags}
                />
                <textarea
                  className="min-h-28 rounded-md border border-black/15 px-3 py-2 text-sm sm:col-span-2"
                  onChange={(event) => setIdeaNote(event.target.value)}
                  placeholder="Capture the thought. The note is the atomic value."
                  value={ideaNote}
                />
              </div>
              <button
                className="mt-3 rounded-md bg-[#15616d] px-4 py-2 text-sm font-semibold text-white hover:bg-[#104d56]"
                onClick={createIdea}
                type="button"
              >
                Capture Idea
              </button>

              <div className="mt-5 space-y-3">
                {ideas.map((idea) => (
                  <button
                    className={`w-full rounded-lg border p-4 text-left ${
                      selectedIdea?.id === idea.id
                        ? "border-[#15616d] bg-[#f1fbfc]"
                        : "border-black/10 hover:bg-black/5"
                    }`}
                    key={idea.id}
                    onClick={() => setSelectedIdeaId(idea.id)}
                    type="button"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="font-medium">{idea.title}</h3>
                      <span className="rounded-full bg-black/5 px-2 py-1 text-xs">
                        {idea.status}
                      </span>
                    </div>
                    <p className="mt-2 line-clamp-2 text-sm text-gray-600">
                      {idea.entries.at(-1)?.content}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {idea.tags.map((tag) => (
                        <span className="rounded-full bg-[#fff4e6] px-2 py-1 text-xs" key={tag}>
                          {tag}
                        </span>
                      ))}
                    </div>
                    {idea.linkedPostIds.length > 0 && (
                      <p className="mt-2 text-xs text-gray-400">
                        {idea.linkedPostIds.length} linked post
                        {idea.linkedPostIds.length > 1 ? "s" : ""}
                      </p>
                    )}
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-black/10 bg-white p-5">
              <h2 className="text-lg font-semibold">Idea to Draft</h2>
              {selectedIdea ? (
                <>
                  <p className="mt-2 text-sm font-medium">{selectedIdea.title}</p>
                  <pre className="mt-3 max-h-40 overflow-auto whitespace-pre-wrap rounded-md bg-black/5 p-3 text-xs">
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
                                : "border-black/10 text-gray-600 hover:bg-black/5"
                            }`}
                          >
                            <input
                              checked={checked}
                              className="sr-only"
                              onChange={() => toggleChannel(id)}
                              type="checkbox"
                            />
                            {V2_CHANNEL_LABELS[id]}
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
                          <p className="mt-1 text-xs text-gray-600">
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

                  <button
                    className="mt-4 w-full rounded-md bg-[#ff7d00] px-4 py-2 text-sm font-semibold text-white hover:bg-[#dd6d00] disabled:opacity-60"
                    disabled={isGenerating || selectedChannels.size === 0}
                    onClick={generateVariants}
                    type="button"
                  >
                    {isGenerating
                      ? `Generating ${generatingChannels.size} remaining…`
                      : `Generate ${selectedChannels.size > 1 ? `${selectedChannels.size} Variants` : "Draft"}`}
                  </button>

                  {selectedChannels.size === 0 && (
                    <p className="mt-2 text-xs text-gray-500">
                      Select at least one channel to generate variants.
                    </p>
                  )}
                </>
              ) : (
                <p className="mt-2 text-sm text-gray-600">Capture or select an Idea.</p>
              )}

              {/* Variant review panel */}
              {variants.length > 0 && (
                <div className="mt-5 space-y-4">
                  <h3 className="text-sm font-semibold">
                    Variants for Review
                    {pendingVariants.length > 0 && (
                      <span className="ml-2 rounded-full bg-[#fff4e6] px-2 py-0.5 text-xs text-[#8a4b00]">
                        {pendingVariants.length} pending
                      </span>
                    )}
                  </h3>

                  {/* Still generating placeholders */}
                  {[...generatingChannels].map((channelId) => (
                    <div
                      key={channelId}
                      className="rounded-lg border border-black/10 bg-black/[0.02] p-4"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-gray-500">
                          {V2_CHANNEL_LABELS[channelId]}
                        </span>
                        <span className="rounded-full bg-black/5 px-2 py-0.5 text-xs text-gray-500">
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
                          {V2_CHANNEL_LABELS[variant.channelId]}
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="rounded-full bg-black/5 px-2 py-0.5 text-xs">
                            {variant.provider}
                          </span>
                          {variant.status === "pending" && (
                            <>
                              <button
                                className="rounded-md bg-[#15616d] px-3 py-1 text-xs font-semibold text-white hover:bg-[#104d56]"
                                onClick={() => acceptVariant(variant)}
                                type="button"
                              >
                                Accept
                              </button>
                              <button
                                className="rounded-md border border-black/15 px-3 py-1 text-xs font-medium hover:bg-black/5"
                                onClick={() => rejectVariant(variant.id)}
                                type="button"
                              >
                                Reject
                              </button>
                            </>
                          )}
                          {variant.status === "accepted" && (
                            <span className="rounded-full bg-[#e8f3f4] px-2 py-0.5 text-xs font-medium text-[#15616d]">
                              Accepted → Post
                            </span>
                          )}
                          {variant.status === "rejected" && (
                            <span className="rounded-full bg-black/5 px-2 py-0.5 text-xs text-gray-500">
                              Rejected
                            </span>
                          )}
                        </div>
                      </div>
                      <pre className="mt-3 max-h-60 overflow-auto whitespace-pre-wrap rounded-md bg-black/5 p-3 text-xs">
                        {variant.content}
                      </pre>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          <section className="rounded-lg border border-black/10 bg-white p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">Drafts and Publishing Handoff</h2>
              <div className="flex flex-wrap items-center gap-2">
                <label className="flex cursor-pointer items-center gap-1.5 text-sm">
                  <input
                    checked={allBrandsDrafts}
                    className="accent-[#15616d]"
                    onChange={(e) => setAllBrandsDrafts(e.target.checked)}
                    type="checkbox"
                  />
                  All brands
                </label>
                <select
                  className="rounded-md border border-black/15 px-2 py-1 text-xs"
                  onChange={(e) => setDraftStatusFilter(e.target.value as V2Post["status"] | "")}
                  value={draftStatusFilter}
                >
                  <option value="">All statuses</option>
                  <option value="draft">Draft</option>
                  <option value="scheduled">Scheduled</option>
                  <option value="pr-created">PR Created</option>
                </select>
              </div>
            </div>
            <div className="mt-4 grid gap-4">
              {visiblePosts.length === 0 && (
                <p className="text-sm text-gray-600">
                  No drafts match the current filter. Accept a variant from an Idea to create a draft.
                </p>
              )}
              {visiblePosts.map((post) => {
                const ideaTitle = state.ideas.find((i) => i.id === post.ideaId)?.title;
                const postBrand = allBrandsDrafts
                  ? V2_BRANDS.find((b) => b.id === post.brandId)?.name
                  : null;
                return (
                  <article className="rounded-lg border border-black/10 p-4" key={post.id}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h3 className="font-medium">{post.title}</h3>
                        <p className="mt-0.5 text-sm text-gray-500">
                          {V2_CHANNEL_LABELS[post.channelId]} ·{" "}
                          <span
                            className={
                              post.status === "scheduled" || post.status === "pr-created"
                                ? "text-[#15616d]"
                                : ""
                            }
                          >
                            {STATUS_LABELS[post.status]}
                          </span>
                        </p>
                        {postBrand && (
                          <p className="mt-0.5 text-xs font-medium text-[#15616d]">
                            {postBrand}
                          </p>
                        )}
                        {ideaTitle && (
                          <p className="mt-0.5 text-xs text-gray-400">
                            From idea: {ideaTitle}
                          </p>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        {/* Channel-specific actions */}
                        {post.channelId === "youtube" && post.status === "draft" && (
                          <button
                            className="rounded-md border border-black/15 px-3 py-1.5 text-sm font-medium hover:bg-black/5 disabled:opacity-60"
                            disabled={Boolean(busy)}
                            onClick={() => validateYouTube(post)}
                            type="button"
                          >
                            Validate YouTube Placeholder
                          </button>
                        )}
                        {post.channelId === "corvo-blog" && post.status === "draft" && (
                          <button
                            className="rounded-md border border-black/15 px-3 py-1.5 text-sm font-medium hover:bg-black/5 disabled:opacity-60"
                            disabled={Boolean(busy)}
                            onClick={() => createCorvoBlogPr(post)}
                            type="button"
                          >
                            Create Corvo Blog PR
                          </button>
                        )}

                        {/* Generic scheduling handoff for other channels */}
                        {post.status === "draft" &&
                          post.channelId !== "youtube" &&
                          post.channelId !== "corvo-blog" && (
                            <div className="flex items-center gap-2">
                              <input
                                className="rounded-md border border-black/15 px-2 py-1.5 text-xs"
                                onChange={(e) =>
                                  setScheduleDates((prev) => ({
                                    ...prev,
                                    [post.id]: e.target.value,
                                  }))
                                }
                                type="date"
                                value={scheduleDates[post.id] ?? post.scheduledDate ?? today()}
                              />
                              <button
                                className="rounded-md bg-[#15616d] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#104d56]"
                                onClick={() => schedulePost(post)}
                                type="button"
                              >
                                Schedule
                              </button>
                            </div>
                          )}
                      </div>
                    </div>

                    <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap rounded-md bg-black/5 p-3 text-sm">
                      {post.content}
                    </pre>
                    {post.prUrl && (
                      <a
                        className="mt-3 inline-flex text-sm font-medium text-[#15616d] underline"
                        href={post.prUrl}
                        rel="noreferrer"
                        target="_blank"
                      >
                        Open PR
                      </a>
                    )}
                  </article>
                );
              })}
            </div>
          </section>

          {/* Claim Map (#53) — visible once research brief has accepted sources */}
          {researchBrief &&
            researchBrief.sources.filter((s) => s.status === "accepted").length > 0 && (
              <section className="rounded-lg border border-black/10 bg-white p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold">Claim Map</h2>
                    <p className="mt-1 text-sm text-gray-500">
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
                    <button
                      className="rounded-md bg-[#15616d] px-4 py-2 text-sm font-semibold text-white hover:bg-[#104d56] disabled:opacity-60"
                      disabled={claimMapBusy}
                      onClick={generateClaimMap}
                      type="button"
                    >
                      {claimMapBusy
                        ? "Generating…"
                        : claimMap
                          ? "Regenerate Claim Map"
                          : "Generate Claim Map"}
                    </button>
                  </div>
                </div>

                {claimMap && claimMap.claims.length > 0 && (
                  <div className="mt-5 space-y-3">
                    <div className="flex flex-wrap gap-3 text-xs text-gray-500">
                      {CLAIM_STATUSES.filter((s) => s !== "unreviewed").map((s) => {
                        const count = claimMap.claims.filter((c) => c.status === s).length;
                        return count > 0 ? (
                          <span key={s}>
                            {CLAIM_STATUS_LABELS[s]}: {count}
                          </span>
                        ) : null;
                      })}
                      <span>Unreviewed: {claimMap.claims.filter((c) => c.status === "unreviewed").length}</span>
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
                            <div className="mt-1 flex flex-wrap gap-2 text-xs text-gray-500">
                              <span className="font-medium">{claim.evidenceLabel}</span>
                              <span>confidence: {claim.confidence}</span>
                              {claim.sourceIds.length > 0 && (
                                <span>{claim.sourceIds.length} source{claim.sourceIds.length > 1 ? "s" : ""}</span>
                              )}
                            </div>
                            {claim.caveats && (
                              <p className="mt-1 text-xs italic text-gray-500">
                                Caveat: {claim.caveats}
                              </p>
                            )}
                            {claim.reviewerNotes && (
                              <p className="mt-1 text-xs text-gray-500">
                                Notes: {claim.reviewerNotes}
                              </p>
                            )}
                          </div>

                          <div className="flex flex-shrink-0 flex-col gap-1.5">
                            {claim.status === "unreviewed" || claim.status === "needs-revision" ? (
                              <div className="flex flex-wrap gap-1.5">
                                <button
                                  className="rounded-md bg-[#15616d] px-2.5 py-1 text-xs font-semibold text-white"
                                  onClick={() => reviewClaim(claim.id, "accepted", claimReviewNotes[claim.id])}
                                  type="button"
                                >
                                  Accept
                                </button>
                                <button
                                  className="rounded-md border border-yellow-400 bg-yellow-50 px-2.5 py-1 text-xs font-semibold text-yellow-800"
                                  onClick={() => reviewClaim(claim.id, "needs-revision")}
                                  type="button"
                                >
                                  Needs Revision
                                </button>
                                <button
                                  className="rounded-md border border-red-300 bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700"
                                  onClick={() => reviewClaim(claim.id, "too-risky")}
                                  type="button"
                                >
                                  Too Risky
                                </button>
                                <button
                                  className="rounded-md border border-black/15 px-2.5 py-1 text-xs font-medium"
                                  onClick={() => reviewClaim(claim.id, "unsupported")}
                                  type="button"
                                >
                                  Unsupported
                                </button>
                                <button
                                  className="rounded-md border border-black/15 px-2.5 py-1 text-xs font-medium"
                                  onClick={() => reviewClaim(claim.id, "out-of-scope")}
                                  type="button"
                                >
                                  Out of Scope
                                </button>
                              </div>
                            ) : (
                              <span
                                className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                                  claim.status === "accepted"
                                    ? "bg-[#e8f3f4] text-[#15616d]"
                                    : "bg-black/5 text-gray-500"
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
                          {claimMap.claims.filter((c) => c.status === "accepted").length !== 1 ? "s" : ""}{" "}
                          accepted — ready to generate an editorial outline.
                        </p>
                        <p className="mt-1 text-xs text-[#0f4c55]">
                          Unsupported, too-risky, and out-of-scope claims are excluded from draft
                          generation by default.
                        </p>
                        <button
                          className="mt-3 rounded-md bg-[#15616d] px-4 py-2 text-sm font-semibold text-white hover:bg-[#104d56] disabled:opacity-60"
                          disabled={
                            outlineBusy ||
                            claimMap.claims.filter((c) => c.status === "accepted").length === 0
                          }
                          onClick={generateOutline}
                          type="button"
                        >
                          {outlineBusy ? "Generating outline…" : "Generate Editorial Outline"}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </section>
            )}

          {/* Editorial Outline + Long-form Draft (#54) */}
          {editorialOutline && (
            <section className="rounded-lg border border-black/10 bg-white p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">Editorial Outline</h2>
                  <p className="mt-1 text-sm text-gray-500">
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
                        : "bg-black/5 text-gray-600"
                  }`}
                >
                  {editorialOutline.status}
                </span>
              </div>

              <div className="mt-4 rounded-lg border border-black/10 bg-black/[0.02] p-4">
                <p className="text-sm font-semibold">Thesis</p>
                <p className="mt-1 text-sm text-gray-700">{renderableText(editorialOutline.thesis)}</p>
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
                    <p className="mt-1 text-xs text-gray-500">{renderableText(section.notes)}</p>
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
                            <td className="py-2 pr-4 text-gray-700">{renderableText(row.finding)}</td>
                            <td className="py-2 pr-4 text-[#8a4b00]">{renderableText(row.evidenceLabel)}</td>
                            <td className="py-2 text-gray-500">{renderableText(row.source)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {editorialOutline.citationPlan && (
                <div className="mt-4 rounded-lg border border-black/10 bg-black/[0.02] p-3">
                  <p className="text-xs font-semibold text-gray-500">Citation plan</p>
                  <p className="mt-1 text-xs text-gray-600">{renderableText(editorialOutline.citationPlan)}</p>
                </div>
              )}

              {editorialOutline.status !== "approved" && !longFormDraft && (
                <div className="mt-5 flex flex-wrap gap-3">
                  <button
                    className="rounded-md bg-[#15616d] px-4 py-2 text-sm font-semibold text-white hover:bg-[#104d56] disabled:opacity-60"
                    disabled={draftBusy || !claimMap}
                    onClick={generateLongFormDraft}
                    type="button"
                  >
                    {draftBusy ? "Generating draft…" : "Approve & Generate Long-form Draft"}
                  </button>
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
                    <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-gray-800">
                      {longFormDraft}
                    </pre>
                  </div>
                  <p className="mt-2 text-xs text-gray-400">
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
                  <button
                    className="mt-2 rounded-md border border-[#15616d] px-3 py-1.5 text-xs font-medium text-[#15616d] hover:bg-[#e8f3f4] disabled:opacity-60"
                    disabled={draftBusy}
                    onClick={generateLongFormDraft}
                    type="button"
                  >
                    {draftBusy ? "Regenerating…" : "Regenerate Draft"}
                  </button>
                </div>
              )}
            </section>
          )}

          {/* Research / Editorial Pipeline (#52) */}
          <section className="rounded-lg border border-black/10 bg-white p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">Research Editorial Pipeline</h2>
                <p className="mt-1 text-sm text-gray-500">
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
                    <label className="block text-xs font-medium text-gray-600">Depth</label>
                    <select
                      className="mt-1 w-full rounded-md border border-black/15 px-2 py-1.5 text-sm"
                      onChange={(e) => setResearchDepth(e.target.value as V2ResearchDepth)}
                      value={researchDepth}
                    >
                      <option value="light">Light</option>
                      <option value="standard">Standard</option>
                      <option value="rigorous">Rigorous</option>
                    </select>
                  </div>
                  <div className="flex-1">
                    <label className="block text-xs font-medium text-gray-600">Risk level</label>
                    <select
                      className="mt-1 w-full rounded-md border border-black/15 px-2 py-1.5 text-sm"
                      onChange={(e) => setResearchRisk(e.target.value as V2ResearchRiskLevel)}
                      value={researchRisk}
                    >
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High (clinical/scientific)</option>
                    </select>
                  </div>
                </div>
                <button
                  className="w-full rounded-md bg-[#15616d] px-4 py-2 text-sm font-semibold text-white hover:bg-[#104d56] disabled:opacity-60"
                  disabled={researchBusy || !researchTopic.trim() || !researchAudience.trim()}
                  onClick={runSourceDiscovery}
                  type="button"
                >
                  {researchBusy ? "Discovering sources…" : "Run Source Discovery"}
                </button>
              </div>

              <div className="space-y-3">
                <h3 className="text-sm font-semibold">Evidence Labels Rubric</h3>
                <div className="space-y-2">
                  {EVIDENCE_LABELS.map((label) => (
                    <div key={label} className="rounded-md border border-black/10 p-2">
                      <p className="text-xs font-semibold">{label}</p>
                      <p className="mt-0.5 text-xs text-gray-500">
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
                    <span className="ml-2 text-sm font-normal text-gray-500">
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
                          <p className="mt-0.5 text-xs text-gray-500">
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
                                    : "text-gray-500"
                              }
                            >
                              {source.qualityRating}
                            </span>
                          </p>
                          <p className="mt-1 text-xs text-gray-600">{source.useCase}</p>
                          {source.reviewerNotes && (
                            <p className="mt-1 text-xs italic text-gray-500">
                              Notes: {source.reviewerNotes}
                            </p>
                          )}
                        </div>
                        <div className="flex flex-shrink-0 flex-wrap gap-1.5">
                          {source.status === "unvetted" || source.status === "flagged" ? (
                            <>
                              <button
                                className="rounded-md bg-[#15616d] px-2.5 py-1 text-xs font-semibold text-white"
                                onClick={() => vetSource(source.id, "accepted")}
                                type="button"
                              >
                                Accept
                              </button>
                              <button
                                className="rounded-md border border-yellow-400 bg-yellow-50 px-2.5 py-1 text-xs font-semibold text-yellow-800"
                                onClick={() => vetSource(source.id, "flagged")}
                                type="button"
                              >
                                Flag
                              </button>
                              <button
                                className="rounded-md border border-black/15 px-2.5 py-1 text-xs font-medium"
                                onClick={() => vetSource(source.id, "rejected")}
                                type="button"
                              >
                                Reject
                              </button>
                            </>
                          ) : (
                            <span
                              className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                                source.status === "accepted"
                                  ? "bg-[#e8f3f4] text-[#15616d]"
                                  : source.status === "rejected"
                                    ? "bg-black/5 text-gray-500"
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
                      accepted — ready to feed into a claim map (#53).
                    </p>
                    <p className="mt-1 text-xs text-[#0f4c55]">
                      Rejected and flagged sources are excluded from draft generation by default.
                    </p>
                  </div>
                )}
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
