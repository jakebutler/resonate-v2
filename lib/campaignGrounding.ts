export type GroundingMode = "mock" | "live";

export type GroundingRefusalReason =
  | "mock-unacknowledged"
  | "live-unconfigured";

export class GroundingRefusedError extends Error {
  readonly reason: GroundingRefusalReason;

  constructor(reason: GroundingRefusalReason) {
    super(messageForReason(reason));
    this.name = "GroundingRefusedError";
    this.reason = reason;
  }
}

function messageForReason(reason: GroundingRefusalReason): string {
  if (reason === "mock-unacknowledged") {
    return "Mock generation is blocked: the operator must explicitly acknowledge mock mode before grounded output can be produced or materialized.";
  }
  return "Live generation is not available: no verified model provider is configured, so grounded generation fails closed.";
}

export function assertGroundingAllowed(input: {
  mode: GroundingMode;
  mockAcknowledged: boolean;
  liveConfigured: boolean;
}): void {
  if (input.mode === "mock") {
    if (!input.mockAcknowledged) {
      throw new GroundingRefusedError("mock-unacknowledged");
    }
    return;
  }
  if (!input.liveConfigured) {
    throw new GroundingRefusedError("live-unconfigured");
  }
}

export function isLiveGenerationConfigured(env: {
  PIONEER_API_KEY?: string;
}): boolean {
  return Boolean(env.PIONEER_API_KEY && env.PIONEER_API_KEY.trim().length > 0);
}

export function buildCorpusCitation(input: {
  brandId: string;
  corpusId: string;
  seq: number;
}): string {
  if (!Number.isInteger(input.seq) || input.seq < 1) {
    throw new Error(`Invalid excerpt sequence: ${input.seq}`);
  }
  return `corpus://${input.brandId}/${input.corpusId}#excerpt-${input.seq}`;
}

export function parseCorpusCitation(
  citation: string
): { brandId: string; corpusId: string; seq: number } | null {
  const match = /^corpus:\/\/([^/]+)\/([^#]+)#excerpt-(\d+)$/.exec(citation);
  if (!match) return null;
  const seq = Number(match[3]);
  if (!Number.isInteger(seq) || seq < 1) return null;
  return { brandId: match[1], corpusId: match[2], seq };
}
