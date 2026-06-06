import type { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/v2/generate-draft/route";

function makeRequest(body: object): NextRequest {
  return new Request("http://localhost/api/v2/generate-draft", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

const validBody = {
  idea: {
    id: "idea_test",
    brandId: "corvo",
    title: "Golden sets and evals",
    sourceUrl: "https://freshproof.io",
    tags: ["evals"],
    status: "inbox",
    entries: [
      {
        id: "entry_test",
        content:
          "Claim validation needs golden examples and calibrated review.",
        createdAt: "2026-06-05T00:00:00.000Z",
      },
    ],
    linkedPostIds: [],
    createdAt: "2026-06-05T00:00:00.000Z",
    updatedAt: "2026-06-05T00:00:00.000Z",
  },
  voicePackMarkdown: "# Voice\n\nBe precise and practical.",
  channel: "corvo-blog",
};

describe("POST /api/v2/generate-draft", () => {
  const originalApiKey = process.env.PIONEER_API_KEY;
  const originalModel = process.env.PIONEER_DRAFT_MODEL;

  beforeEach(() => {
    vi.restoreAllMocks();
    delete process.env.PIONEER_API_KEY;
    delete process.env.PIONEER_DRAFT_MODEL;
  });

  afterEach(() => {
    process.env.PIONEER_API_KEY = originalApiKey;
    process.env.PIONEER_DRAFT_MODEL = originalModel;
    vi.unstubAllGlobals();
  });

  it("returns 400 when required fields are missing", async () => {
    const res = await POST(makeRequest({ idea: validBody.idea }));

    expect(res.status).toBe(400);
  });

  it("returns a deterministic local placeholder when Pioneer is not configured", async () => {
    const res = await POST(makeRequest(validBody));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.provider).toBe("local-placeholder");
    expect(data.warning).toContain("PIONEER_API_KEY");
    expect(data.draft).toContain("Golden sets");
  });

  it("returns the Pioneer chat completion content when configured", async () => {
    process.env.PIONEER_API_KEY = "test-pioneer-key";
    process.env.PIONEER_DRAFT_MODEL = "claude-opus-4-7";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            choices: [{ message: { content: "Pioneer generated draft." } }],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      )
    );

    const res = await POST(makeRequest(validBody));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.provider).toBe("pioneer");
    expect(data.model).toBe("claude-opus-4-7");
    expect(data.channel).toBe("corvo-blog");
    expect(data.draft).toBe("Pioneer generated draft.");
  });

  it("includes clarifying answers in the server-side Pioneer prompt", async () => {
    process.env.PIONEER_API_KEY = "test-pioneer-key";
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: "Draft with extra context." } }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const res = await POST(
      makeRequest({
        ...validBody,
        clarifyingAnswers: [
          {
            question: "What is the central point this draft must make?",
            answer: "Make the publishing handoff reviewable before scaling channels.",
          },
        ],
      })
    );
    const data = await res.json();
    const requestBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    const userPrompt = requestBody.messages[1].content;

    expect(res.status).toBe(200);
    expect(data.provider).toBe("pioneer");
    expect(userPrompt).toContain("Clarifying answers collected from the user");
    expect(userPrompt).toContain("Make the publishing handoff reviewable");
    expect(userPrompt).not.toContain("test-pioneer-key");
  });

  it("returns a linkedin placeholder draft when Pioneer is not configured", async () => {
    const res = await POST(makeRequest({ ...validBody, channel: "linkedin" }));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.provider).toBe("local-placeholder");
    expect(data.draft).toContain("Golden sets and evals");
  });

  it("falls back when Pioneer returns an error", async () => {
    process.env.PIONEER_API_KEY = "test-pioneer-key";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("bad gateway", { status: 502 }))
    );

    const res = await POST(makeRequest(validBody));
    const data = await res.json();

    expect(res.status).toBe(502);
    expect(data.provider).toBe("local-placeholder");
    expect(data.draft).toContain("Golden sets");
  });
});
