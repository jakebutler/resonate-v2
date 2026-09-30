import { test, expect } from "@playwright/test";
import { mockConvexSync } from "./test-support/mockConvexSync";
test("durable full review selects three then approves exactly two and material composer edit clears only one", async ({
  page,
}) => {
  const calls: string[] = [];
  let selected: string[] = [];
  let revision = 0;
  let packetIds: string[] = [];
  let approved = false;
  let edited = false;
  const posts = Array.from({ length: 3 }, (_, n) => ({
    _id: `post-${n}`,
    userId: "fixture-editor",
    brandId: "corvo",
    channelId: n === 0 ? "corvo-blog" : "linkedin",
    platformId: n === 0 ? "corvo-blog" : "linkedin",
    title: `Exact review ${n}`,
    content:
      n === 1 && edited
        ? "Corrected material copy 43%"
        : `Complete immutable 42% copy ${n}.\nNumber 1234 and https://example.com/source`,
    timezone: "America/Los_Angeles",
    scheduledDate: "2030-10-07",
    scheduledTime: "09:00",
    approvalState: "unapproved",
    status: "draft",
    blogPublicationIntent: "draft",
    coverImageAlt: "Fixture hero alt",
    createdAt: 1,
    updatedAt: 1,
  }));
  function current(n: number) {
    return {
      ...posts[n],
      content:
        n === 1 && edited ? "Corrected material copy 43%" : posts[n].content,
      approvalState:
        approved && n > 0 && !(n === 1 && edited) ? "approved" : "unapproved",
    };
  }
  function value(path: string) {
    if (path === "series:list")
      return [
        {
          _id: "series-fixture",
          title: "Exact three-post series",
          brandId: "corvo",
          revision: 1,
        },
      ];
    if (path === "series:get")
      return {
        _id: "series-fixture",
        title: "Exact three-post series",
        brandId: "corvo",
        revision: 1,
      };
    if (path === "series:entries")
      return {
        page: [
          {
            _id: "entry-fixture",
            sequence: 1,
            articlePostId: "post-0",
            companionPostIds: ["post-1", "post-2"],
            posts: posts.map((_, n) => ({
              post: current(n),
              providerState: { status: "not-submitted" },
            })),
          },
        ],
        isDone: true,
        continueCursor: "",
      };
    if (path === "series:picker")
      return { page: [], isDone: true, continueCursor: "" };
    if (path === "seriesReview:selection")
      return { _id: "selection-fixture", postIds: selected, revision };
    if (path === "seriesReview:packet")
      return packetIds.length
        ? {
            packet: {
              _id: "packet-fixture",
              createdAt: 1,
              selectionRevision: packetIds.length === 3 ? 3 : revision,
              status: approved ? "approved" : "reviewed",
            },
            stale: selected.join() !== packetIds.join() || edited,
            rows: packetIds.map((id) => {
              const n = Number(id.slice(-1));
              const p = current(n);
              return {
                _id: `row-${n}`,
                postId: id,
                snapshot: {
                  post: p,
                  finalContent: posts[n].content,
                  destination: n
                    ? {
                        displayName: "Corvo Labs Page",
                        handle: "corvo-labs-us",
                        accountType: "page",
                        channelId: "fixture-page",
                        organizationId: "fixture-org",
                        firstComment: {
                          value: "unsupported",
                          source: "operator-confirmed",
                        },
                      }
                    : null,
                  dueAt: "2030-10-07T16:00:00.000Z",
                  holds: n
                    ? ["Article publication unverified; no release authority."]
                    : [],
                  approvalError: null,
                  warnings: ["Unvetted source warning remains visible."],
                  citations: ["source-passage-42"],
                  sourceResearchBriefId: "brief-fixture",
                },
                staleReason:
                  n === 1 && edited
                    ? "Content or editorial metadata changed."
                    : null,
                heroUrl: null,
                ...(approved && n > 0
                  ? { actor: "fixture-editor", approvedAt: 1 }
                  : {}),
              };
            }),
          }
        : null;
    if (path === "publishing:listBrands")
      return [{ brandId: "corvo", name: "Corvo Labs" }];
    if (path === "publishing:getPostById") return current(1);
    if (path === "publishing:listCalendarItems")
      return posts.map((_, n) => ({
        post: current(n),
        intent: {
          _id: `intent-${n}`,
          scheduledDate: "2030-10-07",
          scheduledTime: "09:00",
          timezone: "America/Los_Angeles",
        },
        providerState: { status: "not-submitted" },
        attemptCount: 0,
      }));
    if (path === "publishing:bufferLiveSubmissionEnabled")
      return { enabled: false };
    return null;
  }
  await mockConvexSync(page, {
    value,
    mutation: (path, a) => {
      calls.push(path);

      let result: unknown = null;
      if (path === "seriesReview:select") {
        selected = a.postIds;
        revision++;
        result = "selection-fixture";
      }
      if (path === "seriesReview:prepare") {
        packetIds = [...selected];
        result = "packet-fixture";
      }
      if (path === "seriesReview:approve") {
        approved = true;
        result = { approved: true };
      }
      if (path === "publishing:updateContent") edited = true;
      return result;
    },
  });
  await page.goto("/series?seriesId=series-fixture");
  let panel = page.getByRole("region", { name: "Selected editorial review" });
  for (let n = 0; n < 3; n++) {
    const cb = panel.getByRole("checkbox", {
      name: new RegExp(`Exact review ${n}`),
    });
    await cb.focus();
    await page.keyboard.press("Space");
    await expect(cb).toBeChecked();
  }
  await panel
    .getByRole("button", { name: "Prepare selected review packet" })
    .click();
  await expect(
    panel.getByText(/Packet packet-fixture · 3 selected/),
  ).toBeVisible();
  await expect(
    panel.getByText(
      "Complete immutable 42% copy 1.\nNumber 1234 and https://example.com/source",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    panel.getByText(/first comment unsupported/).first(),
  ).toBeVisible();
  await expect(
    panel.getByText(/Unvetted source warning/).first(),
  ).toBeVisible();
  await panel.getByRole("checkbox", { name: /Exact review 0/ }).click();
  await expect(
    panel.getByRole("checkbox", { name: /Exact review 0/ }),
  ).not.toBeChecked();
  await expect(
    panel.getByRole("button", { name: "Approve 3 selected versions" }),
  ).toBeDisabled();
  await page.reload();
  panel = page.getByRole("region", { name: "Selected editorial review" });
  await expect(
    panel.getByRole("checkbox", { name: /Exact review 1/ }),
  ).toBeChecked();
  await panel
    .getByRole("button", { name: "Prepare selected review packet" })
    .click();
  await panel
    .getByRole("button", { name: "Approve 2 selected versions" })
    .click();
  await expect(
    panel.getByText(/Approved exactly 2 selected editorial versions/),
  ).toBeVisible();
  await expect(
    panel.getByRole("checkbox", { name: /Exact review 0.*unapproved/ }),
  ).not.toBeChecked();
  await page.screenshot({
    path: "test-results/series-selected-approval.png",
    fullPage: true,
  });
  await panel
    .getByRole("link", { name: "Edit Exact review 1 in composer" })
    .click();
  await page
    .getByRole("textbox", { name: "Content", exact: true })
    .fill("Corrected material copy 43%");
  await page.getByRole("button", { name: "Save Composer Changes" }).click();
  await page.goto("/series?seriesId=series-fixture");
  panel = page.getByRole("region", { name: "Selected editorial review" });
  await expect(
    panel.getByRole("checkbox", { name: /Exact review 1.*unapproved/ }),
  ).toBeChecked();
  await expect(
    panel.getByRole("checkbox", { name: /Exact review 2.*approved/ }),
  ).toBeChecked();
  expect(calls.filter((c) => c.includes("approve"))).toEqual([
    "seriesReview:approve",
  ]);
  expect(
    calls.every(
      (c) => c.startsWith("seriesReview:") || c === "publishing:updateContent",
    ),
  ).toBe(true);
});
