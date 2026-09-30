import { describe, it, expect, vi, afterEach } from "vitest";
import { capacityProjection, type QueueObservation } from "../queueCapacity";
import { readBufferQueue } from "../readBufferQueue";
import { scheduleToUtcIso, calendarDayOffset } from "../schedules";
const destination = {
  channelId: "page",
  organizationId: "org",
  displayName: "Fixture Page",
  handle: "fixture",
  accountType: "page",
  disconnected: false,
  locked: false,
  queuePaused: false,
  flagsVerified: true,
  checkedAt: Date.now(),
  firstComment: {
    value: "unknown" as const,
    source: "unknown" as const,
    checkedAt: Date.now(),
    evidence: "Fixture",
  },
};
const observation = (
  posts: QueueObservation["providerPosts"] = [],
  rest: Partial<QueueObservation> = {},
): QueueObservation => ({
  identity: '["org","page"]',
  channelId: "page",
  organizationId: "org",
  checkedAt: Date.now(),
  complete: true,
  organizationLimit: 100,
  providerPosts: posts,
  ...rest,
});
const reservation = (postId: string) => ({
  postId,
  status: "reserved",
  channelId: "page",
  organizationId: "org",
});
afterEach(() => vi.unstubAllGlobals());
describe("capacity evidence", () => {
  it("allocates eight backlog slots after two local launch reservations", () =>
    expect(
      capacityProjection(
        observation(),
        10,
        [reservation("launch"), reservation("follow-up")],
        [],
      ),
    ).toMatchObject({ availableForBacklog: 8, channelReserved: 2 }));
  it("counts external posts, other channels, and organization ceiling independently", () =>
    expect(
      capacityProjection(
        observation(
          [
            { id: "manual", channelId: "page", status: "scheduled" },
            { id: "external", channelId: "other", status: "sending" },
          ],
          { organizationLimit: 3 },
        ),
        10,
        [],
        [],
      ),
    ).toMatchObject({
      channelUsed: 1,
      organizationUsed: 2,
      channelFree: 9,
      organizationFree: 1,
      availableForBacklog: 1,
    }));
  it.each([
    null,
    observation([], { complete: false }),
    observation([], { checkedAt: Date.now() - 400000 }),
    observation([], { organizationLimit: undefined }),
  ])("holds unknown/incomplete/stale evidence", (obs) =>
    expect(capacityProjection(obs, 10, [], []).availableForBacklog).toBeNull(),
  );
  it("holds unknown channel ceiling", () =>
    expect(
      capacityProjection(observation(), undefined, [], []).unknown,
    ).toMatch(/per-channel/));
  it("counts an uncertain claim once, then its confirmed provider row once", () => {
    const claims = [
      {
        postId: "launch",
        channelId: "page",
        organizationId: "org",
        status: "uncertain" as const,
      },
    ];
    expect(
      capacityProjection(observation(), 10, [reservation("launch")], claims),
    ).toMatchObject({
      channelClaims: 1,
      channelReserved: 0,
      availableForBacklog: 9,
    });
    expect(
      capacityProjection(
        observation([
          { id: "receipt", channelId: "page", status: "scheduled" },
        ]),
        10,
        [
          {
            ...reservation("launch"),
            status: "consumed",
            providerPostId: "receipt",
          },
        ],
        [{ ...claims[0], status: "confirmed", providerPostId: "receipt" }],
      ),
    ).toMatchObject({
      channelUsed: 1,
      channelClaims: 0,
      channelReserved: 0,
      availableForBacklog: 9,
    });
  });
  it("never permits a negative available count", () =>
    expect(
      capacityProjection(
        observation(),
        1,
        [reservation("one"), reservation("two")],
        [],
      ).availableForBacklog,
    ).toBe(0));
});
describe("bounded provider queue reads", () => {
  function response(data: unknown) {
    return new Response(JSON.stringify({ data }), {
      headers: { RateLimit: '"minute";r=90;t=50, "day";r=200;t=5000' },
    });
  }
  function page(nodes: unknown[], hasNextPage: boolean, endCursor?: string) {
    return response({
      posts: {
        edges: nodes.map((node) => ({ node })),
        pageInfo: { hasNextPage, endCursor },
      },
    });
  }
  it("reads all pages with external/manual posts and deduplicates overlap without mutation", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        response({
          account: {
            organizations: [{ id: "org", limits: { scheduledPosts: 100 } }],
          },
        }),
      )
      .mockResolvedValueOnce(
        page(
          [{ id: "manual", channelId: "page", status: "scheduled" }],
          true,
          "cursor",
        ),
      )
      .mockResolvedValueOnce(
        page(
          [
            { id: "manual", channelId: "page", status: "scheduled" },
            { id: "external", channelId: "other", status: "sending" },
          ],
          false,
        ),
      );
    vi.stubGlobal("fetch", fetch);
    const out = await readBufferQueue(destination, {
      env: { BUFFER_API_KEY: "fixture" },
      requestBudget: { remaining: 22 },
    });
    expect(out).toMatchObject({
      complete: true,
      organizationLimit: 100,
      providerPosts: [{ id: "manual" }, { id: "external" }],
      apiWindows: [
        { policy: "minute", remaining: 90 },
        { policy: "day", remaining: 200 },
      ],
    });
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(
      fetch.mock.calls.every(
        ([, init]) => !String(init.body).includes("mutation"),
      ),
    ).toBe(true);
    expect(JSON.parse(fetch.mock.calls[2][1].body).variables.after).toBe(
      "cursor",
    );
  });
  it("holds partial reads on quota exhaustion and cursor cycles", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(response({ account: { organizations: [] } }))
      .mockResolvedValue(
        page(
          [{ id: "manual", channelId: "page", status: "scheduled" }],
          true,
          "same",
        ),
      );
    vi.stubGlobal("fetch", fetch);
    const out = await readBufferQueue(destination, {
      env: { BUFFER_API_KEY: "fixture" },
      requestBudget: { remaining: 2 },
    });
    expect(out.complete).toBe(false);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(out.providerPosts).toHaveLength(1);
  });
});
describe("exact calendar schedules", () => {
  it("offsets calendar dates across DST without shifting the local clock", () => {
    expect(
      calendarDayOffset("2030-03-09", 1, "09:00", "America/Los_Angeles"),
    ).toMatchObject({
      scheduledDate: "2030-03-10",
      dueAt: "2030-03-10T16:00:00.000Z",
    });
    expect(
      calendarDayOffset("2030-11-02", 1, "09:00", "America/Los_Angeles"),
    ).toMatchObject({
      scheduledDate: "2030-11-03",
      dueAt: "2030-11-03T17:00:00.000Z",
    });
  });
  it.each([
    { scheduledDate: "2030-02-30", scheduledTime: "09:00", timezone: "UTC" },
    {
      scheduledDate: "2030-03-10",
      scheduledTime: "02:30",
      timezone: "America/Los_Angeles",
    },
    {
      scheduledDate: "2030-11-03",
      scheduledTime: "01:30",
      timezone: "America/Los_Angeles",
    },
    { scheduledDate: "2030-10-07", scheduledTime: "09:00", timezone: "PST" },
  ])("rejects invalid or ambiguous local times", (value) =>
    expect(() => scheduleToUtcIso(value)).toThrow(),
  );
});

it('does not count a reservation again when its confirmed claim appears in provider observations',()=>{
 const result=capacityProjection(observation([{id:'receipt',channelId:'page',status:'scheduled'}]),10,[reservation('launch')],[{postId:'launch',providerPostId:'receipt',status:'confirmed',channelId:'page',organizationId:'org'}]);
 expect(result).toMatchObject({channelUsed:1,channelClaims:0,channelReserved:0,availableForBacklog:9});
});
