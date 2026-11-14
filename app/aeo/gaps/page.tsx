import type { Metadata } from "next";
import { GapsFlow } from "@/components/aeo/GapsFlow";

export const metadata: Metadata = {
  title: "Resonate — AEO/SEO gaps",
};

export default function AeoGapsPage() {
  return <GapsFlow />;
}
