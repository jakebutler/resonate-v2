import { Shell } from "@/components/shell/Shell";
import { CampaignShapeBuilder } from "@/components/campaigns/CampaignShapeBuilder";

export const metadata = {
  title: "Resonate — Campaign shape",
};

export default async function CampaignShapePage({
  params,
}: {
  params: Promise<{ campaignId: string }>;
}) {
  const { campaignId } = await params;
  return (
    <Shell activeSurface="campaigns">
      <CampaignShapeBuilder campaignId={campaignId} />
    </Shell>
  );
}
