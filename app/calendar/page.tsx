import { Shell } from "@/components/shell/Shell";
import { PublishingPanelErrorBoundary } from "@/components/PublishingPanelErrorBoundary";
import { PersistedPublishingPanel } from "@/components/PersistedPublishingPanel";

export const metadata = {
  title: "Resonate",
  description: "Postiz-based multi-brand content operations for Corvo Labs",
};

type CalendarPageProps = {
  searchParams: Promise<{ postId?: string | string[]; devMode?: string | string[] }>;
};

export default async function CalendarPage({ searchParams }: CalendarPageProps) {
  const resolvedSearchParams = await searchParams;
  const postIdRaw = resolvedSearchParams.postId;
  const initialPostId = Array.isArray(postIdRaw) ? postIdRaw[0] : postIdRaw;
  const devModeRaw = resolvedSearchParams.devMode;
  const devMode = (Array.isArray(devModeRaw) ? devModeRaw[0] : devModeRaw) === "1";

  return (
    <Shell activeSurface="calendar">
      <PublishingPanelErrorBoundary>
        <PersistedPublishingPanel devMode={devMode} initialPostId={initialPostId} />
      </PublishingPanelErrorBoundary>
    </Shell>
  );
}
