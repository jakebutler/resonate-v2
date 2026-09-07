import { Shell } from "@/components/shell/Shell";
import { DraftSetView } from "@/components/campaigns/DraftSetView";

export const metadata = {
  title: "Resonate — Draft set",
};

export default async function CampaignDraftsPage({
  params,
}: {
  params: Promise<{ campaignId: string }>;
}) {
  const { campaignId } = await params;
  return (
    <Shell activeSurface="campaigns">
      <DraftSetView campaignId={campaignId} />
    </Shell>
  );
}
