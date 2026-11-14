import type { Metadata } from "next";
import { Shell } from "@/components/shell/Shell";
import { AeoWorkspaceChrome } from "@/components/aeo/AeoWorkspaceChrome";

export const metadata: Metadata = {
  title: "Resonate — AEO/SEO intelligence",
  description:
    "Connected targets, answer-engine visibility, competitor review, gaps, and strategy plans",
};

export default function AeoLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Shell activeSurface="aeo-seo">
      <AeoWorkspaceChrome>{children}</AeoWorkspaceChrome>
    </Shell>
  );
}
