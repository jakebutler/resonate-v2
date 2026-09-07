import { describe, expect, it } from "vitest";
import {
  GroundingRefusedError,
  assertGroundingAllowed,
  buildCorpusCitation,
  isLiveGenerationConfigured,
  parseCorpusCitation,
} from "@/lib/campaignGrounding";

describe("assertGroundingAllowed", () => {
  it("refuses mock mode without explicit operator acknowledgment", () => {
    expect(() =>
      assertGroundingAllowed({
        mode: "mock",
        mockAcknowledged: false,
        liveConfigured: false,
      })
    ).toThrow(GroundingRefusedError);

    try {
      assertGroundingAllowed({
        mode: "mock",
        mockAcknowledged: false,
        liveConfigured: false,
      });
    } catch (error) {
      expect((error as GroundingRefusedError).reason).toBe(
        "mock-unacknowledged"
      );
    }
  });

  it("allows mock mode once the operator acknowledges it", () => {
    expect(() =>
      assertGroundingAllowed({
        mode: "mock",
        mockAcknowledged: true,
        liveConfigured: false,
      })
    ).not.toThrow();
  });

  it("fails closed for live mode when no verified provider is configured", () => {
    expect(() =>
      assertGroundingAllowed({
        mode: "live",
        mockAcknowledged: true,
        liveConfigured: false,
      })
    ).toThrow(GroundingRefusedError);

    try {
      assertGroundingAllowed({
        mode: "live",
        mockAcknowledged: true,
        liveConfigured: false,
      });
    } catch (error) {
      expect((error as GroundingRefusedError).reason).toBe(
        "live-unconfigured"
      );
    }
  });

  it("allows live mode only when a provider is configured", () => {
    expect(() =>
      assertGroundingAllowed({
        mode: "live",
        mockAcknowledged: false,
        liveConfigured: true,
      })
    ).not.toThrow();
  });

  it("blocks materialization-side use identically (same gate, no bypass)", () => {
    const attempt = () =>
      assertGroundingAllowed({
        mode: "mock",
        mockAcknowledged: false,
        liveConfigured: true,
      });
    expect(attempt).toThrow(/acknowledge mock mode/);
  });
});

describe("isLiveGenerationConfigured", () => {
  it("is false without a key", () => {
    expect(isLiveGenerationConfigured({})).toBe(false);
    expect(isLiveGenerationConfigured({ PIONEER_API_KEY: "" })).toBe(false);
    expect(isLiveGenerationConfigured({ PIONEER_API_KEY: "   " })).toBe(false);
  });

  it("is true with a non-empty key", () => {
    expect(isLiveGenerationConfigured({ PIONEER_API_KEY: "key" })).toBe(true);
  });
});

describe("corpus citation format", () => {
  it("builds corpus://<brand>/<corpusId>#excerpt-N citations", () => {
    expect(
      buildCorpusCitation({ brandId: "corvo", corpusId: "abc123", seq: 3 })
    ).toBe("corpus://corvo/abc123#excerpt-3");
  });

  it("rejects non-positive or fractional excerpt numbers", () => {
    expect(() =>
      buildCorpusCitation({ brandId: "corvo", corpusId: "abc", seq: 0 })
    ).toThrow();
    expect(() =>
      buildCorpusCitation({ brandId: "corvo", corpusId: "abc", seq: 1.5 })
    ).toThrow();
  });

  it("parses citations round-trip", () => {
    const citation = buildCorpusCitation({
      brandId: "lower-db",
      corpusId: "xyz789",
      seq: 12,
    });
    expect(parseCorpusCitation(citation)).toEqual({
      brandId: "lower-db",
      corpusId: "xyz789",
      seq: 12,
    });
  });

  it("returns null for malformed citations", () => {
    expect(parseCorpusCitation("not a citation")).toBeNull();
    expect(parseCorpusCitation("corpus://corvo/abc#excerpt-nope")).toBeNull();
    expect(parseCorpusCitation("corpus://corvo/abc")).toBeNull();
    expect(
      parseCorpusCitation("corpus://corvo/abc#excerpt-0")
    ).toBeNull();
  });
});
