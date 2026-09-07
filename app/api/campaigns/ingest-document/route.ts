import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { extractText, getDocumentProxy } from "unpdf";
import {
  kindForFileName,
  segmentDocument,
  type DocumentKind,
} from "@/lib/corpusExtract";

export const runtime = "nodejs";

const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

type IngestDocument = {
  name: string;
  kind: DocumentKind;
  meta: Record<string, unknown>;
  excerpts: {
    text: string;
    provenance: string;
    unusable: boolean;
    unusableReason?: string;
  }[];
};

function blockedUrlHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".local")) return true;
  if (host === "::1" || host.startsWith("::")) return true;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
    const [a, b] = host.split(".").map(Number);
    if (a === 127 || a === 10 || a === 0) return true;
    if (a === 192 && b === 168) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 169 && b === 254) return true;
  }
  return false;
}

async function extractPdf(
  bytes: Uint8Array,
  name: string
): Promise<IngestDocument> {
  const pdf = await getDocumentProxy(bytes);
  const { text } = await extractText(pdf, { mergePages: false });
  const pages = (Array.isArray(text) ? text : [String(text)]).map((page) =>
    page.replace(/\u0000/g, "")
  );
  const pageCount = pages.length;
  const excerpts = segmentDocument({ name, kind: "pdf", text: "", pages });
  return {
    name,
    kind: "pdf",
    meta: { pages: pageCount },
    excerpts,
  };
}

async function fetchDocumentFromUrl(
  url: string
): Promise<{ name: string; kind: DocumentKind; bytes: Uint8Array | null; text: string | null; error?: string }> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { name: url, kind: "txt", bytes: null, text: null, error: "Invalid URL." };
  }
  if (parsed.protocol !== "https:") {
    return {
      name: url,
      kind: "txt",
      bytes: null,
      text: null,
      error: "Only https URLs are supported.",
    };
  }
  if (blockedUrlHost(parsed.hostname)) {
    return {
      name: url,
      kind: "txt",
      bytes: null,
      text: null,
      error: "That host is not reachable for ingest.",
    };
  }

  const response = await fetch(parsed.toString(), {
    redirect: "follow",
    signal: AbortSignal.timeout(20_000),
    headers: { "user-agent": "ResonateCorpusIngest/1.0" },
  });
  if (!response.ok) {
    return {
      name: url,
      kind: "txt",
      bytes: null,
      text: null,
      error: `Fetch failed with status ${response.status}.`,
    };
  }
  const contentType = response.headers.get("content-type") ?? "";
  const buffer = new Uint8Array(await response.arrayBuffer());
  if (buffer.byteLength > MAX_UPLOAD_BYTES) {
    return {
      name: url,
      kind: "txt",
      bytes: null,
      text: null,
      error: "Document exceeds the 15 MB ingest limit.",
    };
  }
  const pathName = decodeURIComponent(parsed.pathname);
  const nameFromUrl = pathName.split("/").filter(Boolean).pop() ?? parsed.hostname;
  if (contentType.includes("application/pdf") || nameFromUrl.toLowerCase().endsWith(".pdf")) {
    return { name: nameFromUrl, kind: "pdf", bytes: buffer, text: null };
  }
  return {
    name: nameFromUrl,
    kind: "txt",
    bytes: null,
    text: new TextDecoder().decode(buffer),
  };
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const contentType = req.headers.get("content-type") ?? "";
  const documents: IngestDocument[] = [];

  try {
    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file") as
        | (File & { arrayBuffer: () => Promise<ArrayBuffer> })
        | null;
      const isFileLike =
        file !== null &&
        typeof file === "object" &&
        typeof file.name === "string" &&
        typeof file.arrayBuffer === "function";
      if (!isFileLike || !file) {
        return NextResponse.json(
          { error: "A file field is required." },
          { status: 400 }
        );
      }
      if (file.size > MAX_UPLOAD_BYTES) {
        return NextResponse.json(
          { error: "Document exceeds the 15 MB ingest limit." },
          { status: 413 }
        );
      }
      const kind = kindForFileName(file.name);
      if (!kind) {
        return NextResponse.json(
          {
            error:
              "Unsupported format. Ingest accepts PDF, markdown, txt, json, and csv.",
          },
          { status: 415 }
        );
      }

      if (kind === "pdf") {
        const bytes = new Uint8Array(await file.arrayBuffer());
        documents.push(await extractPdf(bytes, file.name));
      } else {
        const text = await file.text();
        documents.push({
          name: file.name,
          kind,
          meta: { bytes: file.size },
          excerpts: segmentDocument({ name: file.name, kind, text }),
        });
      }
    } else {
      const body = (await req.json()) as {
        text?: string;
        name?: string;
        url?: string;
      };

      if (typeof body.text === "string" && body.text.trim()) {
        const name = (body.name ?? "Pasted text").trim() || "Pasted text";
        documents.push({
          name,
          kind: "txt",
          meta: { source: "paste" },
          excerpts: segmentDocument({ name, kind: "txt", text: body.text }),
        });
      } else if (typeof body.url === "string" && body.url.trim()) {
        const fetched = await fetchDocumentFromUrl(body.url.trim());
        if (fetched.error || (!fetched.bytes && fetched.text === null)) {
          return NextResponse.json(
            { error: fetched.error ?? "Could not fetch that document." },
            { status: 400 }
          );
        }
        if (fetched.kind === "pdf" && fetched.bytes) {
          documents.push(await extractPdf(fetched.bytes, fetched.name));
        } else if (fetched.text !== null) {
          documents.push({
            name: fetched.name,
            kind: fetched.kind,
            meta: { source: "url", url: body.url },
            excerpts: segmentDocument({
              name: fetched.name,
              kind: fetched.kind,
              text: fetched.text,
            }),
          });
        }
      } else {
        return NextResponse.json(
          { error: "Provide a file, text, or url to ingest." },
          { status: 400 }
        );
      }
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Extraction failed.";
    return NextResponse.json(
      { error: `Extraction failed: ${message}` },
      { status: 422 }
    );
  }

  const totalExcerpts = documents.reduce(
    (total, document) => total + document.excerpts.length,
    0
  );

  return NextResponse.json({ documents, excerptCount: totalExcerpts });
}
