import { Shell } from "@/components/shell/Shell";
import { CampaignsHome } from "@/components/campaigns/CampaignsHome";

export const metadata = {
  title: "Resonate — Campaigns",
  description: "Source material to cohesive draft batches, nothing auto-approved",
};

export default function CampaignsPage() {
  return (
    <Shell activeSurface="campaigns">
      <CampaignsHome />
    </Shell>
  );
}
