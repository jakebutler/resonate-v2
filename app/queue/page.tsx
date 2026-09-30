import { Shell } from "@/components/shell/Shell";
import { QueuePlanningPanel } from "@/components/QueuePlanningPanel";
export default async function QueuePage({
  searchParams,
}: {
  searchParams: Promise<{ seriesId?: string; brandId?: string }>;
}) {
  const params = await searchParams;
  return (
    <Shell activeSurface="queue">
      <QueuePlanningPanel
        initialSeriesId={params.seriesId}
        initialBrandId={params.brandId}
      />
    </Shell>
  );
}
