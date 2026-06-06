"use client";

import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useMutation, useQuery } from "convex/react";
import {
  CalendarClock,
  CalendarDays,
  Ban,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Database,
  Eye,
  FileText,
  History,
  Save,
  RotateCcw,
  Send,
  ShieldCheck,
  X,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  V2_BRANDS,
  V2_CHANNEL_LABELS,
  V2_STATUS_LABELS,
  type V2BrandId,
  type V2ChannelId,
  type V2CorvoBlogPlatformSettings,
  type V2LinkedInPlatformSettings,
  type V2PostStatus,
  type V2RedditPlatformSettings,
} from "@/lib/v2";

type CalendarView = "month" | "week";
type PersistedCalendarItem = {
  post: {
    _id: Id<"v2Posts">;
    brandId: V2BrandId;
    channelId: V2ChannelId;
    platformId: string;
    title: string;
    content: string;
    status: V2PostStatus;
    approvalState: string;
    scheduledDate?: string;
    scheduledTime?: string;
    timezone?: string;
    sourceIdeaId?: string;
    sourceResearchBriefId?: string;
    prUrl?: string;
    branchName?: string;
    platformSettings?:
      | V2LinkedInPlatformSettings
      | V2RedditPlatformSettings
      | V2CorvoBlogPlatformSettings;
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

const brandOptions = V2_BRANDS.map((brand) => ({
  id: brand.id,
  name: brand.name,
}));

const platformOptions: Array<{ id: V2ChannelId; label: string }> = [
  { id: "linkedin", label: "LinkedIn" },
  { id: "reddit", label: "Reddit" },
  { id: "corvo-blog", label: "Corvo Blog" },
  { id: "x", label: "X" },
  { id: "youtube", label: "YouTube" },
  { id: "instagram", label: "Instagram" },
  { id: "tiktok", label: "TikTok" },
];

const statusOptions: Array<{ id: V2PostStatus; label: string }> = [
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

const CORVO_HERO_IMAGE = "/images/corvo-labs-stacked.svg";

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

function parseYMD(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(year, month - 1, day, 12);
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
  return item.intent?.scheduledDate ?? item.post.scheduledDate;
}

function formatDateLabel(date: string) {
  return parseYMD(date).toLocaleDateString("en-US", {
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

function toggleSet<T extends string>(current: T[], value: T) {
  return current.includes(value)
    ? current.filter((item) => item !== value)
    : [...current, value];
}

function linkedInSettingsFromPost(
  settings?: V2LinkedInPlatformSettings
): V2LinkedInPlatformSettings {
  return {
    cta: settings?.cta ?? "",
    hashtags: settings?.hashtags ?? [],
    linkPreview: settings?.linkPreview ?? true,
  };
}

function redditSettingsFromPost(settings?: V2RedditPlatformSettings): V2RedditPlatformSettings {
  return {
    subreddit: settings?.subreddit ?? "",
    flair: settings?.flair ?? "",
    nsfw: settings?.nsfw ?? false,
    spoiler: settings?.spoiler ?? false,
    sensitivity: settings?.sensitivity ?? "",
  };
}

function corvoBlogSettingsFromPost(
  settings?: V2CorvoBlogPlatformSettings
): V2CorvoBlogPlatformSettings {
  return {
    canonicalUrl: settings?.canonicalUrl ?? "",
    ogImage: settings?.ogImage ?? "",
    statusFlag: settings?.statusFlag ?? "",
    categoryOverride: settings?.categoryOverride ?? "",
  };
}

function normalizeHashtagsInput(value: string) {
  return value
    .split(/[,\s]+/)
    .map((tag) => tag.trim().replace(/^#/, ""))
    .filter(Boolean);
}

function serializePlatformSettings(
  channelId: V2ChannelId,
  values: {
    linkedIn: V2LinkedInPlatformSettings;
    reddit: V2RedditPlatformSettings;
    corvoBlog: V2CorvoBlogPlatformSettings;
  }
) {
  if (channelId === "linkedin") {
    return {
      cta: values.linkedIn.cta?.trim() || undefined,
      hashtags: values.linkedIn.hashtags?.length ? values.linkedIn.hashtags : undefined,
      linkPreview: values.linkedIn.linkPreview,
    } satisfies V2LinkedInPlatformSettings;
  }
  if (channelId === "reddit") {
    return {
      subreddit: values.reddit.subreddit?.trim() || undefined,
      flair: values.reddit.flair?.trim() || undefined,
      nsfw: values.reddit.nsfw || undefined,
      spoiler: values.reddit.spoiler || undefined,
      sensitivity: values.reddit.sensitivity?.trim() || undefined,
    } satisfies V2RedditPlatformSettings;
  }
  if (channelId === "corvo-blog") {
    return {
      canonicalUrl: values.corvoBlog.canonicalUrl?.trim() || undefined,
      ogImage: values.corvoBlog.ogImage?.trim() || undefined,
      statusFlag: values.corvoBlog.statusFlag?.trim() || undefined,
      categoryOverride: values.corvoBlog.categoryOverride?.trim() || undefined,
    } satisfies V2CorvoBlogPlatformSettings;
  }
  return undefined;
}

function platformSettingsChanged(
  channelId: V2ChannelId,
  previous:
    | V2LinkedInPlatformSettings
    | V2RedditPlatformSettings
    | V2CorvoBlogPlatformSettings
    | undefined,
  next:
    | V2LinkedInPlatformSettings
    | V2RedditPlatformSettings
    | V2CorvoBlogPlatformSettings
    | undefined
) {
  const previousSerialized = serializePlatformSettings(channelId, {
    linkedIn: linkedInSettingsFromPost(
      channelId === "linkedin" ? (previous as V2LinkedInPlatformSettings) : undefined
    ),
    reddit: redditSettingsFromPost(
      channelId === "reddit" ? (previous as V2RedditPlatformSettings) : undefined
    ),
    corvoBlog: corvoBlogSettingsFromPost(
      channelId === "corvo-blog" ? (previous as V2CorvoBlogPlatformSettings) : undefined
    ),
  });
  return JSON.stringify(previousSerialized) !== JSON.stringify(next);
}

export function PersistedPublishingPanel({ initialPostId }: { initialPostId?: string } = {}) {
  const [brandFilters, setBrandFilters] = useState<V2BrandId[]>(["corvo"]);
  const [platformFilters, setPlatformFilters] = useState<V2ChannelId[]>([
    "linkedin",
    "reddit",
    "corvo-blog",
  ]);
  const [statusFilters, setStatusFilters] = useState<V2PostStatus[]>([
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

  const brands = useQuery(api.v2Publishing.listBrands);
  const items = useQuery(api.v2Publishing.listCalendarItems, {
    brandIds: brandFilters,
    platformIds: platformFilters,
    statuses: statusFilters,
  }) as PersistedCalendarItem[] | undefined;
  const seedWorkspace = useMutation(api.v2Publishing.seedMvpWorkspace);
  const createPostWithIntent = useMutation(api.v2Publishing.createPostWithIntent);
  const setApproval = useMutation(api.v2Publishing.setApproval);
  const reschedule = useMutation(api.v2Publishing.reschedule);
  const updateContent = useMutation(api.v2Publishing.updateContent);
  const updatePlatformSettings = useMutation(api.v2Publishing.updatePlatformSettings);
  const submitMockProvider = useMutation(api.v2Publishing.submitMockProvider);
  const recordProviderIntent = useMutation(api.v2Publishing.recordProviderIntent);
  const recordGithubPr = useMutation(api.v2Publishing.recordGithubPr);

  const isSeeded = (brands?.length ?? 0) >= 4;
  const visibleItems = useMemo(() => items ?? [], [items]);
  const loading = brands === undefined || items === undefined;
  const firstScheduledDate = visibleItems
    .map((item) => itemScheduledDate(item))
    .find((date): date is string => Boolean(date));
  const anchorDate = useMemo(
    () =>
      calendarAnchor
        ? parseYMD(calendarAnchor)
        : firstScheduledDate
          ? parseYMD(firstScheduledDate)
          : new Date(),
    [calendarAnchor, firstScheduledDate]
  );
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
    setMessage("Seeded Personal, Corvo Labs, the lower dB, and FreshProof workspaces.");
  }

  async function handleCreateSample(channelId: V2ChannelId) {
    const title =
      channelId === "corvo-blog"
        ? "MVP validation blog PR dry run"
        : `MVP validation ${V2_CHANNEL_LABELS[channelId]} post`;
    await createPostWithIntent({
      brandId: channelId === "reddit" ? "freshproof" : "corvo",
      channelId,
      title,
      content:
        "Mock-provider validation item. This should remain visible on the calendar while unapproved, and it must not submit until approval is explicit.",
      scheduledDate: nextFridayDate(),
      scheduledTime: "09:00",
      timezone: "America/Los_Angeles",
      sourceIdeaId: "manual-mvp-validation",
    });
    setMessage(`Created a scheduled but unapproved ${V2_CHANNEL_LABELS[channelId]} item.`);
  }

  async function handleApprove(postId: Id<"v2Posts">) {
    await setApproval({ postId, approvalState: "approved" });
    setMessage("Approved item. Date-only reschedules now preserve approval.");
  }

  async function handleReschedule(postId: Id<"v2Posts">) {
    await reschedule({
      postId,
      scheduledDate: nextFridayDate(),
      scheduledTime: "10:30",
      timezone: "America/Los_Angeles",
    });
    setMessage("Rescheduled item without changing approval.");
  }

  async function handleSaveComposer(
    item: PersistedCalendarItem,
    values: {
      title: string;
      content: string;
      scheduledDate: string;
      scheduledTime: string;
      timezone: string;
      platformSettings?:
        | V2LinkedInPlatformSettings
        | V2RedditPlatformSettings
        | V2CorvoBlogPlatformSettings;
    }
  ) {
    const titleChanged = values.title.trim() !== item.post.title;
    const contentChanged = values.content !== item.post.content;
    const scheduleChanged =
      values.scheduledDate !== (item.intent?.scheduledDate ?? item.post.scheduledDate ?? "") ||
      values.scheduledTime !== (item.intent?.scheduledTime ?? item.post.scheduledTime ?? "") ||
      values.timezone !== (item.intent?.timezone ?? item.post.timezone ?? "America/Los_Angeles");
    const settingsChanged =
      values.platformSettings !== undefined &&
      platformSettingsChanged(
        item.post.channelId,
        item.post.platformSettings,
        values.platformSettings
      );

    if (titleChanged || contentChanged) {
      await updateContent({
        postId: item.post._id,
        title: values.title.trim(),
        content: values.content,
      });
    }
    if (settingsChanged && values.platformSettings) {
      await updatePlatformSettings({
        postId: item.post._id,
        platformSettings: values.platformSettings,
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

    if (titleChanged || contentChanged || settingsChanged) {
      setMessage(
        settingsChanged && !titleChanged && !contentChanged
          ? "Saved platform settings and cleared approval for re-review."
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
        ? "Mock Provider submitted the approved item."
        : (result.reason ?? "Mock Provider submission was skipped.")
    );
  }

  async function handleRetry(postId: Id<"v2Posts">) {
    const result = await submitMockProvider({ postId, mode: "success", retry: true });
    setMessage(
      result.submitted
        ? "Mock Provider retry submitted after an explicit human action."
        : (result.reason ?? "Mock Provider retry was skipped.")
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
      setMessage("Create PR is only available for Corvo Blog publishing items.");
      return;
    }
    if (!item.post.content.trim()) {
      setMessage("Create PR requires blog content and media metadata before handoff.");
      return;
    }
    const existingPrUrl = item.post.prUrl ?? item.providerState?.prUrl;
    if (existingPrUrl) {
      setMessage(`Corvo Blog PR already exists: ${existingPrUrl}`);
      return;
    }

    setMessage("Creating Corvo Blog PR...");
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
        excerpt:
          "A Corvo Labs draft generated from the Postiz-compatible Resonate v2 workflow.",
        author: "Jake Butler",
        tags: ["Corvo Labs", "Resonate", "Publishing Workflow"],
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
      setMessage(data.error || "GitHub PR creation failed.");
      return;
    }

    await recordGithubPr({
      postId: item.post._id,
      result: {
        prUrl: data.prUrl,
        branchName: data.branchName,
        sanitizedResponse: data.sanitizedResponse ?? {
          prUrl: data.prUrl,
          branchName: data.branchName,
        },
      },
    });
    setMessage(`Created Corvo Blog PR: ${data.prUrl}`);
  }

  function moveCalendar(direction: -1 | 1) {
    const next =
      calendarView === "month"
        ? addMonths(anchorDate, direction)
        : addDays(anchorDate, direction * 7);
    setCalendarAnchor(formatYMD(next));
  }

  return (
    <section className="border-b border-black/10 bg-[#edf3f1]">
      <div className="mx-auto max-w-7xl px-6 py-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-[#15616d]">
              <Database size={16} />
              Persisted MVP spine
            </div>
            <h2 className="mt-1 text-xl font-semibold">
              Publishing Intent, Provider State, and Mock Provider gates
            </h2>
            <p className="mt-1 max-w-3xl text-sm text-gray-600">
              Convex-backed calendar data with approval state, provider state, and
              Mock Provider gates in one operational view.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              className="inline-flex items-center gap-2 rounded-md bg-[#15616d] px-3 py-2 text-sm font-semibold text-white hover:bg-[#104d56]"
              onClick={handleSeed}
              type="button"
            >
              <ShieldCheck size={16} />
              {isSeeded ? "Reseed Workspace" : "Seed Workspace"}
            </button>
            <button
              className="rounded-md border border-black/15 bg-white px-3 py-2 text-sm font-medium hover:bg-black/5"
              onClick={() => handleCreateSample("linkedin")}
              type="button"
            >
              + LinkedIn
            </button>
            <button
              className="rounded-md border border-black/15 bg-white px-3 py-2 text-sm font-medium hover:bg-black/5"
              onClick={() => handleCreateSample("reddit")}
              type="button"
            >
              + Reddit
            </button>
            <button
              className="rounded-md border border-black/15 bg-white px-3 py-2 text-sm font-medium hover:bg-black/5"
              onClick={() => handleCreateSample("corvo-blog")}
              type="button"
            >
              + Blog PR
            </button>
          </div>
        </div>

        {message && (
          <div className="mt-4 rounded-md border border-[#15616d]/25 bg-white px-3 py-2 text-sm text-[#0f4c55]">
            {message}
          </div>
        )}

        <div className="mt-5 grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
          <div className="space-y-3 rounded-lg border border-black/10 bg-white p-4">
            <FilterGroup
              label="Brands"
              options={brandOptions}
              selected={brandFilters}
              onToggle={(id) => setBrandFilters(toggleSet(brandFilters, id))}
            />
            <FilterGroup
              label="Platforms"
              options={platformOptions}
              selected={platformFilters}
              onToggle={(id) => setPlatformFilters(toggleSet(platformFilters, id))}
            />
            <FilterGroup
              label="Status"
              options={statusOptions}
              selected={statusFilters}
              onToggle={(id) => setStatusFilters(toggleSet(statusFilters, id))}
            />
          </div>

          <div className="rounded-lg border border-black/10 bg-white">
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
              <p className="p-4 text-sm text-gray-600">Loading persisted publishing items...</p>
            )}

            {!loading && visibleItems.length === 0 && (
              <div className="p-4 text-sm text-gray-600">
                No persisted items match these filters. Seed the workspace, then create
                a LinkedIn, Reddit, or Blog PR validation item.
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
                          item={item}
                          key={item.post._id}
                          onApprove={handleApprove}
                          onCreatePr={() => handleCreatePr(item)}
                          onInspect={() => setManualSelectedPostId(item.post._id)}
                          onProviderIntent={handleProviderIntent}
                          onReschedule={handleReschedule}
                          onRetry={handleRetry}
                          onSubmit={handleSubmit}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
        {selectedItem && (
          <PublishingDetailDrawer
            item={selectedItem}
            onApprove={handleApprove}
            onClose={() => setManualSelectedPostId(null)}
            onCreatePr={() => handleCreatePr(selectedItem)}
            onProviderIntent={handleProviderIntent}
            onReschedule={handleReschedule}
            onRetry={handleRetry}
            onSaveComposer={(values) => handleSaveComposer(selectedItem, values)}
            onSubmit={handleSubmit}
          />
        )}
      </div>
    </section>
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
        <Badge>{V2_CHANNEL_LABELS[post.channelId]}</Badge>
        <Badge>{post.approvalState}</Badge>
        <span className="rounded-full bg-[#ff7d00]/10 px-2 py-0.5 text-[10px] font-medium text-[#7a3b00]">
          {providerState?.status ?? "not-submitted"}
        </span>
      </div>
    </button>
  );
}

function AgendaItem(props: {
  item: PersistedCalendarItem;
  onApprove: (postId: Id<"v2Posts">) => void;
  onCreatePr: () => void;
  onInspect: () => void;
  onProviderIntent: (
    postId: Id<"v2Posts">,
    intentType: "cancel" | "unpublish"
  ) => void;
  onReschedule: (postId: Id<"v2Posts">) => void;
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

  return (
    <article className="py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold">{post.title}</h3>
            <Badge>{V2_CHANNEL_LABELS[post.channelId]}</Badge>
            <Badge>{V2_STATUS_LABELS[post.status]}</Badge>
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
          <button
            className="inline-flex items-center gap-1 rounded-md border border-black/15 px-2.5 py-1.5 text-xs font-medium hover:bg-black/5"
            onClick={() => props.onReschedule(post._id)}
            type="button"
          >
            <CalendarClock size={14} />
            Reschedule
          </button>
          <button
            className="inline-flex items-center gap-1 rounded-md bg-[#ff7d00] px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-[#dd6d00] disabled:opacity-50"
            disabled={submitDisabled}
            onClick={() => props.onSubmit(post._id)}
            title={
              !approved ? "Approval is required before Mock Provider submission." : undefined
            }
            type="button"
          >
            <Send size={14} />
            Mock Submit
          </button>
          <button
            className="inline-flex items-center gap-1 rounded-md border border-[#7a3b00]/25 px-2.5 py-1.5 text-xs font-medium text-[#7a3b00] hover:bg-[#ff7d00]/10 disabled:opacity-50"
            disabled={providerIntentRecorded}
            onClick={() => props.onProviderIntent(post._id, providerIntentType)}
            type="button"
          >
            <Ban size={14} />
            {providerIntentType === "unpublish" ? "Unpublish Intent" : "Cancel Intent"}
          </button>
          {post.channelId === "corvo-blog" && (
            <button
              className="inline-flex items-center gap-1 rounded-md border border-[#15616d]/25 px-2.5 py-1.5 text-xs font-medium text-[#15616d] hover:bg-[#15616d]/10 disabled:opacity-50"
              disabled={Boolean(existingPrUrl)}
              onClick={props.onCreatePr}
              type="button"
            >
              <FileText size={14} />
              {existingPrUrl ? "PR Created" : "Create PR"}
            </button>
          )}
          {retryableAttempt && (
            <button
              className="inline-flex items-center gap-1 rounded-md border border-[#15616d]/25 px-2.5 py-1.5 text-xs font-medium text-[#15616d] hover:bg-[#15616d]/10"
              onClick={() => props.onRetry(post._id)}
              type="button"
            >
              <RotateCcw size={14} />
              Retry Mock
            </button>
          )}
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
          label="Provider"
          value={`${providerState?.providerId ?? "none"} / ${
            providerState?.status ?? "not-submitted"
          }`}
        />
      </dl>
      {item.attemptCount > 0 && (
        <p className="mt-2 text-xs text-gray-500">
          Attempts: {item.attemptCount}; last result: {item.lastAttempt?.status ?? "unknown"}
        </p>
      )}
    </article>
  );
}

function PublishingDetailDrawer(props: {
  item: PersistedCalendarItem;
  onApprove: (postId: Id<"v2Posts">) => void;
  onClose: () => void;
  onCreatePr: () => void;
  onProviderIntent: (
    postId: Id<"v2Posts">,
    intentType: "cancel" | "unpublish"
  ) => void;
  onReschedule: (postId: Id<"v2Posts">) => void;
  onRetry: (postId: Id<"v2Posts">) => void;
  onSaveComposer: (values: {
    title: string;
    content: string;
    scheduledDate: string;
    scheduledTime: string;
    timezone: string;
    platformSettings?:
      | V2LinkedInPlatformSettings
      | V2RedditPlatformSettings
      | V2CorvoBlogPlatformSettings;
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

  return (
    <aside
      aria-label="Publishing item detail"
      className="mt-5 rounded-lg border border-black/10 bg-white p-5 shadow-sm"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge>{V2_CHANNEL_LABELS[post.channelId]}</Badge>
            <Badge>{V2_STATUS_LABELS[post.status]}</Badge>
            <Badge>{post.approvalState}</Badge>
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
        <KeyValue label="Platform" value={V2_CHANNEL_LABELS[post.channelId]} />
        <KeyValue
          label="Schedule"
          value={formatDateTime(intent?.scheduledDate, intent?.scheduledTime, intent?.timezone)}
        />
        <KeyValue
          label="Provider"
          value={`${providerState?.providerId ?? "none"} / ${
            providerState?.status ?? "not-submitted"
          }`}
        />
        <KeyValue label="Publishing intent" value={String(intent?._id ?? "missing")} />
        <KeyValue label="Provider post" value={providerState?.providerPostId ?? "not created"} />
        <KeyValue label="PR URL" value={existingPrUrl ?? "not created"} />
        <KeyValue label="Branch" value={post.branchName ?? "not created"} />
        <KeyValue label="Source Idea" value={post.sourceIdeaId ?? "none"} />
        <KeyValue label="Research brief" value={post.sourceResearchBriefId ?? "none"} />
      </div>

      {providerState?.lastResponseSummary && (
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
        <button
          className="inline-flex items-center gap-1 rounded-md border border-black/15 px-3 py-2 text-sm font-medium hover:bg-black/5"
          onClick={() => props.onReschedule(post._id)}
          type="button"
        >
          <CalendarClock size={15} />
          Reschedule
        </button>
        <button
          className="inline-flex items-center gap-1 rounded-md bg-[#ff7d00] px-3 py-2 text-sm font-semibold text-white hover:bg-[#dd6d00] disabled:opacity-50"
          disabled={submitDisabled}
          onClick={() => props.onSubmit(post._id)}
          title={!approved ? "Approval is required before Mock Provider submission." : undefined}
          type="button"
        >
          <Send size={15} />
          Submit Now
        </button>
        <button
          className="inline-flex items-center gap-1 rounded-md border border-[#7a3b00]/25 px-3 py-2 text-sm font-medium text-[#7a3b00] hover:bg-[#ff7d00]/10 disabled:opacity-50"
          disabled={providerIntentRecorded}
          onClick={() => props.onProviderIntent(post._id, providerIntentType)}
          type="button"
        >
          <Ban size={15} />
          {providerIntentType === "unpublish" ? "Record Unpublish Intent" : "Record Cancel Intent"}
        </button>
        {post.channelId === "corvo-blog" && (
          <button
            className="inline-flex items-center gap-1 rounded-md border border-[#15616d]/25 px-3 py-2 text-sm font-medium text-[#15616d] hover:bg-[#15616d]/10 disabled:opacity-50"
            disabled={Boolean(existingPrUrl)}
            onClick={props.onCreatePr}
            type="button"
          >
            <FileText size={15} />
            {existingPrUrl ? "PR Created" : "Create PR"}
          </button>
        )}
        {retryableAttempt && (
          <button
            className="inline-flex items-center gap-1 rounded-md border border-[#15616d]/25 px-3 py-2 text-sm font-medium text-[#15616d] hover:bg-[#15616d]/10"
            onClick={() => props.onRetry(post._id)}
            type="button"
          >
            <RotateCcw size={15} />
            Retry Mock
          </button>
        )}
      </div>

      <PersistedPostComposer
        item={item}
        key={post._id}
        onSave={props.onSaveComposer}
      />

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
    platformSettings?:
      | V2LinkedInPlatformSettings
      | V2RedditPlatformSettings
      | V2CorvoBlogPlatformSettings;
  }) => void;
}) {
  const { item } = props;
  const post = item.post;
  const intent = item.intent;
  const [title, setTitle] = useState(post.title);
  const [content, setContent] = useState(post.content);
  const [scheduledDate, setScheduledDate] = useState(
    intent?.scheduledDate ?? post.scheduledDate ?? ""
  );
  const [scheduledTime, setScheduledTime] = useState(
    intent?.scheduledTime ?? post.scheduledTime ?? ""
  );
  const [timezone, setTimezone] = useState(
    intent?.timezone ?? post.timezone ?? "America/Los_Angeles"
  );
  const [linkedInSettings, setLinkedInSettings] = useState<V2LinkedInPlatformSettings>(() =>
    linkedInSettingsFromPost(
      post.channelId === "linkedin"
        ? (post.platformSettings as V2LinkedInPlatformSettings | undefined)
        : undefined
    )
  );
  const [redditSettings, setRedditSettings] = useState<V2RedditPlatformSettings>(() =>
    redditSettingsFromPost(
      post.channelId === "reddit"
        ? (post.platformSettings as V2RedditPlatformSettings | undefined)
        : undefined
    )
  );
  const [corvoBlogSettings, setCorvoBlogSettings] = useState<V2CorvoBlogPlatformSettings>(() =>
    corvoBlogSettingsFromPost(
      post.channelId === "corvo-blog"
        ? (post.platformSettings as V2CorvoBlogPlatformSettings | undefined)
        : undefined
    )
  );

  const contentChanged = title.trim() !== post.title || content !== post.content;
  const scheduleChanged =
    scheduledDate !== (intent?.scheduledDate ?? post.scheduledDate ?? "") ||
    scheduledTime !== (intent?.scheduledTime ?? post.scheduledTime ?? "") ||
    timezone !== (intent?.timezone ?? post.timezone ?? "America/Los_Angeles");
  const nextPlatformSettings = serializePlatformSettings(post.channelId, {
    linkedIn: linkedInSettings,
    reddit: redditSettings,
    corvoBlog: corvoBlogSettings,
  });
  const settingsChanged = platformSettingsChanged(
    post.channelId,
    post.platformSettings,
    nextPlatformSettings
  );
  const linkedInOverLimit = post.channelId === "linkedin" && content.length > 3000;
  const canSave =
    (contentChanged || scheduleChanged || settingsChanged) && title.trim().length > 0;

  return (
    <section className="mt-5 rounded-lg border border-black/10 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 className="text-sm font-semibold">Single Composer</h4>
          <p className="mt-1 text-xs text-gray-500">
            One persisted editor for social and Corvo Blog posts. Content and platform setting
            edits require re-approval; date-only schedule edits keep the current approval state.
          </p>
        </div>
        <div className="flex flex-wrap gap-1">
          <Badge>{post.brandId}</Badge>
          <Badge>{V2_CHANNEL_LABELS[post.channelId]}</Badge>
        </div>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px]">
        <div className="space-y-3">
          <label className="block text-xs font-semibold text-gray-600">
            Title
            <input
              className="mt-1 w-full rounded-md border border-black/15 px-3 py-2 text-sm outline-none focus:border-[#15616d] focus:ring-2 focus:ring-[#15616d]/15"
              onChange={(event) => setTitle(event.target.value)}
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
          <PlatformSettingsPane
            channelId={post.channelId}
            contentLength={content.length}
            corvoBlog={corvoBlogSettings}
            linkedIn={linkedInSettings}
            onCorvoBlogChange={setCorvoBlogSettings}
            onLinkedInChange={setLinkedInSettings}
            onRedditChange={setRedditSettings}
            reddit={redditSettings}
          />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-gray-500">
          {contentChanged || settingsChanged
            ? "Content or platform settings changed: saving will clear approval."
            : scheduleChanged
              ? "Schedule-only change: approval is preserved."
              : "No unsaved composer changes."}
        </p>
        <button
          className="inline-flex items-center gap-1 rounded-md bg-[#15616d] px-3 py-2 text-sm font-semibold text-white hover:bg-[#104d56] disabled:opacity-50"
          disabled={!canSave || linkedInOverLimit}
          onClick={() =>
            props.onSave({
              title,
              content,
              scheduledDate,
              scheduledTime,
              timezone,
              platformSettings: settingsChanged ? nextPlatformSettings : undefined,
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

function PlatformSettingsPane(props: {
  channelId: V2ChannelId;
  contentLength: number;
  linkedIn: V2LinkedInPlatformSettings;
  reddit: V2RedditPlatformSettings;
  corvoBlog: V2CorvoBlogPlatformSettings;
  onLinkedInChange: (value: V2LinkedInPlatformSettings) => void;
  onRedditChange: (value: V2RedditPlatformSettings) => void;
  onCorvoBlogChange: (value: V2CorvoBlogPlatformSettings) => void;
}) {
  const { channelId } = props;

  return (
    <div className="rounded-md border border-black/10 bg-black/[0.02] p-3 text-xs text-gray-600">
      <p className="font-semibold text-gray-700">Platform settings</p>
      {channelId === "linkedin" && (
        <div className="mt-2 space-y-2">
          <p className={props.contentLength > 3000 ? "text-red-600" : undefined}>
            LinkedIn character count: {props.contentLength} / 3000
          </p>
          <label className="block">
            Call to action
            <input
              className="mt-1 w-full rounded-md border border-black/15 px-2 py-1.5 text-sm"
              onChange={(event) =>
                props.onLinkedInChange({ ...props.linkedIn, cta: event.target.value })
              }
              value={props.linkedIn.cta ?? ""}
            />
          </label>
          <label className="block">
            Hashtags
            <input
              className="mt-1 w-full rounded-md border border-black/15 px-2 py-1.5 text-sm"
              onChange={(event) =>
                props.onLinkedInChange({
                  ...props.linkedIn,
                  hashtags: normalizeHashtagsInput(event.target.value),
                })
              }
              placeholder="#corvo, growth"
              value={(props.linkedIn.hashtags ?? []).map((tag) => `#${tag}`).join(" ")}
            />
          </label>
          <label className="inline-flex items-center gap-2">
            <input
              checked={props.linkedIn.linkPreview ?? true}
              onChange={(event) =>
                props.onLinkedInChange({
                  ...props.linkedIn,
                  linkPreview: event.target.checked,
                })
              }
              type="checkbox"
            />
            Enable link preview
          </label>
        </div>
      )}
      {channelId === "reddit" && (
        <div className="mt-2 space-y-2">
          <label className="block">
            Subreddit
            <input
              className="mt-1 w-full rounded-md border border-black/15 px-2 py-1.5 text-sm"
              onChange={(event) =>
                props.onRedditChange({ ...props.reddit, subreddit: event.target.value })
              }
              placeholder="r/startups"
              value={props.reddit.subreddit ?? ""}
            />
          </label>
          <label className="block">
            Flair
            <input
              className="mt-1 w-full rounded-md border border-black/15 px-2 py-1.5 text-sm"
              onChange={(event) =>
                props.onRedditChange({ ...props.reddit, flair: event.target.value })
              }
              value={props.reddit.flair ?? ""}
            />
          </label>
          <label className="block">
            Sensitivity
            <input
              className="mt-1 w-full rounded-md border border-black/15 px-2 py-1.5 text-sm"
              onChange={(event) =>
                props.onRedditChange({ ...props.reddit, sensitivity: event.target.value })
              }
              value={props.reddit.sensitivity ?? ""}
            />
          </label>
          <label className="inline-flex items-center gap-2">
            <input
              checked={props.reddit.nsfw ?? false}
              onChange={(event) =>
                props.onRedditChange({ ...props.reddit, nsfw: event.target.checked })
              }
              type="checkbox"
            />
            NSFW
          </label>
          <label className="inline-flex items-center gap-2">
            <input
              checked={props.reddit.spoiler ?? false}
              onChange={(event) =>
                props.onRedditChange({ ...props.reddit, spoiler: event.target.checked })
              }
              type="checkbox"
            />
            Spoiler
          </label>
        </div>
      )}
      {channelId === "corvo-blog" && (
        <div className="mt-2 space-y-2">
          <label className="block">
            Canonical URL override
            <input
              className="mt-1 w-full rounded-md border border-black/15 px-2 py-1.5 text-sm"
              onChange={(event) =>
                props.onCorvoBlogChange({
                  ...props.corvoBlog,
                  canonicalUrl: event.target.value,
                })
              }
              value={props.corvoBlog.canonicalUrl ?? ""}
            />
          </label>
          <label className="block">
            OG image URL
            <input
              className="mt-1 w-full rounded-md border border-black/15 px-2 py-1.5 text-sm"
              onChange={(event) =>
                props.onCorvoBlogChange({ ...props.corvoBlog, ogImage: event.target.value })
              }
              value={props.corvoBlog.ogImage ?? ""}
            />
          </label>
          <label className="block">
            Status flag override
            <input
              className="mt-1 w-full rounded-md border border-black/15 px-2 py-1.5 text-sm"
              onChange={(event) =>
                props.onCorvoBlogChange({ ...props.corvoBlog, statusFlag: event.target.value })
              }
              value={props.corvoBlog.statusFlag ?? ""}
            />
          </label>
          <label className="block">
            Category override
            <input
              className="mt-1 w-full rounded-md border border-black/15 px-2 py-1.5 text-sm"
              onChange={(event) =>
                props.onCorvoBlogChange({
                  ...props.corvoBlog,
                  categoryOverride: event.target.value,
                })
              }
              value={props.corvoBlog.categoryOverride ?? ""}
            />
          </label>
        </div>
      )}
      {!["linkedin", "reddit", "corvo-blog"].includes(channelId) && (
        <p className="mt-2">Planning channel. Provider routing may be unavailable.</p>
      )}
    </div>
  );
}


function FilterGroup<T extends string>(props: {
  label: string;
  options: Array<{ id: T; name?: string; label?: string }>;
  selected: T[];
  onToggle: (id: T) => void;
}) {
  return (
    <fieldset>
      <legend className="text-xs font-semibold uppercase text-gray-500">
        {props.label}
      </legend>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {props.options.map((option) => {
          const checked = props.selected.includes(option.id);
          return (
            <label
              className={`cursor-pointer rounded-full border px-2.5 py-1 text-xs font-medium ${
                checked
                  ? "border-[#15616d] bg-[#e8f3f4] text-[#15616d]"
                  : "border-black/10 text-gray-600 hover:bg-black/5"
              }`}
              key={option.id}
            >
              <input
                checked={checked}
                className="sr-only"
                onChange={() => props.onToggle(option.id)}
                type="checkbox"
              />
              {option.name ?? option.label ?? option.id}
            </label>
          );
        })}
      </div>
    </fieldset>
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

function KeyValue(props: { label: string; value: string }) {
  return (
    <div>
      <dt className="font-medium text-gray-500">{props.label}</dt>
      <dd className="mt-0.5 break-words text-gray-800">{props.value}</dd>
    </div>
  );
}
