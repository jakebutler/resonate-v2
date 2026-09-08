"use client";

import { useRef, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ExcerptReviewList, type ReviewedExcerpt } from "@/components/campaigns/ExcerptReviewList";
import { tokens } from "@/components/shell/tokens";
import { cn } from "@/lib/utils";
import type { BrandId } from "@/lib/domain";

type IngestSourceTab = "upload" | "paste" | "link";

type ExcerptResponse = {
  text: string;
  provenance: string;
  unusable: boolean;
  unusableReason?: string;
  sensitivity?: string;
};

type IngestDocumentResponse = {
  name: string;
  kind: "md" | "txt" | "json" | "csv" | "pdf";
  meta?: Record<string, unknown>;
  excerpts: ExcerptResponse[];
};

type IngestResponse = {
  documents: IngestDocumentResponse[];
  excerptCount: number;
};

type SaveResult = {
  corpusId: string;
  version: number;
  excerptCount: number;
};

type SensitivityValue = "unreviewed" | "internal-only" | "public-safe";

/** Pre-save excerpt with its source document, so save-time grouping survives split/merge. */
type EditedExcerpt = ReviewedExcerpt & { documentIndex: number };

function sameExcerpt(a: ReviewedExcerpt, b: ReviewedExcerpt): boolean {
  return (
    a.text === b.text && a.provenance === b.provenance && a.unusable === b.unusable
  );
}

/**
 * D-16: split/merge replaces a run of rows in place. Prefix/suffix rows map
 * 1:1; replacement rows inherit the source run's document.
 */
function remapDocumentIndexes(
  oldList: EditedExcerpt[],
  next: ReviewedExcerpt[]
): EditedExcerpt[] {
  let prefix = 0;
  while (
    prefix < oldList.length &&
    prefix < next.length &&
    sameExcerpt(oldList[prefix], next[prefix])
  ) {
    prefix += 1;
  }
  let suffix = 0;
  while (
    suffix < oldList.length - prefix &&
    suffix < next.length - prefix &&
    sameExcerpt(oldList[oldList.length - 1 - suffix], next[next.length - 1 - suffix])
  ) {
    suffix += 1;
  }
  const inheritedIndex = oldList[prefix]?.documentIndex ?? 0;
  return next.map((excerpt, index) => {
    if (index < prefix) {
      return { ...excerpt, documentIndex: oldList[index].documentIndex };
    }
    if (index >= next.length - suffix) {
      const oldIndex = oldList.length - (next.length - index);
      return { ...excerpt, documentIndex: oldList[oldIndex].documentIndex };
    }
    return { ...excerpt, documentIndex: inheritedIndex };
  });
}

const SENSITIVITY_VALUES: SensitivityValue[] = [
  "unreviewed",
  "internal-only",
  "public-safe",
];

type IngestDocumentFlowProps = {
  brandId: BrandId;
  nextVersion: number;
  onSaved: (result: SaveResult) => void;
};

export function IngestDocumentFlow({
  brandId,
  nextVersion,
  onSaved,
}: IngestDocumentFlowProps) {
  const [tab, setTab] = useState<IngestSourceTab>("upload");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [review, setReview] = useState<IngestResponse | null>(null);
  const [editedExcerpts, setEditedExcerpts] = useState<EditedExcerpt[]>([]);
  const [selectedIndexes, setSelectedIndexes] = useState<number[]>([]);
  const [sensitivityByIndex, setSensitivityByIndex] = useState<
    Record<number, SensitivityValue>
  >({});
  const [pasteText, setPasteText] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function applyReview(payload: IngestResponse) {
    setReview(payload);
    setEditedExcerpts(
      payload.documents.flatMap((document, documentIndex) =>
        document.excerpts.map((excerpt) => ({
          documentIndex,
          text: excerpt.text,
          provenance: excerpt.provenance,
          unusable: excerpt.unusable,
          unusableReason: excerpt.unusableReason,
        }))
      )
    );
    setSelectedIndexes([]);
    setSensitivityByIndex({});
  }

  function resetReview() {
    setReview(null);
    setEditedExcerpts([]);
    setSelectedIndexes([]);
    setSensitivityByIndex({});
  }

  const createCorpusVersion = useMutation(api.corpora.createCorpusVersion);

  async function handleUpload(file: File) {
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.set("file", file);
      const response = await fetch("/api/campaigns/ingest-document", {
        method: "POST",
        body: form,
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "Extraction failed.");
      }
      applyReview(payload as IngestResponse);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Extraction failed.");
    } finally {
      setBusy(false);
    }
  }

  async function handlePaste() {
    if (!pasteText.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/campaigns/ingest-document", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: pasteText }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "Extraction failed.");
      }
      applyReview(payload as IngestResponse);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Extraction failed.");
    } finally {
      setBusy(false);
    }
  }

  async function handleLink() {
    if (!linkUrl.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/campaigns/ingest-document", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: linkUrl }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "Extraction failed.");
      }
      applyReview(payload as IngestResponse);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Extraction failed.");
    } finally {
      setBusy(false);
    }
  }

  async function handleSave() {
    if (!review) return;
    setSaving(true);
    setError(null);
    try {
      const selectedByDocument = new Map<
        IngestDocumentResponse,
        { text: string; provenance: string; sensitivity?: SensitivityValue }[]
      >();
      for (const index of selectedIndexes) {
        const entry = editedExcerpts[index];
        if (!entry || entry.unusable) continue;
        const document = review.documents[entry.documentIndex];
        if (!document) continue;
        const list = selectedByDocument.get(document) ?? [];
        const chosen = sensitivityByIndex[index];
        list.push({
          text: entry.text,
          provenance: entry.provenance,
          // Persist the operator's per-excerpt sensitivity decision (D-17).
          sensitivity: SENSITIVITY_VALUES.includes(chosen) ? chosen : "unreviewed",
        });
        selectedByDocument.set(document, list);
      }

      const documents = [...selectedByDocument.entries()].map(
        ([document, excerpts]) => ({
          name: document.name,
          kind: document.kind,
          meta: document.meta,
          excerpts,
        })
      );

      const usableCount = documents.reduce(
        (total, document) => total + document.excerpts.length,
        0
      );
      if (usableCount === 0) {
        throw new Error("Select at least one usable excerpt.");
      }

      const result = await createCorpusVersion({
        brandId,
        origin: "upload",
        documents,
      });
      onSaved(result);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  if (review) {
    return (
      <div data-testid="excerpt-review">
        <div className={cn(tokens.panel, "overflow-hidden")}>
          <ExcerptReviewList
            brandId={brandId}
            documentName={review.documents[0]?.name ?? "document"}
            excerpts={editedExcerpts}
            onSelectionChange={setSelectedIndexes}
            onSensitivityChange={setSensitivityByIndex}
            // D-16: split/merge is a pre-save edit — corpus versions stay
            // immutable once saved.
            editable
            onExcerptsChange={(next) =>
              setEditedExcerpts(remapDocumentIndexes(editedExcerpts, next))
            }
          />
        </div>
        {error ? (
          <p className="mt-3 text-sm font-semibold text-red-700" role="alert">
            {error}
          </p>
        ) : null}
        <div className="mt-4 flex items-center justify-end gap-3">
          <Button variant="ghost" onClick={resetReview}>
            Back
          </Button>
          <Button
            variant="primary"
            onClick={handleSave}
            disabled={saving || selectedIndexes.length === 0}
            data-testid="save-corpus"
          >
            Save to {brandId === "corvo" ? "Corvo Labs" : brandId} corpus
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={cn(tokens.panel, "p-4")} data-testid="ingest-document-flow">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {(
          [
            { key: "upload", label: "Upload file" },
            { key: "paste", label: "Paste text" },
            { key: "link", label: "Link (https)" },
          ] as const
        ).map((option) => (
          <button
            key={option.key}
            type="button"
            onClick={() => setTab(option.key)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs transition-colors",
              tab === option.key ? tokens.pillActive : tokens.pillIdle,
              "border"
            )}
          >
            {option.label}
          </button>
        ))}
        <span className={cn("ml-auto text-xs", tokens.textMuted)}>
          One ingest becomes one immutable corpus version (v{nextVersion}).
        </span>
      </div>

      {tab === "upload" ? (
        <div
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            const file = event.dataTransfer.files?.[0];
            if (file) void handleUpload(file);
          }}
          className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-10 text-center"
          data-testid="upload-dropzone"
        >
          <p className="text-sm font-medium">Drop a paper here</p>
          <p className={cn("text-xs", tokens.textMuted)}>
            PDF, markdown, txt, json, or csv · up to 15 MB
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.md,.markdown,.txt,.json,.csv"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void handleUpload(file);
              event.target.value = "";
            }}
          />
          <Button
            variant="accent"
            size="sm"
            disabled={busy}
            onClick={() => fileInputRef.current?.click()}
            data-testid="choose-file"
          >
            {busy ? "Extracting…" : "Choose a file"}
          </Button>
        </div>
      ) : null}

      {tab === "paste" ? (
        <div className="space-y-2">
          <Textarea
            rows={8}
            placeholder="Paste the source text — it will be segmented into excerpt candidates."
            value={pasteText}
            onChange={(event) => setPasteText(event.target.value)}
          />
          <Button
            variant="accent"
            size="sm"
            disabled={busy || !pasteText.trim()}
            onClick={handlePaste}
          >
            {busy ? "Extracting…" : "Extract excerpts"}
          </Button>
        </div>
      ) : null}

      {tab === "link" ? (
        <div className="space-y-2">
          <Input
            type="url"
            placeholder="https://arxiv.org/pdf/2210.03629"
            value={linkUrl}
            onChange={(event) => setLinkUrl(event.target.value)}
          />
          <Button
            variant="accent"
            size="sm"
            disabled={busy || !linkUrl.trim()}
            onClick={handleLink}
          >
            {busy ? "Fetching…" : "Fetch and extract"}
          </Button>
        </div>
      ) : null}

      {error && !review ? (
        <p className="mt-3 text-sm font-semibold text-red-700" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
