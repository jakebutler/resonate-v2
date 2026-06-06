import { expect, it } from "vitest";
import type {
  V2ProviderAdapter,
  V2ProviderSubmission,
} from "@/lib/v2ProviderAdapters";

const baseSubmission: V2ProviderSubmission = {
  postId: "post_contract_1",
  brandId: "corvo",
  channelId: "linkedin",
  title: "Contract test",
  content: "Contract suite submission body.",
  scheduledDate: "2026-06-12",
  scheduledTime: "09:00",
  timezone: "America/Los_Angeles",
  idempotencyKey: "contract:intent:fingerprint",
};

export type ProviderAdapterContractOptions = {
  submission?: V2ProviderSubmission;
  approvedContext: (overrides?: Record<string, string | undefined>) => {
    env: Record<string, string | undefined>;
    liveProviderValidationApproved?: boolean;
    fetchImpl?: typeof fetch;
  };
  blockedContext: (overrides?: Record<string, string | undefined>) => {
    env: Record<string, string | undefined>;
    liveProviderValidationApproved?: boolean;
    fetchImpl?: typeof fetch;
  };
  expectSubmitSuccess?: boolean;
  requiresLiveValidationApproval?: boolean;
};

export function runProviderAdapterContractSuite(
  adapter: V2ProviderAdapter,
  options: ProviderAdapterContractOptions
) {
  const submission = options.submission ?? baseSubmission;

  it("requires server credentials for validation", async () => {
    const result = await adapter.validateConnection(
      options.blockedContext({ [adapter.requiredEnvVar ?? ""]: undefined })
    );
    if (!adapter.requiredEnvVar) {
      expect(result.ok).toBe(true);
      return;
    }
    expect(result.ok).toBe(false);
  });

  it("requires explicit approval for live validation", async () => {
    if (!adapter.requiredEnvVar || options.requiresLiveValidationApproval === false) return;
    const result = await adapter.validateConnection(
      options.blockedContext({ [adapter.requiredEnvVar]: "secret" })
    );
    expect(result).toMatchObject({ ok: false });
  });

  it("blocks submit without live validation approval", async () => {
    if (options.requiresLiveValidationApproval === false) return;
    const result = await adapter.submit(submission, options.blockedContext());
    expect(result.ok).toBe(false);
    expect(result.status).toBe("unavailable");
  });

  it("records sanitized submit attempts without leaking secrets", async () => {
    const approved = options.approvedContext();
    const result = await adapter.submit(submission, approved);
    const serialized = JSON.stringify(result.sanitizedResponse);
    const credentialValue = approved.env[adapter.requiredEnvVar ?? ""];
    if (credentialValue) {
      expect(serialized).not.toContain(credentialValue);
    }
    expect(serialized).not.toMatch(/Bearer\s+\S+/i);
    if (options.expectSubmitSuccess) {
      expect(result.ok).toBe(true);
      expect(result.providerPostId).toBeTruthy();
    }
  });

  it("blocks cancel without live validation approval", async () => {
    if (options.requiresLiveValidationApproval === false) return;
    const result = await adapter.recordCancelOrUnpublishIntent(
      submission,
      "cancel",
      options.blockedContext()
    );
    expect(result.ok).toBe(false);
    expect(result.status).toBe("unavailable");
  });

  it("blocks status refresh without live validation approval", async () => {
    if (options.requiresLiveValidationApproval === false) return;
    const result = await adapter.refreshStatus("provider-post-1", options.blockedContext());
    expect(result.ok).toBe(false);
    expect(result.status).toBe("unavailable");
  });
}
