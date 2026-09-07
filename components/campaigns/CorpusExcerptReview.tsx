"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { tokens } from "@/components/shell/tokens";
import { cn } from "@/lib/utils";
import type { BrandId } from "@/lib/domain";

type CorpusDetail = {
  corpus: { _id: string; version: number; brandId: string };
  documents: { _id: string; name: string; kind: string }[];
  excerpts: {
    _id: string;
    seq: number;
    text: string;
    provenance: string;
    sensitivity: string;
    reviewState: string;
  }[];
} | null | undefined;

type CorpusExcerptReviewProps = {
  brandId: BrandId;
  corpusId: string;
};

const SENSITIVITY_TINTS: Record<string, string> = {
  unreviewed: "bg-[#fdf6e3] text-[#8a6d00]",
  "internal-only": "bg-[#fde5ee] text-[#a11441]",
  "public-safe": "bg-[#e2f2e6] text-[#1d5c31]",
};

export function CorpusExcerptReview({
  brandId,
  corpusId,
}: CorpusExcerptReviewProps) {
  void brandId;
  const detail = useQuery(api.corpora.getCorpus, {
    corpusId: corpusId as never,
  }) as CorpusDetail;
  const updateExcerptReview = useMutation(api.corpora.updateExcerptReview);

  if (detail === undefined) {
    return <p className={cn("px-4 py-3 text-xs", tokens.textMuted)}>Loading excerpts…</p>;
  }
  if (detail === null) {
    return <p className={cn("px-4 py-3 text-xs", tokens.textMuted)}>Corpus unavailable.</p>;
  }

  return (
    <div data-testid="corpus-excerpt-review">
      <p className={cn("px-4 py-2 text-[11px] leading-relaxed", tokens.textMuted)}>
        Post-import excerpt review — sensitivity is editable and excluded
        excerpts are not offered as citations. The version&apos;s content is
        immutable; review state is metadata.
      </p>
      <div>
        {detail.excerpts.map((excerpt) => (
          <div
            key={excerpt._id}
            className={cn(
              "border-t px-4 py-2.5",
              tokens.border,
              excerpt.reviewState === "excluded" && "opacity-50"
            )}
          >
            <div className="mb-1 flex flex-wrap items-baseline gap-2">
              <span className="text-[13px] font-semibold">#{excerpt.seq}</span>
              <span className={cn("text-[11px]", tokens.textMuted)}>{excerpt.provenance}</span>
              <div className="ml-auto flex items-center gap-2">
                <Select
                  value={excerpt.sensitivity}
                  onValueChange={(value) => {
                    void updateExcerptReview({
                      excerptId: excerpt._id as never,
                      sensitivity: value as never,
                    });
                  }}
                >
                  <SelectTrigger className={cn("h-6 w-32 border-0 text-[11px]", SENSITIVITY_TINTS[excerpt.sensitivity])} aria-label={`Sensitivity for excerpt ${excerpt.seq}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unreviewed">unreviewed</SelectItem>
                    <SelectItem value="internal-only">internal-only</SelectItem>
                    <SelectItem value="public-safe">public-safe</SelectItem>
                  </SelectContent>
                </Select>
                <label className="flex items-center gap-1.5 text-[11px]" >
                  <input
                    type="checkbox"
                    aria-label={`Include excerpt ${excerpt.seq}`}
                    checked={excerpt.reviewState !== "excluded"}
                    onChange={(event) => {
                      void updateExcerptReview({
                        excerptId: excerpt._id as never,
                        reviewState: event.target.checked ? "accepted" : "excluded",
                      });
                    }}
                    className="h-3.5 w-3.5 accent-[#15616d]"
                  />
                  included
                </label>
              </div>
            </div>
            <p className={cn("line-clamp-2 text-[13px]", tokens.textMuted)}>{excerpt.text}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
