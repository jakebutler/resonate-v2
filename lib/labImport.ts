import { isUnusableExtract, segmentDocument, type DocumentKind, kindForFileName } from "@/lib/corpusExtract";

export type SecretFinding = {
  kind: string;
  line: number;
  preview: string;
};

/**
 * Authoritative secret patterns — the CLI script mirrors these fail-fast locally.
 * Keyword anchors use `(?<![A-Za-z0-9])` instead of `\b`: `_` is a word
 * character, so `\b` never matches inside names like OPENAI_API_KEY or
 * AWS_SECRET_ACCESS_KEY — the most common real-world shapes. Prefixed
 * credential literals (sk-, ghp_, xox-…) match the value itself, independent
 * of any variable name. False positives are acceptable; false negatives are
 * not (D-18 hard-fails the import).
 */
export const SECRET_PATTERNS: { kind: string; pattern: RegExp }[] = [
  { kind: "private key block", pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { kind: "openai api key", pattern: /(?<![A-Za-z0-9])sk-[A-Za-z0-9_-]{16,}/ },
  { kind: "github token", pattern: /(?<![A-Za-z0-9])gh[pousr]_[A-Za-z0-9]{16,}/ },
  { kind: "slack token", pattern: /(?<![A-Za-z0-9])xox[baprs]-[A-Za-z0-9-]{10,}/ },
  { kind: "google api key", pattern: /(?<![A-Za-z0-9])AIza[0-9A-Za-z_-]{30,}/ },
  {
    kind: "jwt",
    pattern: /(?<![A-Za-z0-9])eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}/,
  },
  {
    kind: "url credentials",
    pattern: /\b[a-z][a-z0-9+.-]*:\/\/[^\s:@/]*:[^\s@/]*@/,
  },
  {
    kind: "api key assignment",
    pattern: /(?<![A-Za-z0-9])(api[_-]?key|apikey)(?![A-Za-z0-9])\s*[:=]\s*["']?[A-Za-z0-9_\-]{12,}/i,
  },
  { kind: "bearer token", pattern: /(?<![A-Za-z0-9])Bearer\s+[A-Za-z0-9_\-\.]{16,}/ },
  { kind: "aws access key", pattern: /(?<![A-Za-z0-9])AKIA[0-9A-Z]{16}(?![0-9A-Z])/ },
  {
    kind: "password assignment",
    pattern: /(?<![A-Za-z0-9])(password|passwd|pwd)(?![A-Za-z0-9])\s*[:=]\s*["']?[^\s"']{6,}/i,
  },
  {
    kind: "aws secret key assignment",
    pattern: /(?<![A-Za-z0-9])(aws[_-]?)?secret[_-]?access[_-]?key(?![A-Za-z0-9])\s*[:=]\s*["']?[A-Za-z0-9/+=]{16,}/i,
  },
  {
    kind: "generic secret assignment",
    pattern: /(?<![A-Za-z0-9])(secret|token)(?![A-Za-z0-9])\s*[:=]\s*["']?[A-Za-z0-9_\-]{16,}/i,
  },
];

/**
 * Secret scan for the lab journey (D-18): any finding hard-fails the import.
 * Findings carry only a redacted preview — never the secret itself.
 */
export function secretScan(text: string): SecretFinding[] {
  const findings: SecretFinding[] = [];
  const lines = text.split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    for (const { kind, pattern } of SECRET_PATTERNS) {
      const match = pattern.exec(lines[index]!);
      if (match) {
        findings.push({
          kind,
          line: index + 1,
          preview: `${lines[index]!.slice(0, Math.min(match.index, 24))}…[redacted]`,
        });
      }
    }
  }
  return findings;
}

export type LabDocumentBundle = {
  name: string;
  kind: DocumentKind;
  text: string;
  excerpts: {
    text: string;
    provenance: string;
    unusable: boolean;
    unusableReason?: string;
  }[];
};

/**
 * Front-matter provenance for lab entries (#64): `type:` front-matter plus the
 * date prefix in the filename, e.g. "2026-05-26 · hypothesis".
 */
export function frontMatterProvenance(text: string, name: string): string {
  const dateMatch = name.match(/(\d{4}-\d{2}-\d{2})/);
  const typeMatch = text.match(/^type:\s*(.+)$/m);
  const parts = [dateMatch?.[1], typeMatch?.[1]?.trim()].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : name;
}

export class SecretScanFailure extends Error {
  readonly documentName: string;
  readonly findings: SecretFinding[];

  constructor(documentName: string, findings: SecretFinding[]) {
    super(
      `Secret scan failed for "${documentName}" — ${findings.length} finding(s). The import is aborted; remove the secrets and retry.`
    );
    this.name = "SecretScanFailure";
    this.documentName = documentName;
    this.findings = findings;
  }
}

/**
 * Builds a lab document for the corpus bundle: classify, hard-fail on secret
 * findings (D-18), then segment into excerpt candidates with the same
 * extraction pipeline as the document journey.
 */
export function buildLabDocument(name: string, text: string): LabDocumentBundle {
  const kind = kindForFileName(name);
  if (!kind) {
    throw new Error(`Unsupported format: ${name}`);
  }

  const findings = secretScan(text);
  if (findings.length > 0) {
    throw new SecretScanFailure(name, findings);
  }

  const provenance =
    kind === "md" || kind === "txt" ? frontMatterProvenance(text, name) : name;
  const excerpts = segmentDocument({ name, kind, text }).map((excerpt) => ({
    ...excerpt,
    provenance: excerpt.provenance === "document text" ? provenance : `${provenance} · ${excerpt.provenance}`,
  }));

  return { name, kind, text, excerpts };
}

export function summarizeLabBundle(documents: LabDocumentBundle[]) {
  const excerptCount = documents.reduce(
    (total, document) => total + document.excerpts.length,
    0
  );
  const usableCount = documents.reduce(
    (total, document) =>
      total +
      document.excerpts.filter(
        (excerpt) => !excerpt.unusable && !isUnusableExtract(excerpt.text).unusable
      ).length,
    0
  );
  return { documentCount: documents.length, excerptCount, usableCount };
}
