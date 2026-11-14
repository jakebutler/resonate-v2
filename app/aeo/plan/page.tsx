import type { Metadata } from "next";
import { PlanFlow } from "@/components/aeo/PlanFlow";

export const metadata: Metadata = {
  title: "Resonate — AEO/SEO strategy plan",
};

export default function AeoPlanPage() {
  return <PlanFlow />;
}
