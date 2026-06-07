/** Shared Resonate surface tokens — match Publishing calendar styling. */
export const tokens = {
  pageBg: "bg-[#edf3f1]",
  canvasBg: "bg-[#f7f7f4]",
  accent: "text-[#15616d]",
  accentBg: "bg-[#e8f3f4]",
  accentBorder: "border-[#15616d]",
  text: "text-[#111827]",
  textMuted: "text-gray-600",
  textSubtle: "text-gray-500",
  border: "border-black/10",
  panel: "rounded-lg border border-black/10 bg-white",
  panelPadding: "p-4",
  pillActive: "border-[#15616d] bg-[#e8f3f4] text-[#15616d]",
  pillIdle: "border-black/10 text-gray-600 hover:bg-black/5",
  notice: "rounded-md border border-[#15616d]/25 bg-white px-3 py-2 text-sm text-[#0f4c55]",
  noticeWarning:
    "rounded-md border border-[#ff7d00]/30 bg-[#fff8f0] px-3 py-2 text-sm text-[#8a4b00]",
  maxWidth: "mx-auto max-w-7xl px-6 py-5",
  workspaceGrid: "mt-5 grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]",
  sidebarStack: "space-y-3",
} as const;
