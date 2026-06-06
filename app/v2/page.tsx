import { PersistedPublishingPanel } from "@/components/PersistedPublishingPanel";
import { V2ResonateApp } from "@/components/V2ResonateApp";

export const metadata = {
  title: "Resonate v2",
  description: "Postiz-based multi-brand content operations for Corvo Labs",
};

export default function V2Page() {
  return (
    <>
      <PersistedPublishingPanel />
      <V2ResonateApp />
    </>
  );
}
