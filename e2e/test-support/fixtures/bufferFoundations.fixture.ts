import { registerSyncFixture, type SyncFixture } from "./registry";

export type BufferFoundationsFixture = {
  /** Every mutation udfPath, in wire order. */
  calls: string[];
};

registerSyncFixture<BufferFoundationsFixture>("buffer-foundations", async (page) => {
  const calls: string[] = [];
  const destination = {
    channelId: "fixture-company-page",
    organizationId: "fixture-org",
    displayName: "Corvo Labs",
    handle: "corvo-labs-us",
    accountType: "Page",
    profileUrl: "https://www.linkedin.com/company/fixture",
    disconnected: false,
    locked: false,
    queuePaused: false,
    flagsVerified: true,
    checkedAt: Date.now(),
    firstComment: {
      value: "unsupported",
      source: "provider-observation",
      checkedAt: Date.now(),
      evidence: "Sanitized plan restriction fixture",
    },
  };
  let post = {
    _id: "fixture-social",
    _creationTime: 1,
    userId: "fixture-editor",
    brandId: "corvo",
    channelId: "linkedin",
    platformId: "linkedin",
    title: "Linked companion",
    content: "Exact approved companion copy",
    linkedinFirstComment: "https://corvolabs.com/blog/fixture",
    status: "queued",
    approvalState: "approved",
    scheduledDate: "2030-10-07",
    scheduledTime: "09:00",
    timezone: "America/Los_Angeles",
    contentFingerprint: "fixture",
    createdAt: 1,
    updatedAt: 1,
  };
  const state = {
    _id: "fixture-state",
    providerId: "buffer",
    status: "queued",
    providerPostId: "fixture-provider-receipt",
    lastCheckedAt: Date.now(),
    dueAt: "2030-10-07T16:00:00.000Z",
    destination,
  };
  await page.route("**/api/providers/validate", (r) =>
    r.fulfill({
      json: { platforms: [], checkedAt: new Date().toISOString() },
    }),
  );
  return {
    fixture: { calls },
    handlers: {
      value: (path, args) => {
        if (path === "publishing:listBrands")
          return [{ brandId: "corvo", name: "Corvo Labs" }];
        if (path === "publishing:getPostById") return post;
        if (path === "publishing:listCalendarItems")
          return [
            {
              post,
              intent: {
                _id: "fixture-intent",
                scheduledDate: post.scheduledDate,
                scheduledTime: post.scheduledTime,
                timezone: post.timezone,
              },
              providerState: state,
              attemptCount: 1,
            },
          ];
        if (path === "publishing:bufferLiveSubmissionEnabled")
          return { enabled: false };
        if (path === "series:list") return [];
        if (path === "bufferDestinations:get")
          return (args as { brandId: string }).brandId === "corvo"
            ? { destination, updatedAt: Date.now() }
            : null;
        if (path === "bufferDelivery:history")
          return {
            state,
            receipts: [
              {
                _id: "receipt-1",
                createdAt: Date.now(),
                action: "provider.buffer_submit",
                summary: "Sanitized scheduling receipt",
                metadata: { status: "scheduled", dueAt: state.dueAt },
              },
            ],
          };
        return null;
      },
      mutation: (path) => {
        calls.push(path);
        if (path === "bufferDestinations:bodyLinkAlternative")
          post = {
            ...post,
            content: `${post.content}\n\n${post.linkedinFirstComment}`,
            linkedinFirstComment: "",
            approvalState: "unapproved",
            status: "draft",
          };
        return null;
      },
    },
  } satisfies SyncFixture<BufferFoundationsFixture>;
});
