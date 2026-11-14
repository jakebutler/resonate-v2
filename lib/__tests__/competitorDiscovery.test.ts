import { describe, expect, it } from "vitest";
import {
  buildDiscoveryQueries,
  discoveryEvidenceLabel,
  discoveryRunLimits,
  parseDiscoveryAnswer,
  planDiscoveryRun,
} from "../competitorDiscovery";

describe("discoveryRunLimits", () => {
  it("falls back to the documented defaults without env overrides", () => {
    expect(discoveryRunLimits({})).toEqual({
      maxQueries: 4,
      runCeilingCents: 50,
      costPerQueryCents: 2,
    });
  });

  it("accepts positive integer overrides and rejects the rest", () => {
    expect(discoveryRunLimits({ AEO_DISCOVERY_MAX_QUERIES: "2" }).maxQueries).toBe(2);
    expect(discoveryRunLimits({ AEO_DISCOVERY_MAX_QUERIES: "-1" }).maxQueries).toBe(4);
    expect(discoveryRunLimits({ AEO_DISCOVERY_MAX_QUERIES: "nope" }).maxQueries).toBe(4);
  });
});

describe("buildDiscoveryQueries", () => {
  it("asks both channels for the brand and each identifier", () => {
    const queries = buildDiscoveryQueries({
      brandName: "FreshProof",
      productIdentifiers: ["GLP-1 tracking"],
    });
    expect(queries).toHaveLength(4);
    expect(queries[0]).toMatchObject({ channel: "search", prompt: "best alternatives to FreshProof" });
    expect(queries[1]!.channel).toBe("answer-engine");
    expect(queries[2]).toMatchObject({
      channel: "search",
      prompt: "best GLP-1 tracking tools and alternatives",
    });
    expect(queries[3]!.channel).toBe("answer-engine");
  });
});

describe("planDiscoveryRun", () => {
  const limits = { maxQueries: 4, runCeilingCents: 10, costPerQueryCents: 2 };

  it("admits a run whose estimate fits the ceiling", () => {
    expect(planDiscoveryRun({ queryCount: 4, limits })).toEqual({
      ok: true,
      queryCount: 4,
      estimatedCostCents: 8,
      ceilingCents: 10,
    });
  });

  it("refuses a run whose estimate exceeds the ceiling, before any dispatch", () => {
    expect(planDiscoveryRun({ queryCount: 6, limits })).toMatchObject({
      ok: false,
      reason: "budget-exceeded",
      estimatedCostCents: 12,
      ceilingCents: 10,
    });
  });

  it("refuses an empty query set", () => {
    expect(planDiscoveryRun({ queryCount: 0, limits })).toMatchObject({
      ok: false,
      reason: "no-queries",
    });
  });
});

describe("parseDiscoveryAnswer", () => {
  it("reads the JSON array of {name, url} the prompt asks for", () => {
    const answer =
      'Here are some options: [{"name":"ClaimGuard","url":"https://claimguard.example"}] and more.';
    expect(parseDiscoveryAnswer(answer)).toEqual([
      { name: "ClaimGuard", url: "https://claimguard.example/" },
    ]);
  });

  it("falls back to URLs mentioned in prose, naming each host once", () => {
    const answer =
      "I would recommend https://rival.example and https://rival.example/pricing but never https://internal:8080.";
    const parsed = parseDiscoveryAnswer(answer);
    expect(parsed).toEqual([{ name: "rival.example", url: "https://rival.example/" }]);
  });

  it("fabricates nothing from unparseable answers", () => {
    expect(parseDiscoveryAnswer("Competitor One and Rival are good options.")).toEqual([]);
  });

  it("drops entries without a usable http(s) url", () => {
    const answer =
      '[{"name":"No URL"},{"name":"FTP only","url":"ftp://files.example"},{"name":"Valid","url":"https://valid.example"}]';
    expect(parseDiscoveryAnswer(answer)).toEqual([
      { name: "Valid", url: "https://valid.example/" },
    ]);
  });
});

describe("discoveryEvidenceLabel", () => {
  it("records the channel, the exact phrasing, and what was seen", () => {
    const label = discoveryEvidenceLabel(
      { channel: "search", prompt: "best alternatives to FreshProof" },
      { url: "https://rival.example", title: "Rival", description: "A rival product." }
    );
    expect(label).toBe(
      "firecrawl search (best alternatives to FreshProof) → https://rival.example — Rival — A rival product."
    );
  });
});
