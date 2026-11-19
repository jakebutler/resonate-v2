import { describe, expect, it } from "vitest";
import {
  buildDiscoveryQueries,
  discoveryEvidenceLabel,
  discoveryRunLimits,
  parseDiscoveryAnswer,
  planDiscoveryRun,
  stripResponseFormatInstruction,
} from "../competitorDiscovery";

describe("discoveryRunLimits", () => {
  it("falls back to the documented defaults without env overrides", () => {
    expect(discoveryRunLimits({})).toEqual({
      maxQueries: 4,
      runCeilingCents: 50,
      costPerQueryCents: 2,
      staleRunMs: 30 * 60 * 1000,
    });
  });

  it("accepts positive integer overrides and rejects the rest", () => {
    expect(discoveryRunLimits({ AEO_DISCOVERY_MAX_QUERIES: "2" }).maxQueries).toBe(2);
    expect(discoveryRunLimits({ AEO_DISCOVERY_MAX_QUERIES: "-1" }).maxQueries).toBe(4);
    expect(discoveryRunLimits({ AEO_DISCOVERY_MAX_QUERIES: "nope" }).maxQueries).toBe(4);
    expect(
      discoveryRunLimits({ AEO_DISCOVERY_STALE_RUN_MS: "60000" }).staleRunMs
    ).toBe(60000);
    expect(discoveryRunLimits({ AEO_DISCOVERY_STALE_RUN_MS: "-5" }).staleRunMs).toBe(
      30 * 60 * 1000
    );
  });
});

describe("buildDiscoveryQueries", () => {
  it("puts both category queries inside the pilot budget", () => {
    const queries = buildDiscoveryQueries(["fact-checking drafts before publication"]);
    expect(queries).toHaveLength(2);
    expect(queries[0]).toMatchObject({
      channel: "search",
      prompt: "best tools for fact-checking drafts before publication",
    });
    expect(queries[1]).toMatchObject({
      channel: "answer-engine",
      topic: "Which tools or products would you recommend for fact-checking drafts before publication?",
    });
    expect(queries[1]!.topic).not.toContain("Reply with a JSON array");
    expect(queries[1]!.prompt).toContain("Reply with a JSON array");
  });
});

describe("planDiscoveryRun", () => {
  const limits = { maxQueries: 4, runCeilingCents: 10, costPerQueryCents: 2, staleRunMs: 30_000 };

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
      {
        channel: "search",
        prompt: "best alternatives to FreshProof",
        topic: "best alternatives to FreshProof",
      },
      { url: "https://rival.example", title: "Rival", description: "A rival product." }
    );
    expect(label).toBe(
      "firecrawl search (best alternatives to FreshProof) → https://rival.example — Rival — A rival product."
    );
  });

  it("never records the answer-engine response-format instruction", () => {
    const label = discoveryEvidenceLabel(
      {
        channel: "answer-engine",
        prompt:
          'Which tools or products would you recommend instead of FreshProof? Reply with a JSON array of objects with "name" and "url".',
        topic: "Which tools or products would you recommend instead of FreshProof?",
      },
      { url: "https://rival.example" }
    );
    expect(label).toBe(
      "answer-engine (Which tools or products would you recommend instead of FreshProof?) → https://rival.example"
    );
  });
});

describe("stripResponseFormatInstruction", () => {
  it("strips the instruction wherever it landed in a stored string", () => {
    expect(
      stripResponseFormatInstruction(
        'Which tools would you recommend? Reply with a JSON array of objects with "name" and "url".'
      )
    ).toBe("Which tools would you recommend?");
  });

  it("leaves clean strings untouched", () => {
    expect(stripResponseFormatInstruction("best alternatives to FreshProof")).toBe(
      "best alternatives to FreshProof"
    );
  });
});
