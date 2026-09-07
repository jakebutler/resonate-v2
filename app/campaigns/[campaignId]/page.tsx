import { Shell } from "@/components/shell/Shell";
import { CampaignSession } from "@/components/campaigns/CampaignSession";

export const metadata = {
  title: "Resonate — Campaign session",
};

export default async function CampaignSessionPage({
  params,
}: {
  params: Promise<{ campaignId: string }>;
}) {
  const { campaignId } = await params;
  return (
    <Shell activeSurface="campaigns">
      <CampaignSession campaignId={campaignId} />
    </Shell>
  );
}
