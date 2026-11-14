import type { Metadata } from "next";
import { ConnectFlow } from "@/components/aeo/ConnectFlow";

export const metadata: Metadata = {
  title: "Resonate — AEO/SEO connect target",
};

export default function AeoConnectPage() {
  return <ConnectFlow />;
}
