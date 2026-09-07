import { Shell } from "@/components/shell/Shell";
import { ApprovalQueue } from "@/components/campaigns/ApprovalQueue";

export const metadata = {
  title: "Resonate — Approval queue",
};

export default async function ApprovalQueuePage({
  params,
}: {
  params: Promise<{ campaignId: string }>;
}) {
  const { campaignId } = await params;
  return (
    <Shell activeSurface="campaigns">
      <ApprovalQueue campaignId={campaignId} />
    </Shell>
  );
}
