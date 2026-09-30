import { test, expect } from "@playwright/test";
test("canonical composer reviews final links, independent DST offsets and separate publication evidence", async ({
  page,
}) => {
  const calls: string[] = [];
  let live = false;
  let resolved = false;
  let expired = false;
  const url = "https://corvolabs.com/blog/2030-03-09-fixture";
  const article = {
    _id: "fixture-article",
    userId: "fixture-editor",
    brandId: "corvo",
    channelId: "corvo-blog",
    title: "Prepared parent article",
    content: "Expected article copy.",
    blogPublicationIntent: "published",
    scheduledDate: "2030-03-09",
    scheduledTime: "09:00",
    timezone: "America/Los_Angeles",
    prUrl: "https://github.com/fixture/site/pull/7",
    blogArtifact: { canonicalUrl: url },
    blogPrStatus: "merged",
  };
  function post() {
    return {
      _id: "fixture-companion",
      userId: "fixture-editor",
      brandId: "corvo",
      channelId: "linkedin",
      platformId: "linkedin",
      title: "Forward drip companion",
      content: resolved
        ? `Exact 42% copy.\n${url}`
        : "Exact 42% copy.\n{{articleUrl}}",
      status: "scheduled",
      approvalState: resolved ? "unapproved" : "approved",
      scheduledDate: expired ? "2000-01-01" : "2030-10-07",
      scheduledTime: "09:00",
      timezone: "America/Los_Angeles",
      createdAt: 1,
      updatedAt: 1,
      companionLink: {
        articlePostId: article._id,
        placement: "body",
        ...(resolved ? { canonicalUrl: url, resolvedPlacement: "body" } : {}),
      },
    };
  }
  await page.routeWebSocket(/\/api\/.*\/sync/, (socket) => {
    const qs = new Map<number, { queryId: number; udfPath: string }>();
    let version = { querySet: 0, identity: 0, ts: "AAAAAAAAAAA=" };
    let tick = 0;
    function val(path: string) {
      if (path === "publishing:listBrands")
        return [{ brandId: "corvo", name: "Corvo Labs" }];
      if (path === "publishing:getPostById") return post();
      if (path === "publishing:listCalendarItems")
        return [
          {
            post: post(),
            intent: {
              _id: "fixture-intent",
              scheduledDate: post().scheduledDate,
              scheduledTime: "09:00",
              timezone: "America/Los_Angeles",
            },
            providerState: { status: "not-submitted" },
            attemptCount: 0,
          },
        ];
      if (path === "publishing:bufferLiveSubmissionEnabled")
        return { enabled: false };
      if (path === "series:list") return [];
      if (path === "articleDependencies:candidates")
        return { posts: [article], partial: false };
      if (path === "articleDependencies:details")
        return {
          post: post(),
          article,
          receipt: {
            evidence: {
              checkedAt: Date.now(),
              prState: "merged",
              headSha: "fixture-head",
              mergeSha: "fixture-merge",
              deploymentState: live ? "success" : "pending",
              deploymentSha: "fixture-merge",
              environment: "Production",
              availability: live ? "verified" : "unverified",
            },
          },
          hold: expired
            ? "Scheduled time has passed; explicitly review a new date."
            : live
              ? null
              : "Production deployment is pending.",
          proposal: { content: `Exact 42% copy.\n${url}` },
          version: "fixture-reviewed-version",
        };
      return null;
    }
    function send(querySet = version.querySet) {
      const ts = Buffer.alloc(8);
      ts.writeBigUInt64LE(BigInt(++tick));
      const endVersion = { ...version, querySet, ts: ts.toString("base64") };
      socket.send(
        JSON.stringify({
          type: "Transition",
          startVersion: version,
          endVersion,
          modifications: [...qs.values()].map((q) => ({
            type: "QueryUpdated",
            queryId: q.queryId,
            value: val(q.udfPath),
            journal: null,
            logLines: [],
          })),
        }),
      );
      version = endVersion;
    }
    socket.onMessage((raw) => {
      const m = JSON.parse(String(raw));
      if (m.type === "Authenticate") {
        const startVersion = version;
        version = { ...version, identity: version.identity + 1 };
        socket.send(
          JSON.stringify({
            type: "Transition",
            startVersion,
            endVersion: version,
            modifications: [],
          }),
        );
      }
      if (m.type === "ModifyQuerySet") {
        for (const q of m.modifications) {
          if (q.type === "Add") qs.set(q.queryId, q);
          else qs.delete(q.queryId);
        }
        send(m.newVersion);
      }
      if (m.type === "Mutation" || m.type === "Action") {
        calls.push(m.udfPath);
        if (m.udfPath === "articleDependencies:applyLink") resolved = true;
        if (m.udfPath === "articlePublication:refresh") live = true;
        socket.send(
          JSON.stringify({
            type: m.type === "Action" ? "ActionResponse" : "MutationResponse",
            requestId: m.requestId,
            success: true,
            result: m.type === "Action" ? { recorded: true } : null,
            ...(m.type === "Mutation" ? { ts: version.ts } : {}),
            logLines: [],
          }),
        );
        send();
      }
    });
  });
  await page.goto("/?postId=fixture-companion");
  const detail = page.getByLabel("Publishing item detail");
  const dependency = detail.getByRole("region", {
    name: "Article publication dependency",
  });
  await expect(
    dependency.getByText("Held: Production deployment is pending."),
  ).toBeVisible();
  await expect(
    dependency.getByText("pending · Production · commit fixture-merge"),
  ).toBeVisible();
  await dependency.getByText("Review full canonical link proposal").click();
  await expect(
    dependency.getByText(`Exact 42% copy.\n${url}`, { exact: true }),
  ).toBeVisible();
  await dependency
    .getByRole("button", { name: "Apply reviewed link proposal" })
    .click();
  await expect(
    detail.getByRole("textbox", { name: "Content", exact: true }),
  ).toHaveValue(`Exact 42% copy.\n${url}`);
  await dependency.getByText("Preview a local calendar-day offset").click();
  await dependency.getByLabel("Calendar days").fill("1");
  await expect(
    dependency.getByText(
      /2030-03-10 09:00 America\/Los_Angeles · UTC 2030-03-10T16:00/,
    ),
  ).toBeVisible();
  await expect(
    detail.getByRole("textbox", { name: "Date", exact: true }),
  ).toHaveValue("2030-10-07");
  await dependency
    .getByRole("button", { name: "Check article publication (read only)" })
    .click();
  await expect(
    dependency.getByText("success · Production · commit fixture-merge"),
  ).toBeVisible();
  await expect(dependency.getByText(/verified · checked/)).toBeVisible();
  await page.screenshot({
    path: "test-results/article-separate-publication-proof.png",
    fullPage: true,
  });
  expired = true;
  await page.reload();
  await expect(
    dependency.getByText(/Held: Scheduled time has passed/),
  ).toBeVisible();
  expect(calls).toEqual([
    "articleDependencies:applyLink",
    "articlePublication:refresh",
  ]);
});
