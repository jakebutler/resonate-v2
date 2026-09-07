import type { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/campaigns/ingest-document/route";

vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(),
}));

vi.mock("unpdf", () => ({
  extractText: vi.fn(),
  getDocumentProxy: vi.fn(),
}));

import { auth } from "@clerk/nextjs/server";
import { extractText, getDocumentProxy } from "unpdf";

const authMock = vi.mocked(auth);
const extractTextMock = vi.mocked(extractText);
const getDocumentProxyMock = vi.mocked(getDocumentProxy);

function jsonRequest(body: object): NextRequest {
  return new Request("http://localhost/api/campaigns/ingest-document", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

/** Multipart body built manually — jsdom's FormData loses File identity through undici serialization. */
function fileRequest(
  bytes: Uint8Array,
  name: string,
  mimeType: string
): NextRequest {
  const boundary = `----resonatetest${Math.random().toString(16).slice(2)}`;
  const header = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${name}"\r\nContent-Type: ${mimeType}\r\n\r\n`;
  const body = Buffer.concat([
    Buffer.from(header, "utf8"),
    Buffer.from(bytes),
    Buffer.from(`\r\n--${boundary}--\r\n`, "utf8"),
  ]);
  return new Request("http://localhost/api/campaigns/ingest-document", {
    method: "POST",
    headers: { "Content-Type": `multipart/form-data; boundary=${boundary}` },
    body: new Uint8Array(body),
  }) as unknown as NextRequest;
}

describe("POST /api/campaigns/ingest-document", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    authMock.mockResolvedValue({ userId: "user_test" } as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    authMock.mockResolvedValue({ userId: null } as never);
    const res = await POST(jsonRequest({ text: "hello" }));
    expect(res.status).toBe(401);
  });

  it("returns 400 when no source is provided", async () => {
    const res = await POST(jsonRequest({}));
    expect(res.status).toBe(400);
  });

  it("segments pasted text into excerpt candidates", async () => {
    const res = await POST(
      jsonRequest({
        text:
          "We explore the use of large language models to generate reasoning traces and actions in an interleaved manner, letting the model update plans while acting. This paragraph is long enough to stand as an excerpt candidate on its own, which keeps the review list meaningful.",
      })
    );
    expect(res.status).toBe(200);
    const payload = await res.json();
    expect(payload.documents).toHaveLength(1);
    expect(payload.documents[0].kind).toBe("txt");
    expect(payload.excerptCount).toBeGreaterThan(0);
    expect(payload.documents[0].excerpts[0]).toMatchObject({
      unusable: false,
    });
  });

  it("rejects unsupported file formats", async () => {
    const res = await POST(
      fileRequest(new TextEncoder().encode("{}"), "scratch.ipynb", "application/json")
    );
    expect(res.status).toBe(415);
    const payload = await res.json();
    expect(payload.error).toMatch(/Unsupported format/);
  });

  it("extracts page-provenanced excerpts from a PDF", async () => {
    getDocumentProxyMock.mockResolvedValue({ fake: "doc" } as never);
    extractTextMock.mockResolvedValue({
      totalPages: 2,
      text: [
        "We explore the use of large language models to generate reasoning traces and task-specific actions in an interleaved manner, tracking high-level plans while gathering supporting information.",
        "34.2 | 35.1 || 61.0\n40.1 | 41.9 || 62.2\n[ARTIFACT] NaN\n33.0 | 34.8 || 60.1",
      ],
    } as never);

    const res = await POST(
      fileRequest(
        new TextEncoder().encode("%PDF-fake"),
        "react-paper.pdf",
        "application/pdf"
      )
    );
    expect(res.status).toBe(200);
    const payload = await res.json();
    expect(payload.documents[0].kind).toBe("pdf");
    expect(payload.documents[0].name).toBe("react-paper.pdf");
    expect(payload.documents[0].meta.pages).toBe(2);
    const excerpts = payload.documents[0].excerpts;
    expect(excerpts[0].provenance).toBe("p.1");
    expect(excerpts[0].unusable).toBe(false);
    expect(excerpts[excerpts.length - 1].unusable).toBe(true);
  });

  it("refuses non-https links", async () => {
    const res = await POST(jsonRequest({ url: "http://arxiv.org/pdf/2210.03629" }));
    expect(res.status).toBe(400);
    const payload = await res.json();
    expect(payload.error).toMatch(/https/i);
  });

  it("refuses loopback and private-IP links", async () => {
    for (const url of [
      "https://localhost/secret.pdf",
      "https://127.0.0.1/x.pdf",
      "https://192.168.1.4/x.pdf",
      "https://10.0.0.9/x.pdf",
    ]) {
      const res = await POST(jsonRequest({ url }));
      expect(res.status).toBe(400);
    }
  });
});
