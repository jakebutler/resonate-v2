import { Shell } from "@/components/shell/Shell";
import { ResearchApp } from "@/components/ResearchApp";

export const metadata = {
  title: "Resonate — Research & AI",
  description: "Research briefs, claim maps, outlines, and AI-assisted drafts",
};

export default function ResearchPage() {
  return (
    <Shell activeSurface="research">
      <ResearchApp />
    </Shell>
  );
}
