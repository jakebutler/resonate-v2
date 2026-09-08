"use client";

import { useMemo, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { tokens } from "@/components/shell/tokens";
import { cn } from "@/lib/utils";
import type { BrandId } from "@/lib/domain";

export type ReviewedExcerpt = {
  text: string;
  provenance: string;
  unusable: boolean;
  unusableReason?: string;
};

type ExcerptReviewListProps = {
  brandId: BrandId;
  documentName: string;
  excerpts: ReviewedExcerpt[];
  onSelectionChange?: (selectedIndexes: number[]) => void;
  onSensitivityChange?: (
    sensitivityByIndex: Record<number, "unreviewed" | "internal-only" | "public-safe">
  ) => void;
  onCorrectionsRecorded?: () => void;
  /**
   * D-16: enables pre-save split/merge. Only the ingest review surface sets
   * this — saved corpus versions are immutable, so post-save review surfaces
   * must never offer it.
   */
  editable?: boolean;
  onExcerptsChange?: (next: ReviewedExcerpt[]) => void;
};

const SENSITIVITY_OPTIONS = [
  { value: "unreviewed", label: "unreviewed", tint: "bg-[#fdf6e3] text-[#8a6d00]" },
  { value: "internal-only", label: "internal-only", tint: "bg-[#fde5ee] text-[#a11441]" },
  { value: "public-safe", label: "public-safe", tint: "bg-[#e2f2e6] text-[#1d5c31]" },
] as const;

export function ExcerptReviewList({
  brandId,
  documentName,
  excerpts,
  onSelectionChange,
  onSensitivityChange,
  onCorrectionsRecorded,
  editable = false,
  onExcerptsChange,
}: ExcerptReviewListProps) {
  const [checked, setChecked] = useState<Set<number>>(
    () =>
      new Set(
        excerpts
          .map((_, index) => index)
          .filter((index) => !excerpts[index].unusable)
      )
  );
  const [sensitivity, setSensitivity] = useState<
    Record<number, "unreviewed" | "internal-only" | "public-safe">
  >({});
  const [flagOpen, setFlagOpen] = useState<Set<number>>(() => new Set());
  const [corrections, setCorrections] = useState<Record<number, string>>({});
  const [captured, setCaptured] = useState<Set<number>>(() => new Set());
  const [splitIndex, setSplitIndex] = useState<number | null>(null);
  const [splitDraft, setSplitDraft] = useState("");
  const [mergeError, setMergeError] = useState<string | null>(null);
  const recordCorrection = useMutation(api.corpora.recordExcerptCorrection);

  const selected = useMemo(() => [...checked], [checked]);

  /**
   * Replaces a run of rows with new ones and remaps every index-keyed state
   * (selection, sensitivity, correction flags) so nothing silently attaches
   * to the wrong excerpt. The first replacement inherits the first replaced
   * row's sensitivity; new rows default to checked when usable.
   */
  function commitExcerptEdit(
    start: number,
    removeCount: number,
    replacements: ReviewedExcerpt[]
  ) {
    const next = [
      ...excerpts.slice(0, start),
      ...replacements,
      ...excerpts.slice(start + removeCount),
    ];
    onExcerptsChange?.(next);

    const nextChecked = new Set<number>();
    const nextSensitivity: Record<number, "unreviewed" | "internal-only" | "public-safe"> = {};
    const nextCaptured = new Set<number>();
    const nextFlagOpen = new Set<number>();
    for (let index = 0; index < start; index += 1) {
      if (checked.has(index)) nextChecked.add(index);
      if (sensitivity[index]) nextSensitivity[index] = sensitivity[index];
      if (captured.has(index)) nextCaptured.add(index);
      if (flagOpen.has(index)) nextFlagOpen.add(index);
    }
    replacements.forEach((replacement, offset) => {
      if (!replacement.unusable) nextChecked.add(start + offset);
    });
    if (sensitivity[start] !== undefined && replacements[0] !== undefined) {
      nextSensitivity[start] = sensitivity[start];
    }
    const shift = replacements.length - removeCount;
    for (let index = start + removeCount; index < excerpts.length; index += 1) {
      const target = index + shift;
      if (checked.has(index)) nextChecked.add(target);
      if (sensitivity[index]) nextSensitivity[target] = sensitivity[index];
      if (captured.has(index)) nextCaptured.add(target);
      if (flagOpen.has(index)) nextFlagOpen.add(target);
    }
    setChecked(nextChecked);
    setSensitivity(nextSensitivity);
    setCaptured(nextCaptured);
    setFlagOpen(nextFlagOpen);
    setSplitIndex(null);
    setSplitDraft("");
    setMergeError(null);
    onSelectionChange?.([...nextChecked]);
    onSensitivityChange?.(nextSensitivity);
  }

  const splitParts = useMemo(
    () =>
      splitDraft
        .split(/\n\s*\n/)
        .map((part) => part.trim())
        .filter(Boolean),
    [splitDraft]
  );

  function confirmSplit() {
    if (splitIndex === null || splitParts.length < 2) return;
    const source = excerpts[splitIndex];
    commitExcerptEdit(
      splitIndex,
      1,
      splitParts.map((part) => ({
        text: part,
        provenance: source.provenance,
        unusable: false,
      }))
    );
  }

  /**
   * Merge works on the currently checked rows, but only when they are
   * consecutive — a merge across a gap would silently swallow an excluded
   * excerpt the operator deliberately left out.
   */
  function mergeSelected() {
    if (selected.length < 2) return;
    const sorted = [...selected].sort((a, b) => a - b);
    const contiguous = sorted.every(
      (index, position) => position === 0 || index === sorted[position - 1] + 1
    );
    if (!contiguous) {
      setMergeError("Select consecutive excerpts to merge — gaps would swallow excerpts you left out.");
      return;
    }
    const first = excerpts[sorted[0]];
    commitExcerptEdit(
      sorted[0],
      sorted.length,
      [
        {
          text: sorted.map((index) => excerpts[index].text).join("\n\n"),
          provenance: first.provenance,
          unusable: false,
        },
      ]
    );
  }

  function reportSelection(next: Set<number>) {
    setChecked(next);
    onSelectionChange?.([...next]);
  }

  function toggle(index: number, next: boolean) {
    reportSelection((() => {
      const updated = new Set(checked);
      if (next) updated.add(index);
      else updated.delete(index);
      return updated;
    })());
  }

  function toggleFlag(index: number) {
    setFlagOpen((previous) => {
      const updated = new Set(previous);
      if (updated.has(index)) updated.delete(index);
      else updated.add(index);
      return updated;
    });
  }

  async function captureCorrection(index: number) {
    await recordCorrection({
      brandId,
      documentName,
      excerptPreview: excerpts[index].text,
      correction: corrections[index] ?? "",
    });
    setCaptured((previous) => new Set(previous).add(index));
    setFlagOpen((previous) => {
      const updated = new Set(previous);
      updated.delete(index);
      return updated;
    });
    onCorrectionsRecorded?.();
  }

  return (
    <div>
      <div
        className={cn(
          "flex items-center justify-between px-4 py-3 text-sm",
          tokens.textMuted
        )}
      >
        <span className="font-semibold text-[13px] uppercase tracking-wide">
          Imported excerpts
        </span>
        <span
          className={cn(
            "rounded-full px-2.5 py-0.5 text-xs font-normal",
            tokens.accentBg,
            tokens.accent
          )}
        >
          {brandId === "corvo" ? "Corvo Labs" : brandId} corpus · brand-scoped
        </span>
      </div>
      <p className={cn("px-4 pb-2 text-xs", tokens.textMuted)}>
        Review all excerpts. Only checked items are saved.
      </p>
      <div>
        {excerpts.map((excerpt, index) => {
          const isEnabled = checked.has(index);
          return (
            <div
              key={index}
              data-excerpt={index}
              className={cn(
                "flex gap-3 border-t px-4 py-3.5",
                tokens.border,
                excerpt.unusable && "bg-[#fdf3f0]"
              )}
            >
              <input
                type="checkbox"
                aria-label={`Include excerpt ${index + 1}`}
                checked={isEnabled}
                disabled={excerpt.unusable}
                onChange={(event) => toggle(index, event.target.checked)}
                className="mt-1 h-4 w-4 accent-[#15616d]"
              />
              <div className="min-w-0 flex-1">
                <div className="mb-1.5 flex flex-wrap items-baseline gap-2">
                  <span className="text-sm font-semibold">#{index + 1}</span>
                  <span className={cn("text-xs", tokens.textMuted)}>
                    {excerpt.provenance}
                  </span>
                  {excerpt.unusable ? (
                    <span className="rounded-md bg-[#fde8e2] px-2 py-0.5 text-[11px] font-normal text-[#78290f]">
                      unusable extract
                    </span>
                  ) : null}
                </div>
                <p
                  className={cn(
                    "text-sm leading-relaxed",
                    excerpt.unusable && "text-[#5c2a1a]"
                  )}
                >
                  {excerpt.text}
                </p>
                {excerpt.unusable && excerpt.unusableReason ? (
                  <p className={cn("mt-1 text-xs", tokens.textMuted)}>
                    {excerpt.unusableReason}
                  </p>
                ) : null}
                <div className="mt-2.5 flex flex-wrap items-center gap-3">
                  <span className={cn("flex items-center gap-2 text-xs", tokens.textMuted)}>
                    Sensitivity
                    <span className={cn(!isEnabled && "pointer-events-none opacity-45")}>
                      <Select
                        value={sensitivity[index] ?? "unreviewed"}
                        onValueChange={(value) => {
                          const chosen = value as
                            | "unreviewed"
                            | "internal-only"
                            | "public-safe";
                          setSensitivity((previous) => {
                            const next = { ...previous, [index]: chosen };
                            onSensitivityChange?.(next);
                            return next;
                          });
                        }}
                      >
                        <SelectTrigger className="h-7 w-36 text-xs" aria-label={`Sensitivity for excerpt ${index + 1}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {SENSITIVITY_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </span>
                  </span>
                  {excerpt.unusable ? (
                    captured.has(index) ? (
                      <span
                        className={cn(
                          "rounded-md px-2 py-0.5 text-[11px] font-normal",
                          tokens.accentBg,
                          tokens.accent
                        )}
                      >
                        correction captured
                      </span>
                    ) : (
                      <Button
                        variant="secondary"
                        size="xs"
                        onClick={() => toggleFlag(index)}
                      >
                        Flag &amp; fix
                      </Button>
                    )
                  ) : editable ? (
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={() => {
                        setSplitIndex(splitIndex === index ? null : index);
                        setSplitDraft(excerpt.text);
                        setMergeError(null);
                      }}
                      aria-expanded={splitIndex === index}
                    >
                      Split
                    </Button>
                  ) : null}
                </div>
                {editable && splitIndex === index ? (
                  <div className="mt-2.5 rounded-lg border border-dashed p-3" style={{ borderColor: "rgba(0,0,0,0.15)" }}>
                    <p className={cn("text-xs", tokens.textMuted)}>
                      Put a blank line where one excerpt ends and the next
                      begins. All parts inherit this provenance.
                    </p>
                    <Textarea
                      rows={4}
                      className="mt-2 text-sm"
                      aria-label={`Split editor for excerpt ${index + 1}`}
                      value={splitDraft}
                      onChange={(event) => setSplitDraft(event.target.value)}
                    />
                    <div className="mt-2 flex items-center gap-2">
                      <Button
                        size="xs"
                        disabled={splitParts.length < 2}
                        onClick={confirmSplit}
                      >
                        {splitParts.length < 2
                          ? "Split (needs a blank line)"
                          : `Split into ${splitParts.length} excerpts`}
                      </Button>
                      <Button
                        variant="ghost"
                        size="xs"
                        onClick={() => {
                          setSplitIndex(null);
                          setSplitDraft("");
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : null}
                {excerpt.unusable && flagOpen.has(index) ? (
                  <div className="mt-2.5 rounded-lg border border-dashed p-3" style={{ borderColor: "rgba(0,0,0,0.15)" }}>
                    <p className={cn("text-xs", tokens.textMuted)}>
                      Hard-blocked from saving. Captured corrections become parser
                      feedback — the extract itself is never silently saved.
                    </p>
                    <Textarea
                      rows={2}
                      className="mt-2 text-sm"
                      placeholder="What should this be? e.g. 'This is Table 2 — success rates by task. Column headers lost in extraction.'"
                      value={corrections[index] ?? ""}
                      onChange={(event) =>
                        setCorrections((previous) => ({
                          ...previous,
                          [index]: event.target.value,
                        }))
                      }
                    />
                    <div className="mt-2 flex gap-2">
                      <Button
                        size="xs"
                        disabled={!(corrections[index] ?? "").trim()}
                        onClick={() => captureCorrection(index)}
                      >
                        Capture correction &amp; keep blocked
                      </Button>
                      <Button
                        variant="ghost"
                        size="xs"
                        onClick={() => toggleFlag(index)}
                      >
                        Close
                      </Button>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
      <div className={cn("flex flex-wrap items-center gap-3 px-4 py-3 text-xs font-semibold", tokens.textMuted)} data-testid="excerpt-selection-count">
        <span>
          {selected.length} excerpt{selected.length === 1 ? "" : "s"} selected —
          saving creates an immutable corpus version.
        </span>
        {editable ? (
          <>
            <Button
              variant="secondary"
              size="xs"
              disabled={selected.length < 2}
              onClick={mergeSelected}
              data-testid="merge-selected"
            >
              Merge selected
            </Button>
            {mergeError ? (
              <span className="font-normal text-[#a11441]" role="alert">
                {mergeError}
              </span>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}
