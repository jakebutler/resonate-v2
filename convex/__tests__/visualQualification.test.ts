import { createHash } from "node:crypto";
import { convexTest } from "convex-test";
import { anyApi } from "convex/server";
import sharp from "sharp";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import schema from "../schema";

const api = anyApi;
const modules = import.meta.glob("../**/*.ts");

const fixturePacket = vi.hoisted(() => ({
  references: [] as Array<{
    order: number;
    role: "identity" | "style";
    sourceFileName: string;
    sha256: string;
    bytes: number;
    width: number;
    height: number;
  }>,
}));
vi.mock("../../lib/visualQualification", async (original) => ({
  ...(await original<typeof import("../../lib/visualQualification")>()),
  IMAGE_PACKET_REFERENCES: fixturePacket.references as never,
}));

const credentials = vi.hoisted(() => ({
  imageKey: "fictional-image-key" as string | null,
  textKey: "fictional-text-key" as string | null,
}));
vi.mock("../../lib/visualProviderRuntime", async (original) => ({
  ...(await original<typeof import("../../lib/visualProviderRuntime")>()),
  visualProviderCredential: () => credentials.imageKey,
}));
vi.mock("../../lib/visualTextRuntime", async (original) => ({
  ...(await original<typeof import("../../lib/visualTextRuntime")>()),
  visualTextCredential: (provider: string) =>
    provider === "openai" ? credentials.textKey : null,
}));

const identity = {
  capabilityReceiptIds: [
    "functional-generation-receipt",
    "functional-edit-receipt",
  ],
  boundReceiptId: "functional-bound-receipt",
  reviewedBy: "offline-test-review",
  provenance: "IN-PROCESS FAKE HTTP CONTRACT, not live qualification",
  expiresAt: 4_000_000_000_000,
};

const textRoute = {
  ...identity,
  model: "fictional-approved-text-model",
  maxInputBytes: 20_000,
  maxInputTokens: 21_000,
  maxMessageOverheadTokens: 1_000,
  contextWindowTokens: 30_000,
  maxOutputTokens: 4_000,
  inputPriceMicrosPerMillion: 1_250_000,
  outputPriceMicrosPerMillion: 10_000_000,
};

const generationPrompt =
  "A raven mechanic studies live measurements while a roadster remains restrained under testing.";
const editFeedback =
  "Shorten only the projecting grip on the burnt-copper adjustment handwheel by about one fifth.";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("persistQualifiedRoutes", () => {
  it("registers image and text routes through the reviewed internal mutations when the operator token matches", async () => {
    const t = convexTest(schema, modules);
    vi.stubEnv("VISUAL_QUALIFICATION_OPERATOR_TOKEN", "op-token");
    const result = await t.action(
      api.visualQualification.persistQualifiedRoutes,
      { operatorToken: "op-token", imageRoute: identity, textRoute },
    );
    expect(result.imageRouteId).toBeTruthy();
    expect(result.textRouteId).toBeTruthy();
    await t.run(async (ctx) => {
      const imageRoute = await ctx.db.get(result.imageRouteId!);
      expect(imageRoute).toMatchObject({
        provider: "openai",
        model: "gpt-image-2",
        quality: "low",
        maximumMicros: 250_000,
        enabled: true,
        capabilityReceiptIds: identity.capabilityReceiptIds,
      });
      const textRouteRow = await ctx.db.get(result.textRouteId!);
      expect(textRouteRow).toMatchObject({
        provider: "openai",
        model: textRoute.model,
        stages: ["planning"],
        enabled: true,
      });
    });
  });

  it("refuses a wrong or unconfigured operator token explicitly", async () => {
    const t = convexTest(schema, modules);
    vi.stubEnv("VISUAL_QUALIFICATION_OPERATOR_TOKEN", "op-token");
    await expect(
      t.action(api.visualQualification.persistQualifiedRoutes, {
        operatorToken: "wrong",
        imageRoute: identity,
      }),
    ).rejects.toThrow("operator token");
    vi.stubEnv("VISUAL_QUALIFICATION_OPERATOR_TOKEN", "");
    await expect(
      t.action(api.visualQualification.persistQualifiedRoutes, {
        operatorToken: "op-token",
        imageRoute: identity,
      }),
    ).rejects.toThrow("operator token");
  });

  it("still refuses receipt-less registration, preserving the internal mutation contract", async () => {
    const t = convexTest(schema, modules);
    vi.stubEnv("VISUAL_QUALIFICATION_OPERATOR_TOKEN", "op-token");
    await expect(
      t.action(api.visualQualification.persistQualifiedRoutes, {
        operatorToken: "op-token",
        imageRoute: { ...identity, capabilityReceiptIds: [] },
      }),
    ).rejects.toThrow("recorded capability receipt ids");
  });
});

describe("executeImageQualificationPacket", () => {
  const referencePngs: {
    role: "identity" | "style";
    bytes: Buffer;
    width: number;
    height: number;
  }[] = [];

  beforeAll(async () => {
    for (const [role, width, height] of [
      ["identity", 1448, 1086],
      ["style", 1672, 941],
    ] as const) {
      const bytes = await sharp({
        create: { width, height, channels: 3, background: "#15616d" },
      })
        .png()
        .toBuffer();
      referencePngs.push({ role, bytes, width, height });
    }
  });

  function stubPacketFixtures(): void {
    credentials.imageKey = "fictional-image-key";
    credentials.textKey = "fictional-text-key";
    fixturePacket.references.splice(
      0,
      fixturePacket.references.length,
      ...referencePngs.map((reference, index) => ({
        order: index + 1,
        role: reference.role,
        sourceFileName: `fixture-${reference.role}.png`,
        sha256: createHash("sha256").update(reference.bytes).digest("hex"),
        bytes: reference.bytes.length,
        width: reference.width,
        height: reference.height,
      })),
    );
    vi.stubEnv("VISUAL_QUALIFICATION_OPERATOR_TOKEN", "op-token");
    vi.stubEnv("VISUAL_QUALIFICATION_APPROVED", "approved");
  }

  function packetArgs() {
    return {
      operatorToken: "op-token",
      generationPrompt,
      editFeedback,
      references: referencePngs.map((reference) => ({
        role: reference.role,
        bytesBase64: reference.bytes.toString("base64"),
      })),
    };
  }

  it("stays blocked without written approval and never touches the network", async () => {
    const t = convexTest(schema, modules);
    stubPacketFixtures();
    vi.stubEnv("VISUAL_QUALIFICATION_APPROVED", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const result = await t.action(
      api.visualQualification.executeImageQualificationPacket,
      packetArgs(),
    );
    expect(result.status).toBe("blocked");
    expect(result.reason).toContain("not approved");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports ABSENT with named credentials and the prerequisite when approval lacks keys", async () => {
    const t = convexTest(schema, modules);
    stubPacketFixtures();
    credentials.imageKey = null;
    credentials.textKey = null;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const result = await t.action(
      api.visualQualification.executeImageQualificationPacket,
      packetArgs(),
    );
    expect(result.status).toBe("absent");
    expect(result.reason).toBe("credentials-not-configured");
    expect(result.missingCredentials).toEqual([
      "OPENAI_API_KEY",
      "OPENAI_TEXT_API_KEY or CORTEX_API_KEY",
    ]);
    expect(result.prerequisite).toContain("Obvious secrets");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("executes the two-call packet under the reviewed caps and records receipts with mocked transport", async () => {
    const t = convexTest(schema, modules);
    stubPacketFixtures();
    const master = await sharp({
      create: { width: 1536, height: 1024, channels: 3, background: "#f4d35e" },
    })
      .png()
      .toBuffer();
    const b64 = master.toString("base64");
    const fetchMock = vi.fn().mockImplementation(
      () =>
        new Response(
          JSON.stringify({
            model: "gpt-image-2-2026-04-21",
            data: [{ b64_json: b64 }],
            usage: {
              input_tokens_details: { text_tokens: 1_200, image_tokens: 646 },
              output_tokens: 400,
            },
          }),
          { status: 200, headers: { "x-request-id": "req_fictional_probe" } },
        ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const result = await t.action(
      api.visualQualification.executeImageQualificationPacket,
      packetArgs(),
    );
    expect(result.status).toBe("completed");
    expect(result.calls).toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.calls[0]).toMatchObject({
      operation: "generate",
      httpStatus: 200,
      requestId: "req_fictional_probe",
      estimatedCostUsd: (1_200 * 5 + 646 * 8 + 400 * 30) / 1_000_000,
      width: 1536,
      height: 1024,
    });
    expect(result.calls[1]).toMatchObject({
      operation: "edit",
      width: 1536,
      height: 1024,
    });
    for (const call of result.calls) {
      expect(call.requestSha256).toMatch(/^[a-f0-9]{64}$/);
      expect(call.outputSha256).toMatch(/^[a-f0-9]{64}$/);
      expect(call.estimatedCostUsd).toBeLessThanOrEqual(0.25);
    }
    // Both outputs land in storage as durable packet evidence.
    await t.run(async (ctx) => {
      for (const call of result.calls) {
        const blob = await ctx.storage.get(call.outputStorageId);
        expect(blob?.type).toBe("image/png");
      }
    });
  });

  it("refuses reference bytes that differ from the approved packet before any dispatch", async () => {
    const t = convexTest(schema, modules);
    stubPacketFixtures();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const wrongBytes = await sharp({
      create: { width: 64, height: 64, channels: 3, background: "#ffffff" },
    })
      .png()
      .toBuffer();
    await expect(
      t.action(api.visualQualification.executeImageQualificationPacket, {
        ...packetArgs(),
        references: [
          { role: "identity", bytesBase64: wrongBytes.toString("base64") },
          {
            role: "style",
            bytesBase64: referencePngs[1].bytes.toString("base64"),
          },
        ],
      }),
    ).rejects.toThrow("differs from the approved packet");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
