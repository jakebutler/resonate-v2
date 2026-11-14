import type { Metadata } from "next";
import { CompetitorsFlow } from "@/components/aeo/CompetitorsFlow";

export const metadata: Metadata = {
  title: "Resonate — AEO/SEO competitor review",
};

export default function AeoCompetitorsPage() {
  return <CompetitorsFlow />;
}
