import type { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getFunctionName } from "convex/server";

const fetchMutationMock = vi.fn();

vi.mock("convex/nextjs", () => ({
  fetchMutation: (...args: unknown[]) => fetchMutationMock(...args),
}));

import { POST } from "@/app/api/ops/lab-import/route";

function invokedFunctionName(callIndex: number): string {
  const reference = fetchMutationMock.mock.calls[callIndex]?.[0] as unknown;
  return getFunctionName(reference as never);
}

function makeRequest(
  body: unknown,
  headers?: Record<string, string>
): NextRequest {
  return new Request("http://localhost/api/ops/lab-import", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

const cleanBody = {
  brandId: "lower-db",
  files: [{ name: "note.md", text: "A clean lab note." }],
};

describe("POST /api/ops/lab-import", () => {
  const originalOpsSecret = process.env.V2_OPS_SECRET;
  const originalDeployKey = process.env.CONVEX_DEPLOY_KEY;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.V2_OPS_SECRET = "test-ops-secret";
    process.env.CONVEX_DEPLOY_KEY = "test-deploy-key";
    fetchMutationMock.mockResolvedValue({ ok: true, version: 1, excerptCount: 1 });
  });

  afterEach(() => {
    if (originalOpsSecret === undefined) delete process.env.V2_OPS_SECRET;
    else process.env.V2_OPS_SECRET = originalOpsSecret;
    if (originalDeployKey === undefined) delete process.env.CONVEX_DEPLOY_KEY;
    else process.env.CONVEX_DEPLOY_KEY = originalDeployKey;
  });

  it("rejects requests without a bearer secret and audits the rejection", async () => {
    const res = await POST(makeRequest(cleanBody));

    expect(res.status).toBe(401);
    expect(fetchMutationMock).toHaveBeenCalledTimes(1);
    expect(invokedFunctionName(0)).toBe("opsAudit:recordLabImportRejection");
  });

  it("rejects a wrong bearer secret", async () => {
    const res = await POST(
      makeRequest(cleanBody, { authorization: "Bearer wrong-secret" })
    );

    expect(res.status).toBe(401);
    expect(invokedFunctionName(0)).toBe("opsAudit:recordLabImportRejection");
  });

  it("rejects when the ops secret is unset (fail closed)", async () => {
    delete process.env.V2_OPS_SECRET;
    const res = await POST(
      makeRequest(cleanBody, { authorization: "Bearer test-ops-secret" })
    );

    expect(res.status).toBe(401);
  });

  it("invokes the internal import mutation with a valid bearer secret", async () => {
    const res = await POST(
      makeRequest(cleanBody, { authorization: "Bearer test-ops-secret" })
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.version).toBe(1);
    expect(fetchMutationMock).toHaveBeenCalledTimes(1);
    expect(invokedFunctionName(0)).toBe("corpora:importLabBundle");
    expect(fetchMutationMock.mock.calls[0][1]).toEqual({
      brandId: "lower-db",
      files: cleanBody.files,
    });
    // Internal functions are invoked with admin auth, not public visibility.
    expect(fetchMutationMock.mock.calls[0][2]).toEqual({
      adminToken: "test-deploy-key",
    });
  });

  it("fails closed when the deploy key for internal functions is unset", async () => {
    delete process.env.CONVEX_DEPLOY_KEY;
    const res = await POST(
      makeRequest(cleanBody, { authorization: "Bearer test-ops-secret" })
    );

    expect(res.status).toBe(500);
    expect(fetchMutationMock).not.toHaveBeenCalled();
  });

  it("rejects an unknown brand without touching the import", async () => {
    const res = await POST(
      makeRequest(
        { brandId: "nope", files: [] },
        { authorization: "Bearer test-ops-secret" }
      )
    );

    expect(res.status).toBe(400);
    expect(fetchMutationMock).not.toHaveBeenCalled();
  });

  it("rejects malformed file payloads", async () => {
    const res = await POST(
      makeRequest(
        { brandId: "corvo", files: [{ name: 42 }] },
        { authorization: "Bearer test-ops-secret" }
      )
    );

    expect(res.status).toBe(400);
    expect(fetchMutationMock).not.toHaveBeenCalled();
  });
});
