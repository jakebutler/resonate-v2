"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChannelIcon } from "@/components/campaigns/ChannelIcon";
import { tokens } from "@/components/shell/tokens";
import { cn } from "@/lib/utils";
import {
  CAMPAIGN_PRESETS,
  ROLE_LEGEND,
  ROLE_TINTS,
  countIncompleteSlots,
  type CampaignPresetKey,
  type SlotRole,
} from "@/lib/campaignShapes";

type SlotDoc = {
  _id: string;
  seq: number;
  role: SlotRole;
  channel: string;
  mediaType: string;
  title?: string;
  angle?: string;
  ideaId?: string;
};

type IdeaDoc = {
  _id: string;
  text: string;
  flavor?: string;
  title?: string;
};

type ShapeView = {
  campaign: { _id: string; title: string };
  shape: {
    _id: string;
    preset: CampaignPresetKey;
    status: "proposed" | "accepted";
  } | null;
  slots: SlotDoc[];
  workingSet: { idea: IdeaDoc | null }[];
  brief: { goal?: string; audience?: string } | null;
};

const MEDIA_LABELS: Record<string, string> = {
  post: "post",
  article: "article",
  essay: "essay",
  script: "script",
};

export function CampaignShapeBuilder({ campaignId }: { campaignId: string }) {
  const typedCampaignId = campaignId as never;
  const view = useQuery(api.shapes.getCampaignShape, {
    campaignId: typedCampaignId,
  }) as ShapeView | null | undefined;

  const proposeShape = useMutation(api.shapes.proposeShape);
  const updateSlot = useMutation(api.shapes.updateSlot);
  const linkSlotIdea = useMutation(api.shapes.linkSlotIdea);
  const moveSlot = useMutation(api.shapes.moveSlot);
  const acceptShape = useMutation(api.shapes.acceptShape);
  const saveBrief = useMutation(api.shapes.saveBrief);

  const [editing, setEditing] = useState<"title" | "angle" | null>(null);
  const [editingSlot, setEditingSlot] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [toast, setToast] = useState<string | null>(null);

  function showToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(null), 3600);
  }

  if (view === undefined) {
    return (
      <main className={cn(tokens.maxWidth)}>
        <p className={cn("text-sm", tokens.textMuted)}>Loading shape…</p>
      </main>
    );
  }
  if (view === null) {
    return (
      <main className={cn(tokens.maxWidth)}>
        <p className="text-sm font-semibold text-red-700">Campaign not found.</p>
        <Link href="/campaigns" className={cn("text-sm underline", tokens.accent)}>
          Back to Campaigns
        </Link>
      </main>
    );
  }

  const slots = view.slots;
  const incomplete = countIncompleteSlots(slots);
  const isAccepted = view.shape?.status === "accepted";
  const activePreset = view.shape?.preset ?? "standard";

  async function handleSwitchPreset(preset: CampaignPresetKey) {
    if (isAccepted) return;
    try {
      await proposeShape({ campaignId: typedCampaignId, preset });
      showToast(
        `Switched to the ${CAMPAIGN_PRESETS[preset].name} preset — your edits are preserved (slots matched by role + channel). Working set untouched.`
      );
    } catch (caught) {
      showToast(caught instanceof Error ? caught.message : "Could not switch preset.");
    }
  }

  async function handleAccept() {
    if (!view?.shape) return;
    try {
      await acceptShape({ shapeId: view.shape._id as never });
      showToast(
        "Shape accepted — the durable plan is set. Next: generate the draft set."
      );
    } catch (caught) {
      showToast(caught instanceof Error ? caught.message : "Could not accept the shape.");
    }
  }

  function saveBriefField(field: "goal" | "audience", value: string) {
    const trimmed = value.trim();
    if (!trimmed) return;
    void saveBrief({
      campaignId: typedCampaignId,
      ...(field === "goal" ? { goal: trimmed } : { audience: trimmed }),
    });
  }

  function commitEdit(slot: SlotDoc, kind: "title" | "angle") {
    const value = draft.trim();
    if (view?.shape) {
      void updateSlot({
        shapeId: view.shape._id as never,
        slotId: slot._id as never,
        ...(kind === "title" ? { title: value } : { angle: value }),
      });
    }
    setEditing(null);
    setEditingSlot(null);
  }

  return (
    <main className={cn(tokens.maxWidth)}>
      <div className="flex flex-wrap items-baseline gap-3">
        <h1 className="text-xl font-semibold">
          {isAccepted ? "Campaign shape" : "Propose the campaign shape"}
        </h1>
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/campaigns/${campaignId}`}>Back to session</Link>
        </Button>
      </div>
      <p className={cn("mt-1 text-sm", tokens.textMuted)}>
        A shape is a durable plan of <b>slots</b> — channel × media type × role
        — with optional title, angle, and linked ideas. The shape fixes the{" "}
        <b>publishing sequence</b> (1 → n); the calendar owns the{" "}
        <b>publishing schedule</b> (dates and times).
      </p>

      <div className={cn(tokens.panel, "mt-4 grid gap-3 p-4 sm:grid-cols-2")} data-testid="brief-card">
        <div>
          <label className={cn("mb-1 block text-[11px] font-semibold uppercase tracking-wide", tokens.textMuted)} htmlFor="brief-goal">
            Campaign goal — rides with the shape into the brief
          </label>
          <Input
            id="brief-goal"
            defaultValue={view.brief?.goal ?? ""}
            onBlur={(event) => saveBriefField("goal", event.target.value)}
          />
        </div>
        <div>
          <label className={cn("mb-1 block text-[11px] font-semibold uppercase tracking-wide", tokens.textMuted)} htmlFor="brief-audience">
            Primary audience
          </label>
          <Input
            id="brief-audience"
            defaultValue={view.brief?.audience ?? ""}
            onBlur={(event) => saveBriefField("audience", event.target.value)}
          />
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3" data-testid="preset-cards">
        {Object.values(CAMPAIGN_PRESETS).map((preset) => (
          <button
            key={preset.key}
            type="button"
            disabled={isAccepted}
            onClick={() => void handleSwitchPreset(preset.key)}
            className={cn(
              "rounded-lg border bg-white p-3.5 text-left transition-colors",
              preset.key === activePreset
                ? "border-[#ff7d00] shadow-[inset_0_0_0_1px_#ff7d00]"
                : "border-black/10 hover:border-[#15616d]",
              isAccepted && "cursor-default opacity-70"
            )}
            data-testid={`preset-${preset.key}`}
          >
            <span className="flex items-baseline justify-between">
              <b className="text-[15px]">{preset.name}</b>
              <span className="text-xs font-semibold text-[#78290f]">
                {preset.slots.length} slots
              </span>
            </span>
            <span className={cn("mt-1 block text-xs leading-relaxed", tokens.textMuted)}>
              {preset.description}
            </span>
          </button>
        ))}
      </div>
      <p className={cn("mt-2 text-xs leading-relaxed", tokens.textMuted)}>
        Presets are Corvo default compositions. Switching presets re-proposes
        the shape and <b>keeps your edits</b> — slots are matched by role +
        channel; everything else fills from the preset. Your working set is
        untouched.
      </p>

      <div className={cn(tokens.panel, "mt-4 overflow-hidden")} data-testid="shape-card">
        <div className={cn("flex items-center justify-between px-4 py-3 text-xs font-semibold uppercase tracking-wide", tokens.textMuted)}>
          <span>
            {isAccepted ? "Accepted shape" : "Proposed shape"} — {slots.length} slots
          </span>
          {isAccepted ? (
            <span className={cn("rounded-full px-2.5 py-0.5 text-[11px] font-normal normal-case", tokens.accentBg, tokens.accent)}>
              accepted
            </span>
          ) : (
            <span className="rounded-full bg-[#fff1e0] px-2.5 py-0.5 text-[11px] font-normal normal-case text-[#b25400]">
              editable
            </span>
          )}
        </div>
        <div className={cn("border-t px-4 py-2.5 text-xs leading-relaxed", tokens.border, tokens.textMuted)}>
          {Object.entries(ROLE_LEGEND).map(([role, help], index) => (
            <span key={role} className="whitespace-nowrap">
              <span
                className={cn("mx-1 inline-block h-2 w-2 rounded-sm align-middle", ROLE_TINTS[role as SlotRole].split(" ")[0])}
              />
              <b className="capitalize">{role}</b> {help}
              {index < Object.entries(ROLE_LEGEND).length - 1 ? " ·" : ""}
            </span>
          ))}
          . Numbers on the left are the publishing sequence (1 → n); dates live
          on the calendar.
        </div>

        {slots.length === 0 ? (
          <div className={cn("border-t px-4 py-8 text-center text-sm", tokens.border, tokens.textMuted)}>
            No shape proposed yet.
          </div>
        ) : null}

        {slots
          .slice()
          .sort((a, b) => a.seq - b.seq)
          .map((slot, index, sorted) => {
            const slotIncomplete = !slot.ideaId;
            const isEditing =
              editing !== null && editingSlot === slot._id ? editing : null;
            const linkedIdea = view.workingSet.find(
              (entry) => entry.idea?._id === slot.ideaId
            )?.idea;
            return (
              <div
                key={slot._id}
                className={cn("grid grid-cols-[34px_minmax(0,1fr)_230px] items-start gap-3 border-t px-4 py-3.5", tokens.border, slotIncomplete && "bg-[#fffaf1]")}
                data-testid="slot-row"
              >
                <div className="flex flex-col items-center gap-0.5">
                  <button
                    type="button"
                    aria-label="Move slot up"
                    disabled={index === 0 || isAccepted}
                    onClick={() =>
                      void moveSlot({
                        shapeId: view.shape!._id as never,
                        slotId: slot._id as never,
                        direction: -1,
                      })
                    }
                    className="text-[10px] text-gray-400 hover:text-[#ff7d00] disabled:opacity-30"
                  >
                    ▲
                  </button>
                  <span className="text-lg text-[#15616d]">{slot.seq}</span>
                  <button
                    type="button"
                    aria-label="Move slot down"
                    disabled={index === sorted.length - 1 || isAccepted}
                    onClick={() =>
                      void moveSlot({
                        shapeId: view.shape!._id as never,
                        slotId: slot._id as never,
                        direction: 1,
                      })
                    }
                    className="text-[10px] text-gray-400 hover:text-[#ff7d00] disabled:opacity-30"
                  >
                    ▼
                  </button>
                  <span className={cn("text-[9px] uppercase tracking-wide", tokens.textMuted)}>seq</span>
                </div>

                <div className="min-w-0">
                  <div className="mb-1.5 flex flex-wrap items-center gap-2">
                    <span
                      className={cn(
                        "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-normal uppercase tracking-wide",
                        ROLE_TINTS[slot.role]
                      )}
                      title={ROLE_LEGEND[slot.role]}
                    >
                      {slot.role}
                    </span>
                    <span className="inline-flex items-center gap-1.5 text-[13px] font-medium">
                      <ChannelIcon channel={slot.channel} />
                      {slot.channel === "corvo-blog" ? "Corvo Blog" : slot.channel}
                    </span>
                    <span className="text-[13px]">{MEDIA_LABELS[slot.mediaType] ?? slot.mediaType}</span>
                    {slotIncomplete ? (
                      <span className="rounded-[5px] bg-[#ffe3d3] px-2 py-0.5 text-[11px] font-semibold text-[#78290f]">
                        incomplete — no idea linked
                      </span>
                    ) : null}
                  </div>
                  <div className="flex items-baseline gap-2">
                    {isEditing === "title" ? (
                      <Input
                        autoFocus
                        value={draft}
                        onChange={(event) => setDraft(event.target.value)}
                        onBlur={() => commitEdit(slot, "title")}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") commitEdit(slot, "title");
                        }}
                        className="h-8 text-sm"
                        aria-label="Slot title"
                      />
                    ) : (
                      <>
                        <span className={cn("text-[15px]", slot.title ? "" : cn("italic", tokens.textMuted))}>
                          {slot.title || "No title yet"}
                        </span>
                        {!isAccepted ? (
                          <button
                            type="button"
                            aria-label="Edit title"
                            className="text-xs text-gray-400 hover:text-[#ff7d00]"
                            onClick={() => {
                              setEditing("title");
                              setEditingSlot(slot._id);
                              setDraft(slot.title ?? "");
                            }}
                          >
                            ✎
                          </button>
                        ) : null}
                      </>
                    )}
                  </div>
                  <div className="mt-0.5 flex items-baseline gap-2">
                    {isEditing === "angle" ? (
                      <Input
                        autoFocus
                        value={draft}
                        onChange={(event) => setDraft(event.target.value)}
                        onBlur={() => commitEdit(slot, "angle")}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") commitEdit(slot, "angle");
                        }}
                        className="h-8 text-sm"
                        aria-label="Slot angle"
                      />
                    ) : (
                      <>
                        <span className={cn("text-[13px]", slot.angle ? tokens.textMuted : cn("italic", tokens.textMuted))}>
                          {slot.angle || "Add an angle"}
                        </span>
                        {!isAccepted ? (
                          <button
                            type="button"
                            aria-label="Edit angle"
                            className="text-xs text-gray-400 hover:text-[#ff7d00]"
                            onClick={() => {
                              setEditing("angle");
                              setEditingSlot(slot._id);
                              setDraft(slot.angle ?? "");
                            }}
                          >
                            ✎
                          </button>
                        ) : null}
                      </>
                    )}
                  </div>
                </div>

                <aside className="flex flex-col gap-1">
                  <span className={cn("text-[11px] font-semibold uppercase tracking-wide", tokens.textMuted)}>
                    Linked idea
                  </span>
                  <Select
                    value={slot.ideaId ?? "none"}
                    disabled={isAccepted}
                    onValueChange={(value) => {
                      if (!view.shape) return;
                      void linkSlotIdea({
                        shapeId: view.shape._id as never,
                        slotId: slot._id as never,
                        ideaId: value === "none" ? undefined : (value as never),
                      });
                    }}
                  >
                    <SelectTrigger className="w-full text-xs" aria-label={`Linked idea for slot ${slot.seq}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— none (incomplete) —</SelectItem>
                      {view.workingSet.map((entry) =>
                        entry.idea ? (
                          <SelectItem key={entry.idea._id} value={entry.idea._id}>
                            {entry.idea.flavor ? `${entry.idea.flavor}: ` : ""}
                            {entry.idea.text.slice(0, 46)}…
                          </SelectItem>
                        ) : null
                      )}
                    </SelectContent>
                  </Select>
                  {linkedIdea ? (
                    <span className={cn("text-[11px] leading-snug", tokens.textMuted)}>
                      membership is one-way — it stays in the working set.
                    </span>
                  ) : null}
                </aside>
              </div>
            );
          })}
      </div>

      <div className="sticky bottom-0 mt-4 flex items-center justify-end gap-3 border-t bg-white/95 px-1 py-3 backdrop-blur" style={{ borderColor: "rgba(0,0,0,0.08)" }}>
        <span className={cn("mr-auto text-sm", tokens.textMuted)} data-testid="accept-hint">
          {isAccepted ? (
            <>
              Shape accepted — {slots.length} slots in publishing sequence. Dates
              stay on the calendar.
            </>
          ) : incomplete > 0 ? (
            <>
              <b className="text-[#78290f]">{incomplete} slot{incomplete > 1 ? "s" : ""} incomplete</b>{" "}
              — every slot needs a linked idea before the shape can be accepted.
            </>
          ) : (
            <>
              All slots linked. Accepting saves the durable plan — nothing is
              materialized yet.
            </>
          )}
        </span>
        {isAccepted ? (
          <Button variant="primary" asChild>
            <Link href={`/campaigns/${campaignId}/drafts`}>Go to draft set</Link>
          </Button>
        ) : (
          <Button
            variant="primary"
            disabled={incomplete > 0 || !view.shape}
            onClick={() => void handleAccept()}
            data-testid="accept-shape"
          >
            Accept shape
          </Button>
        )}
      </div>

      {toast ? (
        <div
          role="status"
          className="fixed bottom-16 right-6 z-50 max-w-sm rounded-lg bg-[#001524] px-4 py-3 text-sm text-[#ffecd1] shadow-lg"
          data-testid="shape-toast"
        >
          {toast}
        </div>
      ) : null}
    </main>
  );
}
