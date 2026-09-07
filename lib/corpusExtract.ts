export type ExcerptCandidate = {
  text: string;
  provenance: string;
  unusable: boolean;
  unusableReason?: string;
};

export type DocumentKind = "md" | "txt" | "json" | "csv" | "pdf";

const MIN_EXCERPT_CHARS = 80;
const MAX_EXCERPT_CHARS = 900;
const TARGET_EXCERPT_CHARS = 480;

function looksLikeMangledTable(block: string): boolean {
  const lines = block.split("\n").filter((line) => line.trim().length > 0);
  if (lines.length === 0) return false;
  const numericTableLines = lines.filter((line) => {
    const digits = (line.match(/\d/g) ?? []).length;
    const separators = (line.match(/[|═║─+=]/g) ?? []).length;
    const letters = (line.match(/[a-zA-Z]{4,}/g) ?? []).length;
    return digits + separators >= 6 && letters <= 2;
  }).length;
  const nanArtifacts = (block.match(/\bNaN\b|\bundefined\b|\[ARTIFACT\]/g) ?? [])
    .length;
  if (nanArtifacts >= 2) return true;
  if (numericTableLines === 0) return false;
  return numericTableLines / lines.length >= 0.5;
}

function looksLikeGarbled(block: string): boolean {
  const words = block.match(/[a-zA-Z]+/g) ?? [];
  if (words.length < 8) return true;
  const shortFragments = words.filter((word) => word.length <= 2).length;
  return shortFragments / words.length > 0.5;
}

export function isUnusableExtract(
  block: string
): { unusable: boolean; reason?: string } {
  if (!block.trim()) return { unusable: true, reason: "empty block" };
  if (looksLikeMangledTable(block)) {
    return {
      unusable: true,
      reason: "mangled numeric table — column semantics lost in extraction",
    };
  }
  if (looksLikeGarbled(block)) {
    return { unusable: true, reason: "garbled text — not a semantic unit" };
  }
  return { unusable: false };
}

function splitIntoBlocks(text: string): string[] {
  const normalized = text.replace(/\r\n/g, "\n");
  const blocks = normalized
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);
  return blocks.flatMap((block) => {
    if (block.length <= MAX_EXCERPT_CHARS) return [block];
    return splitLongBlock(block);
  });
}

function splitLongBlock(block: string): string[] {
  const sentences = block.match(/[^.!?\n]+[.!?]?/g) ?? [block];
  const chunks: string[] = [];
  let current = "";
  for (const sentence of sentences) {
    if (
      current &&
      current.length + sentence.length > TARGET_EXCERPT_CHARS &&
      current.length >= MIN_EXCERPT_CHARS
    ) {
      chunks.push(current.trim());
      current = sentence;
    } else {
      current += (current ? " " : "") + sentence;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks.filter(Boolean);
}

function mergeShortBlocks(blocks: string[]): string[] {
  const merged: string[] = [];
  for (const block of blocks) {
    const previous = merged[merged.length - 1];
    if (
      previous &&
      previous.length < MIN_EXCERPT_CHARS &&
      previous.length + block.length + 1 <= MAX_EXCERPT_CHARS
    ) {
      merged[merged.length - 1] = `${previous}\n${block}`;
    } else {
      merged.push(block);
    }
  }
  return merged;
}

export function segmentPdfPages(pages: string[]): ExcerptCandidate[] {
  const candidates: ExcerptCandidate[] = [];
  pages.forEach((pageText, pageIndex) => {
    const blocks = mergeShortBlocks(splitIntoBlocks(pageText));
    for (const block of blocks) {
      const verdict = isUnusableExtract(block);
      candidates.push({
        text: block.replace(/\s+\n/g, "\n"),
        provenance: `p.${pageIndex + 1}`,
        unusable: verdict.unusable,
        unusableReason: verdict.reason,
      });
    }
  });
  return candidates;
}

function stripMarkdownDecorations(block: string): string {
  return block
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .trim();
}

export function segmentMarkdown(
  text: string,
  frontMatterProvenance?: string
): ExcerptCandidate[] {
  const blocks = mergeShortBlocks(splitIntoBlocks(text));
  const candidates: ExcerptCandidate[] = [];
  for (const block of blocks) {
    const verdict = isUnusableExtract(stripMarkdownDecorations(block));
    const heading = block.match(/^#{1,6}\s+(.+)$/m)?.[1];
    const provenanceParts = [frontMatterProvenance, heading].filter(Boolean);
    candidates.push({
      text: stripMarkdownDecorations(block),
      provenance:
        provenanceParts.length > 0
          ? provenanceParts.join(" · ")
          : "document text",
      unusable: verdict.unusable,
      unusableReason: verdict.reason,
    });
  }
  return candidates;
}

export function segmentPlainText(
  text: string,
  provenanceLabel = "document text"
): ExcerptCandidate[] {
  const blocks = mergeShortBlocks(splitIntoBlocks(text));
  return blocks.map((block) => {
    const verdict = isUnusableExtract(block);
    return {
      text: block,
      provenance: provenanceLabel,
      unusable: verdict.unusable,
      unusableReason: verdict.reason,
    };
  });
}

export function segmentCsv(text: string, name: string): ExcerptCandidate[] {
  const lines = text.replace(/\r\n/g, "\n").split("\n").filter(Boolean);
  if (lines.length === 0) {
    return [
      {
        text: "",
        provenance: name,
        unusable: true,
        unusableReason: "empty file",
      },
    ];
  }
  const header = lines[0];
  const rows = lines.slice(1);
  const summary = `${name}: ${rows.length} data rows — columns: ${header}.`;
  const verdict = isUnusableExtract(summary);
  return [
    {
      text: summary,
      provenance: name,
      unusable: verdict.unusable,
      unusableReason: verdict.reason,
    },
  ];
}

export function segmentJson(text: string, name: string): ExcerptCandidate[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return [
      {
        text: "",
        provenance: name,
        unusable: true,
        unusableReason: "invalid JSON — cannot segment",
      },
    ];
  }
  if (Array.isArray(parsed)) {
    return [
      {
        text: `${name}: structured index with ${parsed.length} entries.`,
        provenance: name,
        unusable: false,
      },
    ];
  }
  if (parsed && typeof parsed === "object") {
    const keys = Object.keys(parsed as Record<string, unknown>);
    return [
      {
        text: `${name}: structured record with fields ${keys.join(", ")}.`,
        provenance: name,
        unusable: false,
      },
    ];
  }
  return segmentPlainText(String(parsed), name);
}

export function kindForFileName(name: string): DocumentKind | null {
  const lower = name.toLowerCase();
  if (lower.endsWith(".pdf")) return "pdf";
  if (lower.endsWith(".md") || lower.endsWith(".markdown")) return "md";
  if (lower.endsWith(".txt")) return "txt";
  if (lower.endsWith(".json")) return "json";
  if (lower.endsWith(".csv")) return "csv";
  return null;
}

export function segmentDocument(input: {
  name: string;
  kind: DocumentKind;
  text: string;
  pages?: string[];
}): ExcerptCandidate[] {
  if (input.kind === "pdf") {
    return input.pages
      ? segmentPdfPages(input.pages)
      : segmentPlainText(input.text, input.name);
  }
  if (input.kind === "md") {
    return segmentMarkdown(input.text);
  }
  if (input.kind === "json") {
    return segmentJson(input.text, input.name);
  }
  if (input.kind === "csv") {
    return segmentCsv(input.text, input.name);
  }
  return segmentPlainText(input.text, input.name);
}
