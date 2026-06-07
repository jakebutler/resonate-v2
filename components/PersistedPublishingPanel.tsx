"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useMutation, useQuery } from "convex/react";
import {
  CalendarDays,
  Ban,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Calendar,
  Eye,
  ExternalLink,
  FileText,
  History,
  Save,
  RotateCcw,
  Send,
  Trash2,
  X,
} from "lucide-react";
import { SocialConnectionsPanel } from "@/components/SocialConnectionsPanel";
import { FilterGroup, toggleFilterSet } from "@/components/shell/FilterGroup";
import { MainCard } from "@/components/shell/MainCard";
import { Notice } from "@/components/shell/Notice";
import { PageHeader } from "@/components/shell/PageHeader";
import { SidebarCard } from "@/components/shell/SidebarCard";
import { WorkspaceLayout } from "@/components/shell/WorkspaceLayout";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { normalizeScheduledDate, parseScheduledDate } from "@/lib/calendarDates";
import {
  BRANDS,
  CHANNEL_LABELS,
  STATUS_LABELS,
  type BrandId,
  type ChannelId,
  type PostStatus,
} from "@/lib/domain";

type CalendarView = "month" | "week";
type PersistedCalendarItem = {
  post: {
    _id: Id<"v2Posts">;
    brandId: BrandId;
    channelId: ChannelId;
    platformId: string;
    title: string;
    content: string;
    status: PostStatus;
    approvalState: string;
    scheduledDate?: string;
    scheduledTime?: string;
    timezone?: string;
    sourceIdeaId?: string;
    sourceResearchBriefId?: string;
    prUrl?: string;
    branchName?: string;
    blogExcerpt?: string;
    blogAuthor?: string;
    blogCategory?: string;
    blogTags?: string[];
    blogSlug?: string;
    heroImageUrl?: string;
    heroImageStorageId?: Id<"_storage">;
    blogPrNumber?: number;
    blogPrStatus?: "open" | "merged" | "closed" | "draft";
  };
  intent?: {
    _id?: Id<"v2PublishingIntents">;
    scheduledDate?: string;
    scheduledTime?: string;
    timezone?: string;
    approvalState?: string;
    contentFingerprint?: string;
  } | null;
  providerState?: {
    providerId?: string;
    status?: string;
    providerPostId?: string;
    prUrl?: string;
    lastResponseSummary?: string;
    simulated?: boolean;
  } | null;
  attemptCount: number;
  lastAttempt?: {
    status?: string;
  } | null;
  attempts?: Array<{
    _id?: Id<"v2PublishAttempts">;
    providerId?: string;
    status?: string;
    idempotencyKey?: string;
    retryCount?: number;
    sanitizedResponse?: unknown;
    createdAt?: number;
  }>;
  auditEvents?: Array<{
    _id?: Id<"v2AuditEvents">;
    action?: string;
    summary?: string;
    createdAt?: number;
  }>;
};

const brandOptions = BRANDS.map((brand) => ({
  id: brand.id,
  name: brand.name,
}));

const platformOptions: Array<{ id: ChannelId; label: string }> = [
  { id: "linkedin", label: "LinkedIn" },
  { id: "reddit", label: "Reddit" },
  { id: "corvo-blog", label: "Corvo Blog" },
  { id: "x", label: "X" },
  { id: "youtube", label: "YouTube" },
  { id: "instagram", label: "Instagram" },
  { id: "tiktok", label: "TikTok" },
];

const statusOptions: Array<{ id: PostStatus; label: string }> = [
  { id: "draft", label: "Draft" },
  { id: "approved", label: "Approved" },
  { id: "scheduled", label: "Scheduled" },
  { id: "submitted", label: "Submitted" },
  { id: "published", label: "Published" },
  { id: "needs-review", label: "Needs Review" },
  { id: "failed", label: "Failed" },
  { id: "unavailable", label: "Unavailable" },
  { id: "pr-created", label: "PR Created" },
];

const BLOG_CATEGORIES = [
  "strategy",
  "product",
  "engineering",
  "culture",
  "research",
] as const;

const DEFAULT_BLOG_AUTHOR = "Jake Butler";
const DEFAULT_BLOG_CATEGORY = "strategy";

function slugifyTitle(title: string) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function parseTagsInput(value: string) {
  return value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function blogPrReady(post: PersistedCalendarItem["post"]) {
  return Boolean(
    post.title.trim() &&
      post.content.trim() &&
      post.blogExcerpt?.trim() &&
      post.blogAuthor?.trim() &&
      post.blogCategory?.trim() &&
      (post.heroImageUrl?.trim() || post.heroImageStorageId)
  );
}

function prStatusLabel(status?: string) {
  if (!status) return "Unknown";
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function nextFridayDate() {
  const date = new Date();
  const day = date.getDay();
  const distance = ((5 - day + 7) % 7) || 7;
  date.setDate(date.getDate() + distance);
  return date.toISOString().slice(0, 10);
}

function fallbackDisplayTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Los_Angeles";
  } catch {
    return "America/Los_Angeles";
  }
}

function formatYMD(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function addMonths(date: Date, months: number) {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
}

function startOfWeek(date: Date) {
  return addDays(date, -date.getDay());
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1, 12);
}

function endOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 12);
}

function itemScheduledDate(item: PersistedCalendarItem) {
  return normalizeScheduledDate(item.intent?.scheduledDate ?? item.post.scheduledDate);
}

function channelLabel(channelId: string) {
  return CHANNEL_LABELS[channelId as ChannelId] ?? channelId;
}

function statusLabel(status: string) {
  return STATUS_LABELS[status as PostStatus] ?? status;
}

function formatDateLabel(date: string) {
  return parseScheduledDate(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatRangeLabel(view: CalendarView, anchor: Date) {
  if (view === "month") {
    return anchor.toLocaleDateString("en-US", {
      month: "long",
      year: "numeric",
    });
  }

  const start = startOfWeek(anchor);
  const end = addDays(start, 6);
  return `${start.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  })} - ${end.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })}`;
}

function datesForView(view: CalendarView, anchor: Date) {
  if (view === "week") {
    const start = startOfWeek(anchor);
    return Array.from({ length: 7 }, (_, index) => addDays(start, index));
  }

  const firstVisible = startOfWeek(startOfMonth(anchor));
  const lastMonthDay = endOfMonth(anchor);
  const lastVisible = addDays(lastMonthDay, 6 - lastMonthDay.getDay());
  const dates: Date[] = [];
  for (let cursor = firstVisible; cursor <= lastVisible; cursor = addDays(cursor, 1)) {
    dates.push(cursor);
  }
  return dates;
}

function formatDateTime(date?: string, time?: string, timezone?: string) {
  if (!date) return "Unscheduled";
  const dateLabel = time ? `${formatDateLabel(date)} at ${time}` : formatDateLabel(date);
  return `${dateLabel} ${timezone || fallbackDisplayTimezone()}`;
}

function formatTimestamp(timestamp?: number) {
  if (!timestamp) return "Unknown time";
  return new Date(timestamp).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function renderJson(value: unknown) {
  if (value === undefined || value === null) return "No response stored.";
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function PersistedPublishingPanel({
  initialPostId,
  devMode = false,
}: {
  initialPostId?: string;
  devMode?: boolean;
} = {}) {
  const [brandFilters, setBrandFilters] = useState<BrandId[]>(["corvo"]);
  const [platformFilters, setPlatformFilters] = useState<ChannelId[]>([
    "linkedin",
    "reddit",
    "corvo-blog",
  ]);
  const [statusFilters, setStatusFilters] = useState<PostStatus[]>([
    "draft",
    "scheduled",
    "submitted",
    "needs-review",
  ]);
  const [calendarView, setCalendarView] = useState<CalendarView>("month");
  const [calendarAnchor, setCalendarAnchor] = useState<string | null>(null);
  const [manualSelectedPostId, setManualSelectedPostId] = useState<
    Id<"v2Posts"> | null | undefined
  >(undefined);
  const [message, setMessage] = useState<string | null>(null);

  const brands = useQuery(api.publishing.listBrands);
  const items = useQuery(api.publishing.listCalendarItems, {
    brandIds: brandFilters,
    platformIds: platformFilters,
    statuses: statusFilters,
  }) as PersistedCalendarItem[] | undefined;
  const seedWorkspace = useMutation(api.publishing.seedMvpWorkspace);
  const createPostWithIntent = useMutation(api.publishing.createPostWithIntent);
  const setApproval = useMutation(api.publishing.setApproval);
  const reschedule = useMutation(api.publishing.reschedule);
  const updateContent = useMutation(api.publishing.updateContent);
  const submitMockProvider = useMutation(api.publishing.submitMockProvider);
  const recordProviderIntent = useMutation(api.publishing.recordProviderIntent);
  const recordGithubPr = useMutation(api.publishing.recordGithubPr);
  const updateBlogMetadata = useMutation(api.publishing.updateBlogMetadata);
  const recordBlogPrStatus = useMutation(api.publishing.recordBlogPrStatus);
  const deletePost = useMutation(api.publishing.deletePost);

  const isSeeded = (brands?.length ?? 0) > 0;
  const visibleItems = useMemo(() => items ?? [], [items]);
  const loading = brands === undefined || items === undefined;
  const workspaceReady = isSeeded && !loading;

  useEffect(() => {
    if (brands === undefined || brands.length > 0) return;
    void seedWorkspace({}).catch((error: unknown) => {
      const message =
        error instanceof Error ? error.message : "Workspace setup requires sign-in.";
      setMessage(message);
    });
  }, [brands, seedWorkspace]);
  const firstScheduledDate = visibleItems
    .map((item) => itemScheduledDate(item))
    .find((date): date is string => Boolean(date));
  const anchorDate = useMemo(() => {
    const candidate = calendarAnchor ?? firstScheduledDate;
    if (!candidate) return new Date();
    const parsed = parseScheduledDate(candidate);
    return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  }, [calendarAnchor, firstScheduledDate]);
  const displayTimezone = fallbackDisplayTimezone();
  const visibleDates = useMemo(
    () => datesForView(calendarView, anchorDate),
    [calendarView, anchorDate]
  );
  const visibleDateKeys = useMemo(
    () => new Set(visibleDates.map((date) => formatYMD(date))),
    [visibleDates]
  );
  const itemsByDate = useMemo(() => {
    return visibleItems.reduce<Record<string, PersistedCalendarItem[]>>((acc, item) => {
      const date = itemScheduledDate(item);
      if (!date) return acc;
      acc[date] = [...(acc[date] ?? []), item];
      return acc;
    }, {});
  }, [visibleItems]);
  const rangeItems = useMemo(
    () =>
      visibleItems
        .filter((item) => {
          const date = itemScheduledDate(item);
          return date ? visibleDateKeys.has(date) : false;
        })
        .sort((a, b) => {
          const aDate = itemScheduledDate(a) ?? "";
          const bDate = itemScheduledDate(b) ?? "";
          return `${aDate} ${a.intent?.scheduledTime ?? ""}`.localeCompare(
            `${bDate} ${b.intent?.scheduledTime ?? ""}`
          );
        }),
    [visibleDateKeys, visibleItems]
  );
  const providerSummary = useMemo(() => {
    const submitted = visibleItems.filter(
      (item) => item.providerState?.status === "submitted"
    ).length;
    const needsReview = visibleItems.filter(
      (item) => item.providerState?.status === "needs-review"
    ).length;
    const notSubmitted = visibleItems.filter(
      (item) => item.providerState?.status === "not-submitted"
    ).length;
    return { submitted, needsReview, notSubmitted };
  }, [visibleItems]);
  const autoSelectedPostId = useMemo(() => {
    if (!initialPostId || loading) return null;
    return visibleItems.find((item) => item.post._id === initialPostId)?.post._id ?? null;
  }, [initialPostId, loading, visibleItems]);
  const selectedPostId =
    manualSelectedPostId === undefined ? autoSelectedPostId : manualSelectedPostId;
  const selectedItem = useMemo(
    () => visibleItems.find((item) => item.post._id === selectedPostId) ?? null,
    [selectedPostId, visibleItems]
  );

  async function handleSeed() {
    await seedWorkspace({});
    setMessage("Repaired workspace brands and channels.");
  }

  async function handleCreateBlankPost(channelId: ChannelId) {
    const title =
      channelId === "corvo-blog"
        ? "Untitled blog post"
        : `Untitled ${CHANNEL_LABELS[channelId]} post`;
    try {
      if (!workspaceReady) {
        await seedWorkspace({});
      }
      await createPostWithIntent({
        brandId: channelId === "reddit" ? "freshproof" : "corvo",
        channelId,
        title,
        content: "",
        scheduledDate: nextFridayDate(),
        scheduledTime: "09:00",
        timezone: "America/Los_Angeles",
      });
      setMessage(`Created a blank ${CHANNEL_LABELS[channelId]} draft on the calendar.`);
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Failed to create draft.";
      setMessage(`Could not create ${CHANNEL_LABELS[channelId]} draft: ${detail}.`);
    }
  }

  async function handleDelete(postId: Id<"v2Posts">, title: string) {
    if (!window.confirm(`Delete "${title}"? This cannot be undone.`)) return;
    try {
      await deletePost({ postId });
      if (selectedPostId === postId) {
        setManualSelectedPostId(null);
      }
      setMessage(`Deleted "${title}".`);
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Failed to delete draft.";
      setMessage(`Could not delete draft: ${detail}`);
    }
  }

  async function handleApprove(postId: Id<"v2Posts">) {
    await setApproval({ postId, approvalState: "approved" });
    setMessage("Approved item. Date-only reschedules now preserve approval.");
  }

  async function handleSaveComposer(
    item: PersistedCalendarItem,
    values: {
      title: string;
      content: string;
      scheduledDate: string;
      scheduledTime: string;
      timezone: string;
      blogMetadata?: {
        blogExcerpt?: string;
        blogAuthor?: string;
        blogCategory?: string;
        blogTags?: string[];
        blogSlug?: string;
        heroImageUrl?: string;
        heroImageStorageId?: Id<"_storage">;
      };
    }
  ) {
    const titleChanged = values.title.trim() !== item.post.title;
    const contentChanged = values.content !== item.post.content;
    const scheduleChanged =
      values.scheduledDate !== (item.intent?.scheduledDate ?? item.post.scheduledDate ?? "") ||
      values.scheduledTime !== (item.intent?.scheduledTime ?? item.post.scheduledTime ?? "") ||
      values.timezone !== (item.intent?.timezone ?? item.post.timezone ?? "America/Los_Angeles");
    const blogMetadata = values.blogMetadata;
    const blogMetadataChanged =
      item.post.channelId === "corvo-blog" &&
      blogMetadata !== undefined &&
      (blogMetadata.blogExcerpt !== (item.post.blogExcerpt ?? "") ||
        blogMetadata.blogAuthor !== (item.post.blogAuthor ?? "") ||
        blogMetadata.blogCategory !== (item.post.blogCategory ?? "") ||
        JSON.stringify(blogMetadata.blogTags ?? []) !==
          JSON.stringify(item.post.blogTags ?? []) ||
        blogMetadata.blogSlug !== (item.post.blogSlug ?? "") ||
        blogMetadata.heroImageUrl !== (item.post.heroImageUrl ?? "") ||
        blogMetadata.heroImageStorageId !== item.post.heroImageStorageId);

    if (titleChanged || contentChanged) {
      await updateContent({
        postId: item.post._id,
        title: values.title.trim(),
        content: values.content,
      });
    }
    if (blogMetadataChanged && blogMetadata) {
      await updateBlogMetadata({
        postId: item.post._id,
        metadata: blogMetadata,
      });
    }
    if (scheduleChanged) {
      await reschedule({
        postId: item.post._id,
        scheduledDate: values.scheduledDate,
        scheduledTime: values.scheduledTime,
        timezone: values.timezone,
      });
    }

    if (titleChanged || contentChanged || blogMetadataChanged) {
      setMessage(
        blogMetadataChanged && !titleChanged && !contentChanged
          ? "Saved metadata changes and cleared approval for re-review."
          : "Saved composer changes and cleared approval for re-review."
      );
    } else if (scheduleChanged) {
      setMessage("Saved date/time changes without changing approval.");
    } else {
      setMessage("No composer changes to save.");
    }
  }

  async function handleSubmit(postId: Id<"v2Posts">) {
    const result = await submitMockProvider({ postId, mode: "success" });
    setMessage(
      result.submitted
        ? "Simulated submission recorded. No post was sent to the platform."
        : (result.reason ?? "Simulated submission was skipped.")
    );
  }

  async function handleRetry(postId: Id<"v2Posts">) {
    const result = await submitMockProvider({ postId, mode: "success", retry: true });
    setMessage(
      result.submitted
        ? "Simulated submission retry recorded."
        : (result.reason ?? "Simulated submission retry was skipped.")
    );
  }

  async function handleProviderIntent(
    postId: Id<"v2Posts">,
    intentType: "cancel" | "unpublish"
  ) {
    const result = await recordProviderIntent({ postId, intentType });
    setMessage(
      result.recorded
        ? intentType === "unpublish"
          ? "Recorded an unpublish intent for operator follow-up."
          : "Recorded a cancel intent for operator follow-up."
        : "Provider intent was not recorded."
    );
  }

  async function handleCreatePr(item: PersistedCalendarItem) {
    if (item.post.channelId !== "corvo-blog") {
      setMessage("Open PR is only available for Corvo Blog posts.");
      return;
    }
    if (item.post.approvalState !== "approved") {
      setMessage("Approve the post before opening a pull request.");
      return;
    }
    if (!blogPrReady(item.post)) {
      setMessage(
        "Fill in excerpt, author, category, content, and a hero image before opening a PR."
      );
      return;
    }
    const existingPrUrl = item.post.prUrl ?? item.providerState?.prUrl;
    if (existingPrUrl) {
      setMessage(`Pull request already exists: ${existingPrUrl}`);
      return;
    }

    const heroSourceUrl = item.post.heroImageUrl?.trim();
    if (!heroSourceUrl) {
      setMessage("Hero image URL is required before opening a PR.");
      return;
    }

    setMessage("Opening Corvo Blog pull request...");
    const response = await fetch("/api/publish", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: item.post.title,
        content: item.post.content,
        scheduledDate: item.intent?.scheduledDate ?? item.post.scheduledDate ?? nextFridayDate(),
        scheduledTime: item.intent?.scheduledTime ?? item.post.scheduledTime ?? "09:00",
        timezone: item.intent?.timezone ?? item.post.timezone ?? "America/Los_Angeles",
        scheduleTrigger: "pr-body",
        status: "draft",
        excerpt: item.post.blogExcerpt,
        author: item.post.blogAuthor,
        tags: item.post.blogTags ?? [],
        category: item.post.blogCategory,
        featured: false,
        coverImageAlt: `Cover image for ${item.post.title}`,
        images: [
          {
            sourceUrl: heroSourceUrl,
            alt: `Cover image for ${item.post.title}`,
            isCover: true,
          },
        ],
      }),
    });
    const data = await response.json();
    if (!response.ok) {
      setMessage(data.error || "GitHub PR creation failed.");
      return;
    }

    const sanitized =
      data.sanitizedResponse &&
      typeof data.sanitizedResponse === "object" &&
      !Array.isArray(data.sanitizedResponse)
        ? (data.sanitizedResponse as Record<string, unknown>)
        : {};
    const prNumber =
      typeof sanitized.number === "number"
        ? sanitized.number
        : typeof data.number === "number"
          ? data.number
          : undefined;
    const prStatusRaw = typeof sanitized.state === "string" ? sanitized.state : "open";
    const prStatus =
      prStatusRaw === "merged" ||
      prStatusRaw === "closed" ||
      prStatusRaw === "draft" ||
      prStatusRaw === "open"
        ? prStatusRaw
        : "open";

    await recordGithubPr({
      postId: item.post._id,
      result: {
        prUrl: data.prUrl,
        branchName: data.branchName,
        prNumber,
        prStatus,
        sanitizedResponse: data.sanitizedResponse ?? {
          prUrl: data.prUrl,
          branchName: data.branchName,
          number: prNumber,
          state: prStatus,
        },
      },
    });
    setMessage(`Opened Corvo Blog PR: ${data.prUrl}`);
  }

  async function handleCheckPrStatus(item: PersistedCalendarItem) {
    const prUrl = item.post.prUrl ?? item.providerState?.prUrl;
    if (!prUrl) {
      setMessage("No pull request URL to check.");
      return;
    }

    setMessage("Checking pull request status...");
    const response = await fetch("/api/blog-pr-status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prUrl }),
    });
    const data = await response.json();
    if (!response.ok) {
      setMessage(data.error || "PR status check failed.");
      return;
    }

    await recordBlogPrStatus({
      postId: item.post._id,
      prStatus: data.prStatus,
      prNumber: data.prNumber ?? undefined,
    });
    setMessage(`PR status updated: ${prStatusLabel(data.prStatus)}.`);
  }

  function moveCalendar(direction: -1 | 1) {
    const next =
      calendarView === "month"
        ? addMonths(anchorDate, direction)
        : addDays(anchorDate, direction * 7);
    setCalendarAnchor(formatYMD(next));
  }

  return (
    <WorkspaceLayout
      banner={message ? <Notice>{message}</Notice> : null}
      header={
        <PageHeader
          description="See scheduled posts across your brands, edit drafts, approve content, and open blog pull requests when ready."
          footer={
            devMode ? (
              <button
                className="mt-2 text-xs text-gray-400 underline hover:text-gray-600"
                onClick={() => void handleSeed()}
                type="button"
              >
                Repair workspace
              </button>
            ) : undefined
          }
          icon={<Calendar size={16} />}
          label="Publishing calendar"
          title="Plan, approve, and publish your content"
        />
      }
      sidebar={
        <>
          <SidebarCard className="space-y-3">
            <FilterGroup
              label="Brands"
              onChange={(id) => setBrandFilters(toggleFilterSet(brandFilters, id))}
              options={brandOptions}
              selected={brandFilters}
            />
            <FilterGroup
              label="Platforms"
              onChange={(id) => setPlatformFilters(toggleFilterSet(platformFilters, id))}
              options={platformOptions}
              selected={platformFilters}
            />
            <FilterGroup
              label="Status"
              onChange={(id) => setStatusFilters(toggleFilterSet(statusFilters, id))}
              options={statusOptions}
              selected={statusFilters}
            />
          </SidebarCard>
          <div id="connections">
            <SocialConnectionsPanel />
          </div>
        </>
      }
    >
      <MainCard>
            <div className="grid gap-3 border-b border-black/10 p-4 sm:grid-cols-3">
              <Metric label="Not submitted" value={providerSummary.notSubmitted} />
              <Metric label="Submitted" value={providerSummary.submitted} />
              <Metric label="Needs review" value={providerSummary.needsReview} />
            </div>

            <div className="border-b border-black/10 px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase text-gray-500">
                    <CalendarDays size={14} />
                    Calendar
                  </div>
                  <h3 className="mt-1 text-lg font-semibold">
                    {formatRangeLabel(calendarView, anchorDate)}
                  </h3>
                  <p className="mt-0.5 text-xs text-gray-500">
                    Display timezone: {displayTimezone}; scheduled intent timezone is
                    retained per item.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="inline-grid grid-cols-2 rounded-md border border-black/10 bg-black/[0.03] p-1">
                    {(["month", "week"] as const).map((view) => (
                      <button
                        aria-pressed={calendarView === view}
                        className={`rounded px-3 py-1.5 text-xs font-semibold capitalize ${
                          calendarView === view
                            ? "bg-white text-[#15616d] shadow-sm"
                            : "text-gray-600 hover:bg-white/70"
                        }`}
                        key={view}
                        onClick={() => setCalendarView(view)}
                        type="button"
                      >
                        {view}
                      </button>
                    ))}
                  </div>
                  <button
                    aria-label={`Previous ${calendarView}`}
                    className="inline-flex size-8 items-center justify-center rounded-md border border-black/10 hover:bg-black/5"
                    onClick={() => moveCalendar(-1)}
                    type="button"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <button
                    aria-label={`Next ${calendarView}`}
                    className="inline-flex size-8 items-center justify-center rounded-md border border-black/10 hover:bg-black/5"
                    onClick={() => moveCalendar(1)}
                    type="button"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            </div>

            {loading && (
              <p className="p-4 text-sm text-gray-600">Loading your publishing calendar...</p>
            )}

            {!loading && visibleItems.length === 0 && (
              <div className="p-8 text-center">
                <h3 className="text-lg font-semibold text-gray-900">Your calendar is empty</h3>
                <p className="mx-auto mt-2 max-w-md text-sm text-gray-600">
                  Brands organize content for Personal, Corvo Labs, the lower dB, and FreshProof.
                  Start from research or create a post directly.
                </p>
                <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                  <Link
                    className="inline-flex items-center gap-1 rounded-md border border-[#15616d]/25 px-3 py-2 text-sm font-medium text-[#15616d] hover:bg-[#15616d]/10"
                    href="/research"
                  >
                    Explore research &amp; ideas
                  </Link>
                  <button
                    className="rounded-md border border-black/15 bg-white px-3 py-2 text-sm font-medium hover:bg-black/5"
                    onClick={() => void handleCreateBlankPost("linkedin")}
                    type="button"
                  >
                    + Create a LinkedIn post
                  </button>
                  <button
                    className="rounded-md border border-black/15 bg-white px-3 py-2 text-sm font-medium hover:bg-black/5"
                    onClick={() => void handleCreateBlankPost("reddit")}
                    type="button"
                  >
                    + Create a Reddit post
                  </button>
                  <button
                    className="rounded-md border border-black/15 bg-white px-3 py-2 text-sm font-medium hover:bg-black/5"
                    onClick={() => void handleCreateBlankPost("corvo-blog")}
                    type="button"
                  >
                    + Create a blog post
                  </button>
                </div>
              </div>
            )}

            {!loading && visibleItems.length > 0 && (
              <>
                <div className="grid grid-cols-7 border-b border-black/10 bg-black/[0.02] text-center text-[11px] font-semibold uppercase text-gray-500">
                  {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
                    <div className="px-2 py-2" key={day}>
                      {day}
                    </div>
                  ))}
                </div>
                <div
                  className={
                    calendarView === "month"
                      ? "grid grid-cols-7"
                      : "grid grid-cols-1 sm:grid-cols-7"
                  }
                >
                  {visibleDates.map((date) => {
                    const dateKey = formatYMD(date);
                    const dayItems = itemsByDate[dateKey] ?? [];
                    const outsideMonth =
                      calendarView === "month" && date.getMonth() !== anchorDate.getMonth();
                    return (
                      <div
                        className={`min-h-[132px] border-b border-r border-black/10 p-2 last:border-r-0 ${
                          outsideMonth ? "bg-black/[0.025] text-gray-400" : "bg-white"
                        }`}
                        key={dateKey}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold">{date.getDate()}</span>
                          {dayItems.length > 0 && (
                            <span className="rounded-full bg-[#15616d]/10 px-2 py-0.5 text-[11px] font-semibold text-[#15616d]">
                              {dayItems.length}
                            </span>
                          )}
                        </div>
                        <div className="mt-2 space-y-1.5">
                          {dayItems.slice(0, 3).map((item) => (
                            <CalendarItemChip
                              item={item}
                              key={item.post._id}
                              onSelect={() => setManualSelectedPostId(item.post._id)}
                            />
                          ))}
                          {dayItems.length > 3 && (
                            <p className="text-[11px] font-medium text-gray-500">
                              +{dayItems.length - 3} more
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="border-t border-black/10 px-4 py-3">
                  <h3 className="text-sm font-semibold">Range agenda</h3>
                  {rangeItems.length === 0 ? (
                    <p className="mt-2 text-sm text-gray-600">
                      No scheduled items in this {calendarView}.
                    </p>
                  ) : (
                    <div className="mt-3 divide-y divide-black/10">
                      {rangeItems.map((item) => (
                        <AgendaItem
                          devMode={devMode}
                          item={item}
                          key={item.post._id}
                          onApprove={handleApprove}
                          onCheckPrStatus={() => void handleCheckPrStatus(item)}
                          onCreatePr={() => void handleCreatePr(item)}
                          onInspect={() => setManualSelectedPostId(item.post._id)}
                          onProviderIntent={handleProviderIntent}
                          onDelete={handleDelete}
                          onRetry={handleRetry}
                          onSubmit={handleSubmit}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
        {selectedItem && (
          <PublishingDetailDrawer
            devMode={devMode}
            item={selectedItem}
            onApprove={handleApprove}
            onCheckPrStatus={() => void handleCheckPrStatus(selectedItem)}
            onClose={() => setManualSelectedPostId(null)}
            onCreatePr={() => void handleCreatePr(selectedItem)}
            onProviderIntent={handleProviderIntent}
            onDelete={handleDelete}
            onRetry={handleRetry}
            onSaveComposer={(values) => handleSaveComposer(selectedItem, values)}
            onSubmit={handleSubmit}
          />
        )}
      </MainCard>
    </WorkspaceLayout>
  );
}

function CalendarItemChip({
  item,
  onSelect,
}: {
  item: PersistedCalendarItem;
  onSelect: () => void;
}) {
  const post = item.post;
  const providerState = item.providerState;
  return (
    <button
      aria-label={`Inspect ${post.title}`}
      className="w-full rounded-md border border-black/10 bg-white px-2 py-1.5 text-left shadow-sm hover:border-[#15616d]/40 hover:bg-[#f6fbfc]"
      onClick={onSelect}
      type="button"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-[11px] font-semibold">{post.title}</span>
        <span className="shrink-0 text-[10px] text-gray-500">
          {item.intent?.scheduledTime ?? "--:--"}
        </span>
      </div>
      <div className="mt-1 flex flex-wrap gap-1">
        <Badge>{channelLabel(post.channelId)}</Badge>
        <Badge>{post.approvalState}</Badge>
        <span className="rounded-full bg-[#ff7d00]/10 px-2 py-0.5 text-[10px] font-medium text-[#7a3b00]">
          {providerState?.status ?? "not-submitted"}
        </span>
        {providerState?.simulated && (
          <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-medium text-violet-700">
            Simulated
          </span>
        )}
        {post.blogPrStatus && (
          <PrStatusBadge status={post.blogPrStatus} />
        )}
      </div>
    </button>
  );
}

function AgendaItem(props: {
  devMode: boolean;
  item: PersistedCalendarItem;
  onApprove: (postId: Id<"v2Posts">) => void;
  onCheckPrStatus: () => void;
  onCreatePr: () => void;
  onDelete: (postId: Id<"v2Posts">, title: string) => void;
  onInspect: () => void;
  onProviderIntent: (
    postId: Id<"v2Posts">,
    intentType: "cancel" | "unpublish"
  ) => void;
  onRetry: (postId: Id<"v2Posts">) => void;
  onSubmit: (postId: Id<"v2Posts">) => void;
}) {
  const { item } = props;
  const post = item.post;
  const intent = item.intent;
  const providerState = item.providerState;
  const approved = post.approvalState === "approved";
  const providerIntentRecorded = providerState?.status === "cancel-intent-recorded";
  const providerIntentType = post.status === "published" ? "unpublish" : "cancel";
  const existingPrUrl = post.prUrl ?? providerState?.prUrl;
  const retryableAttempt =
    item.lastAttempt?.status === "retryable-failure" ||
    item.lastAttempt?.status === "ambiguous";
  const submitDisabled =
    !approved ||
    !intent?.scheduledDate ||
    providerState?.status === "submitted" ||
    providerIntentRecorded;
  const openPrDisabled =
    !approved || !blogPrReady(post) || Boolean(existingPrUrl);

  return (
    <article className="py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold">{post.title}</h3>
            <Badge>{channelLabel(post.channelId)}</Badge>
            <Badge>{statusLabel(post.status)}</Badge>
            {providerState?.simulated && <Badge>Simulated</Badge>}
            {post.blogPrStatus && <PrStatusBadge status={post.blogPrStatus} />}
          </div>
          <p className="mt-2 max-w-3xl text-sm text-gray-600">{post.content}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            aria-label={`Details ${post.title}`}
            className="inline-flex items-center gap-1 rounded-md border border-black/15 px-2.5 py-1.5 text-xs font-medium hover:bg-black/5"
            onClick={props.onInspect}
            type="button"
          >
            <Eye size={14} />
            Details
          </button>
          <button
            aria-label={`Approve ${post.title}`}
            className="inline-flex items-center gap-1 rounded-md border border-black/15 px-2.5 py-1.5 text-xs font-medium hover:bg-black/5 disabled:opacity-50"
            disabled={approved}
            onClick={() => props.onApprove(post._id)}
            type="button"
          >
            <CheckCircle2 size={14} />
            Approve
          </button>
          {props.devMode && (
            <button
              className="inline-flex items-center gap-1 rounded-md bg-[#ff7d00] px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-[#dd6d00] disabled:opacity-50"
              disabled={submitDisabled}
              onClick={() => props.onSubmit(post._id)}
              title={!approved ? "Approval is required before simulating submission." : undefined}
              type="button"
            >
              <Send size={14} />
              Simulate submission
            </button>
          )}
          {props.devMode && (
            <button
              className="inline-flex items-center gap-1 rounded-md border border-[#7a3b00]/25 px-2.5 py-1.5 text-xs font-medium text-[#7a3b00] hover:bg-[#ff7d00]/10 disabled:opacity-50"
              disabled={providerIntentRecorded}
              onClick={() => props.onProviderIntent(post._id, providerIntentType)}
              type="button"
            >
              <Ban size={14} />
              {providerIntentType === "unpublish" ? "Unpublish Intent" : "Cancel Intent"}
            </button>
          )}
          {post.channelId === "corvo-blog" && (
            <>
              <button
                className="inline-flex items-center gap-1 rounded-md border border-[#15616d]/25 px-2.5 py-1.5 text-xs font-medium text-[#15616d] hover:bg-[#15616d]/10 disabled:opacity-50"
                disabled={openPrDisabled}
                onClick={props.onCreatePr}
                title={
                  !approved
                    ? "Approve the post before opening a PR."
                    : !blogPrReady(post)
                      ? "Complete blog metadata before opening a PR."
                      : existingPrUrl
                        ? "Pull request already exists."
                        : undefined
                }
                type="button"
              >
                <FileText size={14} />
                {existingPrUrl ? "PR opened" : "Open PR"}
              </button>
              {existingPrUrl && (
                <>
                  <a
                    className="inline-flex items-center gap-1 rounded-md border border-black/15 px-2.5 py-1.5 text-xs font-medium hover:bg-black/5"
                    href={existingPrUrl}
                    rel="noreferrer"
                    target="_blank"
                  >
                    <ExternalLink size={14} />
                    View PR
                  </a>
                  <button
                    className="inline-flex items-center gap-1 rounded-md border border-[#15616d]/25 px-2.5 py-1.5 text-xs font-medium text-[#15616d] hover:bg-[#15616d]/10"
                    onClick={props.onCheckPrStatus}
                    type="button"
                  >
                    Check PR status
                  </button>
                </>
              )}
            </>
          )}
          {props.devMode && retryableAttempt && (
            <button
              className="inline-flex items-center gap-1 rounded-md border border-[#15616d]/25 px-2.5 py-1.5 text-xs font-medium text-[#15616d] hover:bg-[#15616d]/10"
              onClick={() => props.onRetry(post._id)}
              type="button"
            >
              <RotateCcw size={14} />
              Retry simulation
            </button>
          )}
          <button
            aria-label={`Delete ${post.title}`}
            className="inline-flex items-center gap-1 rounded-md border border-red-200 px-2.5 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50"
            onClick={() => props.onDelete(post._id, post.title)}
            type="button"
          >
            <Trash2 size={14} />
            Delete
          </button>
        </div>
      </div>
      <dl className="mt-3 grid gap-2 text-xs text-gray-600 sm:grid-cols-4">
        <KeyValue label="Brand" value={post.brandId} />
        <KeyValue
          label="Schedule"
          value={formatDateTime(intent?.scheduledDate, intent?.scheduledTime, intent?.timezone)}
        />
        <KeyValue label="Approval" value={post.approvalState} />
        <KeyValue
          label="Submission status"
          value={providerState?.status ?? "not-submitted"}
        />
        {existingPrUrl && (
          <KeyValue label="Pull request" value={existingPrUrl} />
        )}
      </dl>
      {props.devMode && item.attemptCount > 0 && (
        <p className="mt-2 text-xs text-gray-500">
          Attempts: {item.attemptCount}; last result: {item.lastAttempt?.status ?? "unknown"}
        </p>
      )}
    </article>
  );
}

function PublishingDetailDrawer(props: {
  devMode: boolean;
  item: PersistedCalendarItem;
  onApprove: (postId: Id<"v2Posts">) => void;
  onCheckPrStatus: () => void;
  onClose: () => void;
  onCreatePr: () => void;
  onDelete: (postId: Id<"v2Posts">, title: string) => void;
  onProviderIntent: (
    postId: Id<"v2Posts">,
    intentType: "cancel" | "unpublish"
  ) => void;
  onRetry: (postId: Id<"v2Posts">) => void;
  onSaveComposer: (values: {
    title: string;
    content: string;
    scheduledDate: string;
    scheduledTime: string;
    timezone: string;
    blogMetadata?: {
      blogExcerpt?: string;
      blogAuthor?: string;
      blogCategory?: string;
      blogTags?: string[];
      blogSlug?: string;
      heroImageUrl?: string;
      heroImageStorageId?: Id<"_storage">;
    };
  }) => void;
  onSubmit: (postId: Id<"v2Posts">) => void;
}) {
  const { item } = props;
  const post = item.post;
  const intent = item.intent;
  const providerState = item.providerState;
  const approved = post.approvalState === "approved";
  const providerIntentRecorded = providerState?.status === "cancel-intent-recorded";
  const providerIntentType = post.status === "published" ? "unpublish" : "cancel";
  const existingPrUrl = post.prUrl ?? providerState?.prUrl;
  const retryableAttempt =
    item.lastAttempt?.status === "retryable-failure" ||
    item.lastAttempt?.status === "ambiguous";
  const submitDisabled =
    !approved ||
    !intent?.scheduledDate ||
    providerState?.status === "submitted" ||
    providerIntentRecorded;
  const openPrDisabled =
    !approved || !blogPrReady(post) || Boolean(existingPrUrl);

  return (
    <aside
      aria-label="Publishing item detail"
      className="mt-5 rounded-lg border border-black/10 bg-white p-5 shadow-sm"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge>{channelLabel(post.channelId)}</Badge>
            <Badge>{statusLabel(post.status)}</Badge>
            <Badge>{post.approvalState}</Badge>
            {providerState?.simulated && <Badge>Simulated</Badge>}
            {post.blogPrStatus && <PrStatusBadge status={post.blogPrStatus} />}
          </div>
          <h3 className="mt-2 text-lg font-semibold">{post.title}</h3>
          <p className="mt-1 max-w-4xl text-sm text-gray-600">{post.content}</p>
        </div>
        <button
          aria-label="Close publishing detail"
          className="inline-flex size-8 items-center justify-center rounded-md border border-black/10 hover:bg-black/5"
          onClick={props.onClose}
          type="button"
        >
          <X size={16} />
        </button>
      </div>

      <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <KeyValue label="Brand" value={post.brandId} />
        <KeyValue label="Platform" value={channelLabel(post.channelId)} />
        <KeyValue
          label="Schedule"
          value={formatDateTime(intent?.scheduledDate, intent?.scheduledTime, intent?.timezone)}
        />
        <KeyValue
          label="Submission status"
          value={providerState?.status ?? "not-submitted"}
        />
        {existingPrUrl && (
          <KeyValue label="Pull request" value={existingPrUrl} />
        )}
        {post.blogPrNumber !== undefined && (
          <KeyValue label="PR number" value={`#${post.blogPrNumber}`} />
        )}
        {props.devMode && (
          <>
            <KeyValue label="Intent ID" value={String(intent?._id ?? "missing")} />
            <KeyValue label="Provider post" value={providerState?.providerPostId ?? "not created"} />
            <KeyValue label="Branch" value={post.branchName ?? "not created"} />
            <KeyValue label="Source idea" value={post.sourceIdeaId ?? "none"} />
            <KeyValue label="Research brief" value={post.sourceResearchBriefId ?? "none"} />
          </>
        )}
      </div>

      {providerState?.simulated && (
        <div className="mt-4 rounded-md border border-violet-200 bg-violet-50 px-3 py-2 text-sm text-violet-900">
          Simulated submission — no post was sent to {channelLabel(post.channelId)}.
        </div>
      )}

      {providerState?.lastResponseSummary && props.devMode && (
        <div className="mt-4 rounded-md border border-black/10 bg-black/[0.02] p-3 text-sm text-gray-700">
          {providerState.lastResponseSummary}
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          aria-label={`Approve ${post.title}`}
          className="inline-flex items-center gap-1 rounded-md border border-black/15 px-3 py-2 text-sm font-medium hover:bg-black/5 disabled:opacity-50"
          disabled={approved}
          onClick={() => props.onApprove(post._id)}
          type="button"
        >
          <CheckCircle2 size={15} />
          Approve
        </button>
        {props.devMode && (
          <button
            className="inline-flex items-center gap-1 rounded-md bg-[#ff7d00] px-3 py-2 text-sm font-semibold text-white hover:bg-[#dd6d00] disabled:opacity-50"
            disabled={submitDisabled}
            onClick={() => props.onSubmit(post._id)}
            title={!approved ? "Approval is required before simulating submission." : undefined}
            type="button"
          >
            <Send size={15} />
            Simulate submission
          </button>
        )}
        {props.devMode && (
          <button
            className="inline-flex items-center gap-1 rounded-md border border-[#7a3b00]/25 px-3 py-2 text-sm font-medium text-[#7a3b00] hover:bg-[#ff7d00]/10 disabled:opacity-50"
            disabled={providerIntentRecorded}
            onClick={() => props.onProviderIntent(post._id, providerIntentType)}
            type="button"
          >
            <Ban size={15} />
            {providerIntentType === "unpublish" ? "Record Unpublish Intent" : "Record Cancel Intent"}
          </button>
        )}
        {post.channelId === "corvo-blog" && (
          <>
            <button
              className="inline-flex items-center gap-1 rounded-md border border-[#15616d]/25 px-3 py-2 text-sm font-medium text-[#15616d] hover:bg-[#15616d]/10 disabled:opacity-50"
              disabled={openPrDisabled}
              onClick={props.onCreatePr}
              type="button"
            >
              <FileText size={15} />
              {existingPrUrl ? "PR opened" : "Open PR"}
            </button>
            {existingPrUrl && (
              <>
                <a
                  className="inline-flex items-center gap-1 rounded-md border border-black/15 px-3 py-2 text-sm font-medium hover:bg-black/5"
                  href={existingPrUrl}
                  rel="noreferrer"
                  target="_blank"
                >
                  <ExternalLink size={15} />
                  View PR
                </a>
                <button
                  className="inline-flex items-center gap-1 rounded-md border border-[#15616d]/25 px-3 py-2 text-sm font-medium text-[#15616d] hover:bg-[#15616d]/10"
                  onClick={props.onCheckPrStatus}
                  type="button"
                >
                  Check PR status
                </button>
              </>
            )}
          </>
        )}
        {props.devMode && retryableAttempt && (
          <button
            className="inline-flex items-center gap-1 rounded-md border border-[#15616d]/25 px-3 py-2 text-sm font-medium text-[#15616d] hover:bg-[#15616d]/10"
            onClick={() => props.onRetry(post._id)}
            type="button"
          >
            <RotateCcw size={15} />
            Retry simulation
          </button>
        )}
        <button
          aria-label={`Delete ${post.title}`}
          className="inline-flex items-center gap-1 rounded-md border border-red-200 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
          onClick={() => props.onDelete(post._id, post.title)}
          type="button"
        >
          <Trash2 size={15} />
          Delete draft
        </button>
      </div>

      <PersistedPostComposer
        item={item}
        key={post._id}
        onSave={props.onSaveComposer}
      />

      {props.devMode && (
      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <section className="rounded-lg border border-black/10 p-4">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Send size={15} />
            Provider Attempts
          </div>
          {!item.attempts?.length ? (
            <p className="mt-2 text-sm text-gray-600">No provider attempts recorded.</p>
          ) : (
            <div className="mt-3 space-y-3">
              {item.attempts.map((attempt, index) => (
                <div
                  className="rounded-md border border-black/10 bg-black/[0.02] p-3"
                  key={String(attempt._id ?? index)}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="font-semibold">
                      {attempt.providerId ?? "unknown"} / {attempt.status ?? "unknown"}
                    </span>
                    <span className="text-gray-500">{formatTimestamp(attempt.createdAt)}</span>
                  </div>
                  <dl className="mt-2 grid gap-2 text-xs text-gray-600 sm:grid-cols-2">
                    <KeyValue label="Idempotency key" value={attempt.idempotencyKey ?? "missing"} />
                    <KeyValue label="Retry count" value={String(attempt.retryCount ?? 0)} />
                  </dl>
                  <pre className="mt-2 max-h-40 overflow-auto rounded bg-white p-2 text-[11px] text-gray-700">
                    {renderJson(attempt.sanitizedResponse)}
                  </pre>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-lg border border-black/10 p-4">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <History size={15} />
            Audit Trail
          </div>
          {!item.auditEvents?.length ? (
            <p className="mt-2 text-sm text-gray-600">No audit events recorded.</p>
          ) : (
            <ol className="mt-3 space-y-3">
              {item.auditEvents.map((event, index) => (
                <li className="rounded-md border border-black/10 p-3" key={String(event._id ?? index)}>
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="font-semibold">{event.action ?? "audit.event"}</span>
                    <span className="text-gray-500">{formatTimestamp(event.createdAt)}</span>
                  </div>
                  <p className="mt-1 text-sm text-gray-700">{event.summary ?? "No summary."}</p>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
      )}
    </aside>
  );
}

function PersistedPostComposer(props: {
  item: PersistedCalendarItem;
  onSave: (values: {
    title: string;
    content: string;
    scheduledDate: string;
    scheduledTime: string;
    timezone: string;
    blogMetadata?: {
      blogExcerpt?: string;
      blogAuthor?: string;
      blogCategory?: string;
      blogTags?: string[];
      blogSlug?: string;
      heroImageUrl?: string;
      heroImageStorageId?: Id<"_storage">;
    };
  }) => void;
}) {
  const { item } = props;
  const post = item.post;
  const intent = item.intent;
  const generateUploadUrl = useMutation(api.posts.generateUploadUrl);
  const [title, setTitle] = useState(post.title);
  const [content, setContent] = useState(post.content);
  const [blogExcerpt, setBlogExcerpt] = useState(post.blogExcerpt ?? "");
  const [blogAuthor, setBlogAuthor] = useState(post.blogAuthor ?? DEFAULT_BLOG_AUTHOR);
  const [blogCategory, setBlogCategory] = useState(
    post.blogCategory ?? DEFAULT_BLOG_CATEGORY
  );
  const [blogTagsInput, setBlogTagsInput] = useState((post.blogTags ?? []).join(", "));
  const [blogSlug, setBlogSlug] = useState(post.blogSlug ?? slugifyTitle(post.title));
  const [slugTouched, setSlugTouched] = useState(Boolean(post.blogSlug));
  const [heroImageUrl, setHeroImageUrl] = useState(post.heroImageUrl ?? "");
  const [heroImageStorageId, setHeroImageStorageId] = useState<Id<"_storage"> | undefined>(
    post.heroImageStorageId
  );
  const [heroUploading, setHeroUploading] = useState(false);
  const resolvedHeroUrl = useQuery(
    api.posts.getFileUrl,
    heroImageStorageId ? { fileId: heroImageStorageId } : "skip"
  );
  const [scheduledDate, setScheduledDate] = useState(
    normalizeScheduledDate(intent?.scheduledDate ?? post.scheduledDate) ?? ""
  );
  const [scheduledTime, setScheduledTime] = useState(
    intent?.scheduledTime ?? post.scheduledTime ?? ""
  );
  const [timezone, setTimezone] = useState(
    intent?.timezone ?? post.timezone ?? "America/Los_Angeles"
  );

  const contentChanged = title.trim() !== post.title || content !== post.content;
  const persistedScheduleDate =
    normalizeScheduledDate(intent?.scheduledDate ?? post.scheduledDate) ?? "";
  const scheduleChanged =
    scheduledDate !== persistedScheduleDate ||
    scheduledTime !== (intent?.scheduledTime ?? post.scheduledTime ?? "") ||
    timezone !== (intent?.timezone ?? post.timezone ?? "America/Los_Angeles");
  const blogTags = parseTagsInput(blogTagsInput);
  const blogMetadataChanged =
    post.channelId === "corvo-blog" &&
    (blogExcerpt !== (post.blogExcerpt ?? "") ||
      blogAuthor !== (post.blogAuthor ?? "") ||
      blogCategory !== (post.blogCategory ?? "") ||
      JSON.stringify(blogTags) !== JSON.stringify(post.blogTags ?? []) ||
      blogSlug !== (post.blogSlug ?? "") ||
      heroImageUrl !== (post.heroImageUrl ?? "") ||
      heroImageStorageId !== post.heroImageStorageId);
  const heroPreviewUrl = heroImageUrl.trim() || resolvedHeroUrl || "";
  const canSave =
    (contentChanged || scheduleChanged || blogMetadataChanged) && title.trim().length > 0;

  async function handleHeroUpload(file: File) {
    setHeroUploading(true);
    try {
      const uploadUrl = await generateUploadUrl();
      const uploadRes = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });
      if (!uploadRes.ok) throw new Error("Hero image upload failed.");
      const { storageId } = (await uploadRes.json()) as { storageId: Id<"_storage"> };
      setHeroImageStorageId(storageId);
      setHeroImageUrl("");
    } catch {
      // Upload errors surface on next save attempt via missing hero URL.
    } finally {
      setHeroUploading(false);
    }
  }

  return (
    <section className="mt-5 rounded-lg border border-black/10 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 className="text-sm font-semibold">Composer</h4>
          <p className="mt-1 text-xs text-gray-500">
            Edit post content and metadata. Content changes require re-approval; date-only schedule
            edits keep the current approval state.
          </p>
        </div>
        <div className="flex flex-wrap gap-1">
          <Badge>{post.brandId}</Badge>
          <Badge>{channelLabel(post.channelId)}</Badge>
        </div>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px]">
        <div className="space-y-3">
          <label className="block text-xs font-semibold text-gray-600">
            Title
            <input
              className="mt-1 w-full rounded-md border border-black/15 px-3 py-2 text-sm outline-none focus:border-[#15616d] focus:ring-2 focus:ring-[#15616d]/15"
              onChange={(event) => {
                const nextTitle = event.target.value;
                setTitle(nextTitle);
                if (!slugTouched) {
                  setBlogSlug(slugifyTitle(nextTitle));
                }
              }}
              value={title}
            />
          </label>
          <label className="block text-xs font-semibold text-gray-600">
            Content
            <textarea
              className="mt-1 min-h-40 w-full rounded-md border border-black/15 px-3 py-2 text-sm outline-none focus:border-[#15616d] focus:ring-2 focus:ring-[#15616d]/15"
              onChange={(event) => setContent(event.target.value)}
              value={content}
            />
          </label>
        </div>

        <div className="space-y-3">
          <label className="block text-xs font-semibold text-gray-600">
            Date
            <input
              className="mt-1 w-full rounded-md border border-black/15 px-3 py-2 text-sm outline-none focus:border-[#15616d] focus:ring-2 focus:ring-[#15616d]/15"
              onChange={(event) => setScheduledDate(event.target.value)}
              type="date"
              value={scheduledDate}
            />
          </label>
          <label className="block text-xs font-semibold text-gray-600">
            Time
            <input
              className="mt-1 w-full rounded-md border border-black/15 px-3 py-2 text-sm outline-none focus:border-[#15616d] focus:ring-2 focus:ring-[#15616d]/15"
              onChange={(event) => setScheduledTime(event.target.value)}
              type="time"
              value={scheduledTime}
            />
          </label>
          <label className="block text-xs font-semibold text-gray-600">
            Timezone
            <input
              className="mt-1 w-full rounded-md border border-black/15 px-3 py-2 text-sm outline-none focus:border-[#15616d] focus:ring-2 focus:ring-[#15616d]/15"
              onChange={(event) => setTimezone(event.target.value)}
              value={timezone}
            />
          </label>
          {post.channelId === "corvo-blog" && (
            <div className="space-y-2 rounded-md border border-black/10 bg-black/[0.02] p-3">
              <p className="text-xs font-semibold text-gray-700">Blog metadata</p>
              <label className="block text-xs font-semibold text-gray-600">
                Excerpt
                <textarea
                  className="mt-1 min-h-16 w-full rounded-md border border-black/15 px-2 py-1.5 text-sm"
                  onChange={(event) => setBlogExcerpt(event.target.value)}
                  value={blogExcerpt}
                />
              </label>
              <label className="block text-xs font-semibold text-gray-600">
                Author
                <input
                  className="mt-1 w-full rounded-md border border-black/15 px-2 py-1.5 text-sm"
                  onChange={(event) => setBlogAuthor(event.target.value)}
                  value={blogAuthor}
                />
              </label>
              <label className="block text-xs font-semibold text-gray-600">
                Category
                <select
                  className="mt-1 w-full rounded-md border border-black/15 px-2 py-1.5 text-sm"
                  onChange={(event) => setBlogCategory(event.target.value)}
                  value={blogCategory}
                >
                  {BLOG_CATEGORIES.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-xs font-semibold text-gray-600">
                Tags
                <input
                  className="mt-1 w-full rounded-md border border-black/15 px-2 py-1.5 text-sm"
                  onChange={(event) => setBlogTagsInput(event.target.value)}
                  placeholder="Corvo Labs, strategy"
                  value={blogTagsInput}
                />
              </label>
              <label className="block text-xs font-semibold text-gray-600">
                Slug
                <input
                  className="mt-1 w-full rounded-md border border-black/15 px-2 py-1.5 text-sm"
                  onChange={(event) => {
                    setSlugTouched(true);
                    setBlogSlug(event.target.value);
                  }}
                  value={blogSlug}
                />
              </label>
              <label className="block text-xs font-semibold text-gray-600">
                Hero image URL
                <input
                  className="mt-1 w-full rounded-md border border-black/15 px-2 py-1.5 text-sm"
                  onChange={(event) => {
                    setHeroImageUrl(event.target.value);
                    if (event.target.value.trim()) {
                      setHeroImageStorageId(undefined);
                    }
                  }}
                  placeholder="https://..."
                  value={heroImageUrl}
                />
              </label>
              <label className="block text-xs font-semibold text-gray-600">
                Upload hero image
                <input
                  accept="image/*"
                  className="mt-1 block w-full text-xs"
                  disabled={heroUploading}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void handleHeroUpload(file);
                    event.target.value = "";
                  }}
                  type="file"
                />
              </label>
              {(heroImageUrl || resolvedHeroUrl) && (
                <div className="mt-2 space-y-1">
                  <img
                    alt="Hero preview"
                    className="h-auto max-w-full rounded"
                    src={heroPreviewUrl}
                  />
                  <p className="line-clamp-2 break-all text-[11px] text-gray-500">
                    {heroPreviewUrl}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-gray-500">
          {contentChanged || blogMetadataChanged
            ? "Content or metadata changed: saving will clear approval."
            : scheduleChanged
              ? "Schedule-only change: approval is preserved."
              : "No unsaved composer changes."}
        </p>
        <button
          className="inline-flex items-center gap-1 rounded-md bg-[#15616d] px-3 py-2 text-sm font-semibold text-white hover:bg-[#104d56] disabled:opacity-50"
          disabled={!canSave}
          onClick={() =>
            props.onSave({
              title,
              content,
              scheduledDate,
              scheduledTime,
              timezone,
              blogMetadata: blogMetadataChanged
                ? {
                    blogExcerpt: blogExcerpt.trim() || undefined,
                    blogAuthor: blogAuthor.trim() || undefined,
                    blogCategory: blogCategory.trim() || undefined,
                    blogTags: blogTags.length ? blogTags : undefined,
                    blogSlug: blogSlug.trim() || undefined,
                    heroImageUrl:
                      heroImageUrl.trim() || resolvedHeroUrl || undefined,
                    heroImageStorageId,
                  }
                : undefined,
            })
          }
          type="button"
        >
          <Save size={15} />
          Save Composer Changes
        </button>
      </div>
    </section>
  );
}


function Metric(props: { label: string; value: number }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase text-gray-500">{props.label}</p>
      <p className="mt-1 text-2xl font-semibold">{props.value}</p>
    </div>
  );
}

function Badge(props: { children: ReactNode }) {
  return (
    <span className="rounded-full bg-black/5 px-2 py-0.5 text-xs font-medium text-gray-700">
      {props.children}
    </span>
  );
}

function PrStatusBadge(props: { status: "open" | "merged" | "closed" | "draft" }) {
  const styles = {
    open: "bg-sky-100 text-sky-800",
    merged: "bg-emerald-100 text-emerald-800",
    closed: "bg-gray-200 text-gray-700",
    draft: "bg-amber-100 text-amber-800",
  } as const;
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${styles[props.status]}`}
    >
      PR {prStatusLabel(props.status)}
    </span>
  );
}

function KeyValue(props: { label: string; value: string }) {
  return (
    <div>
      <dt className="font-medium text-gray-500">{props.label}</dt>
      <dd className="mt-0.5 break-words text-gray-800">{props.value}</dd>
    </div>
  );
}
