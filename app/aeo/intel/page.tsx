import type { Metadata } from "next";
import { IntelFlow } from "@/components/aeo/IntelFlow";

export const metadata: Metadata = {
  title: "Resonate — AEO/SEO intel",
};

export default function AeoIntelPage() {
  return <IntelFlow />;
}
