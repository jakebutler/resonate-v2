import { describe, expect, it, vi } from "vitest";
import { runProviderAdapterContractSuite } from "@/lib/__tests__/helpers/providerAdapterContract";
import {
  adapterForProvider,
  bufferProviderAdapter,
  classifyProviderError,
  classifyRedditError,
  mockProviderAdapter,
  providerForChannel,
  sanitizeProviderPayload,
  scheduleToUtcIso,
  zernioProviderAdapter,
  type ProviderSubmission,
} from "@/lib/providerAdapters";

const submission: ProviderSubmission = {
  postId: "post_1",
  brandId: "corvo",
  channelId: "linkedin",
  title: "Validation post",
  content: "No live provider should be called in tests.",
  scheduledDate: "2026-06-12",
  scheduledTime: "09:00",
  timezone: "America/Los_Angeles",
  idempotencyKey: "intent_1:fingerprint",
};

describe("v2 provider adapters", () => {
  it("maps MVP channels to their provider routes", () => {
    expect(providerForChannel("linkedin")).toBe("buffer");
    expect(providerForChannel("reddit")).toBe("zernio");
    expect(providerForChannel("corvo-blog")).toBe("github-pr");
    expect(providerForChannel("youtube")).toBeNull();
  });

  it("redacts nested secret-bearing provider payloads", () => {
    const sanitized = sanitizeProviderPayload({
      id: "provider-post",
      accessToken: "secret-token",
      nested: {
        apiKey: "secret-key",
        keep: "visible",
      },
      events: [{ authorization: "Bearer abc", status: "ok" }],
    });

    expect(sanitized).toEqual({
      id: "provider-post",
      accessToken: "[redacted]",
      nested: {
        apiKey: "[redacted]",
        keep: "visible",
      },
      events: [{ authorization: "[redacted]", status: "ok" }],
    });
  });

  it("classifies provider failures into retry and review states", () => {
    expect(classifyProviderError({ status: 429 })).toBe("retryable-failure");
    expect(classifyProviderError({ status: 503 })).toBe("retryable-failure");
    expect(classifyProviderError({ status: 401 })).toBe("permanent-failure");
    expect(classifyProviderError({ message: "accepted but status unknown" })).toBe(
      "ambiguous"
    );
  });

  it("keeps Buffer validation behind server credentials and explicit approval", async () => {
    const fetchImpl = vi.fn();

    await expect(
      bufferProviderAdapter.validateConnection({
        env: {},
        liveProviderValidationApproved: true,
        fetchImpl,
      })
    ).resolves.toMatchObject({
      ok: false,
      reason: "BUFFER_API_KEY is not configured in server secret scope.",
    });

    await expect(
      bufferProviderAdapter.validateConnection({
        env: { BUFFER_API_KEY: "buffer-secret" },
        liveProviderValidationApproved: false,
        fetchImpl,
      })
    ).resolves.toMatchObject({
      ok: false,
      reason: "Live provider validation requires explicit approval.",
    });

    fetchImpl
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              account: {
                id: "account-1234567890",
                name: "butler.jake",
                organizations: [{ id: "org-1234567890", name: "My Organization" }],
              },
            },
          }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              channels: [
                {
                  id: "channel-1234567890",
                  name: "corvo-labs-us",
                  displayName: "Corvo Labs",
                  service: "linkedin",
                  isQueuePaused: false,
                },
              ],
            },
          }),
          { status: 200 }
        )
      );

    const approved = await bufferProviderAdapter.validateConnection({
      env: { BUFFER_API_KEY: "buffer-secret" },
      liveProviderValidationApproved: true,
      fetchImpl,
    });

    expect(approved).toMatchObject({
      ok: true,
      providerId: "buffer",
      accountLabel: "1 Buffer LinkedIn channel(s)",
      sanitizedResponse: {
        credential: "[server-secret-present]",
        account: {
          id: "acco...7890",
          name: "butler.jake",
        },
        organizationCount: 1,
        channelCount: 1,
        services: ["linkedin"],
        linkedinChannels: [
          {
            id: "chan...7890",
            name: "corvo-labs-us",
            displayName: "Corvo Labs",
            service: "linkedin",
            isQueuePaused: false,
          },
        ],
      },
    });
    expect(JSON.stringify(approved.sanitizedResponse)).not.toContain("buffer-secret");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl).toHaveBeenLastCalledWith(
      "https://api.buffer.com",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer buffer-secret",
        }),
      })
    );
  });

  it("validates Zernio Reddit account health with a read-only live-approved check", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            accounts: [
              {
                _id: "account-1234567890",
                platform: "reddit",
                username: "the_lower_db",
                displayName: "the_lower_db",
                profileUrl: "https://reddit.com/user/the_lower_db",
                isActive: true,
                profileId: { _id: "profile-1234567890", name: "Default" },
              },
            ],
          }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            accounts: [
              {
                accountId: "account-1234567890",
                platform: "reddit",
                username: "the_lower_db",
                displayName: "the_lower_db",
                status: "healthy",
                tokenStatus: { valid: true },
                permissions: { canPost: true, missingRequired: [] },
                issues: [],
              },
            ],
          }),
          { status: 200 }
        )
      );

    const result = await zernioProviderAdapter.validateConnection({
      env: { ZERNIO_API_KEY: "zernio-secret" },
      liveProviderValidationApproved: true,
      fetchImpl,
    });

    expect(result).toMatchObject({
      ok: true,
      providerId: "zernio",
      accountLabel: "1 Zernio Reddit account(s)",
      sanitizedResponse: {
        credential: "[server-secret-present]",
        accountCount: 1,
        redditAccounts: [
          {
            id: "acco...7890",
            platform: "reddit",
            username: "the_lower_db",
            displayName: "the_lower_db",
            profileUrl: "https://reddit.com/user/the_lower_db",
            isActive: true,
          },
        ],
        healthStatus: 200,
        redditHealth: [
          {
            accountId: "acco...7890",
            platform: "reddit",
            username: "the_lower_db",
            status: "healthy",
            tokenValid: true,
            canPost: true,
            missingRequired: [],
            issues: [],
          },
        ],
      },
    });
    expect(JSON.stringify(result.sanitizedResponse)).not.toContain("zernio-secret");
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://zernio.com/api/v1/accounts?platform=reddit",
      expect.objectContaining({
        headers: {
          Authorization: "Bearer zernio-secret",
        },
      })
    );
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://zernio.com/api/v1/accounts/health?platform=reddit",
      expect.objectContaining({
        headers: {
          Authorization: "Bearer zernio-secret",
        },
      })
    );
  });

  describe("zernio provider contract", () => {
    const redditSubmission: ProviderSubmission = {
      ...submission,
      brandId: "lower-db",
      channelId: "reddit",
      title: "Reddit contract title",
      subreddit: "testingground4bots",
    };
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ accounts: [] }), { status: 200 }));

    runProviderAdapterContractSuite(zernioProviderAdapter, {
      submission: redditSubmission,
      approvedContext: (overrides = {}) => ({
        env: {
          ZERNIO_API_KEY: "zernio-secret",
          ZERNIO_LIVE_SUBMISSION: "approved",
          ...overrides,
        },
        liveProviderValidationApproved: true,
        fetchImpl,
      }),
      blockedContext: (overrides = {}) => ({
        env: {
          ZERNIO_API_KEY: "zernio-secret",
          ...overrides,
        },
        liveProviderValidationApproved: false,
        fetchImpl,
      }),
    });
  });

  it("submits to Zernio when live submission is approved", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            accounts: [
              {
                _id: "account-1234567890",
                platform: "reddit",
                username: "the_lower_db",
                displayName: "the_lower_db",
                isActive: true,
              },
            ],
          }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            post: {
              _id: "zernio-post-1234567890",
              status: "scheduled",
              scheduledFor: "2026-06-13T16:00:00.000Z",
            },
          }),
          { status: 200 }
        )
      );

    const result = await zernioProviderAdapter.submit(
      {
        ...submission,
        brandId: "lower-db",
        channelId: "reddit",
        title: "Reddit validation title",
        subreddit: "testingground4bots",
      },
      {
        env: {
          ZERNIO_API_KEY: "zernio-secret",
          ZERNIO_LIVE_SUBMISSION: "approved",
        },
        liveProviderValidationApproved: true,
        fetchImpl,
      }
    );

    expect(result).toMatchObject({
      ok: true,
      status: "success",
      providerStateStatus: "submitted",
      providerPostId: "zernio-post-1234567890",
    });
    expect(JSON.stringify(result.sanitizedResponse)).not.toContain("zernio-secret");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl).toHaveBeenLastCalledWith(
      "https://zernio.com/api/v1/posts",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer zernio-secret",
        }),
      })
    );
  });

  it("blocks Zernio submit until ZERNIO_LIVE_SUBMISSION is approved", async () => {
    const fetchImpl = vi.fn();
    const result = await zernioProviderAdapter.submit(
      { ...submission, channelId: "reddit", brandId: "lower-db", title: "Title" },
      {
        env: { ZERNIO_API_KEY: "zernio-secret" },
        liveProviderValidationApproved: true,
        fetchImpl,
      }
    );

    expect(result).toMatchObject({
      ok: false,
      status: "unavailable",
      reason: "Zernio live submission requires ZERNIO_LIVE_SUBMISSION=approved.",
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("deletes a Zernio post on cancel intent", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          post: { _id: "zernio-post-1234567890", status: "cancelled" },
        }),
        { status: 200 }
      )
    );

    const result = await zernioProviderAdapter.recordCancelOrUnpublishIntent(
      {
        ...submission,
        channelId: "reddit",
        brandId: "lower-db",
        providerPostId: "zernio-post-1234567890",
      },
      "cancel",
      {
        env: {
          ZERNIO_API_KEY: "zernio-secret",
          ZERNIO_LIVE_SUBMISSION: "approved",
        },
        liveProviderValidationApproved: true,
        fetchImpl,
      }
    );

    expect(result).toMatchObject({
      ok: true,
      status: "success",
      providerStateStatus: "cancel-intent-recorded",
      providerPostId: "zernio-post-1234567890",
    });
  });

  it("classifies moderation failures as needs-review on refresh", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: { message: "Automod flagged this post for manual review" },
        }),
        { status: 400 }
      )
    );

    const result = await zernioProviderAdapter.refreshStatus("zernio-post-1234567890", {
      env: {
        ZERNIO_API_KEY: "zernio-secret",
        ZERNIO_LIVE_SUBMISSION: "approved",
      },
      liveProviderValidationApproved: true,
      fetchImpl,
    });

    expect(result).toMatchObject({
      ok: false,
      status: "permanent-failure",
      providerStateStatus: "needs-review",
    });
  });

  describe("buffer provider contract", () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ data: {} }), { status: 200 }));
    runProviderAdapterContractSuite(bufferProviderAdapter, {
      approvedContext: (overrides = {}) => ({
        env: {
          BUFFER_API_KEY: "buffer-secret",
          BUFFER_LIVE_SUBMISSION: "approved",
          ...overrides,
        },
        liveProviderValidationApproved: true,
        fetchImpl,
      }),
      blockedContext: (overrides = {}) => ({
        env: {
          BUFFER_API_KEY: "buffer-secret",
          ...overrides,
        },
        liveProviderValidationApproved: false,
        fetchImpl,
      }),
    });
  });

  it("submits to Buffer when live submission is approved", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              account: {
                organizations: [{ id: "org-1", name: "Org" }],
              },
            },
          }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              channels: [
                {
                  id: "channel-corvo",
                  name: "corvo-labs-us",
                  displayName: "Corvo Labs",
                  service: "linkedin",
                  isQueuePaused: false,
                },
              ],
            },
          }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              createPost: {
                post: {
                  id: "buffer-post-1234567890",
                  status: "scheduled",
                  dueAt: "2026-06-13T16:00:00.000Z",
                  shareMode: "customScheduled",
                },
              },
            },
          }),
          { status: 200 }
        )
      );

    const result = await bufferProviderAdapter.submit(submission, {
      env: {
        BUFFER_API_KEY: "buffer-secret",
        BUFFER_LIVE_SUBMISSION: "approved",
      },
      liveProviderValidationApproved: true,
      fetchImpl,
    });

    expect(result).toMatchObject({
      ok: true,
      status: "success",
      providerStateStatus: "submitted",
      providerPostId: "buffer-post-1234567890",
    });
    expect(JSON.stringify(result.sanitizedResponse)).not.toContain("buffer-secret");
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("blocks Buffer submit until BUFFER_LIVE_SUBMISSION is approved", async () => {
    const fetchImpl = vi.fn();
    const result = await bufferProviderAdapter.submit(submission, {
      env: { BUFFER_API_KEY: "buffer-secret" },
      liveProviderValidationApproved: true,
      fetchImpl,
    });

    expect(result).toMatchObject({
      ok: false,
      status: "unavailable",
      reason: "Buffer live submission requires BUFFER_LIVE_SUBMISSION=approved.",
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("deletes a Buffer post on cancel intent", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: {
            deletePost: { id: "buffer-post-1234567890" },
          },
        }),
        { status: 200 }
      )
    );

    const result = await bufferProviderAdapter.recordCancelOrUnpublishIntent(
      { ...submission, providerPostId: "buffer-post-1234567890" },
      "cancel",
      {
        env: {
          BUFFER_API_KEY: "buffer-secret",
          BUFFER_LIVE_SUBMISSION: "approved",
        },
        liveProviderValidationApproved: true,
        fetchImpl,
      }
    );

    expect(result).toMatchObject({
      ok: true,
      status: "success",
      providerStateStatus: "cancel-intent-recorded",
      providerPostId: "buffer-post-1234567890",
    });
  });

  it("keeps Mock Provider behavior available without credentials", async () => {
    await expect(mockProviderAdapter.validateConnection({ env: {} })).resolves.toMatchObject({
      ok: true,
      providerId: "mock",
    });

    await expect(mockProviderAdapter.submit(submission, { env: {} })).resolves.toMatchObject({
      ok: true,
      status: "success",
      providerStateStatus: "submitted",
      providerPostId: "mock-post_1",
    });
  });

  it("returns an unavailable adapter for unimplemented provider ids", async () => {
    const adapter = adapterForProvider("postiz-oauth");
    await expect(adapter.submit(submission, { env: {} })).resolves.toMatchObject({
      ok: false,
      status: "unavailable",
      reason: "postiz-oauth adapter is not implemented.",
    });
  });
});
