import { CHANNEL_LABELS, type ChannelId } from "@/lib/domain";

/**
 * D-20: product-facing labels for raw enums. Raw ids (`corvo-blog`,
 * `cli`, `active`) are internal values and must never render verbatim.
 */
const CHANNEL_LABEL_OVERRIDES: Partial<Record<ChannelId, string>> = {
  "corvo-blog": "Corvo Blog",
};

export function channelLabel(channel: string): string {
  const override = CHANNEL_LABEL_OVERRIDES[channel as ChannelId];
  if (override) return override;
  const known = CHANNEL_LABELS[channel as ChannelId];
  if (known) return known;
  return channel.charAt(0).toUpperCase() + channel.slice(1);
}

export function campaignStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    active: "Active",
    completed: "Completed",
  };
  return labels[status] ?? status;
}

export function corpusOriginLabel(origin: string): string {
  const labels: Record<string, string> = {
    upload: "Uploaded",
    cli: "Imported",
    paste: "Pasted",
  };
  return labels[origin] ?? origin;
}
