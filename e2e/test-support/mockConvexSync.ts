import type { Page } from "@playwright/test";

type Args = Record<string, unknown>;

/**
 * Thrown by a `mutation` (or `action`) handler to reject the mutation the way
 * a Convex deployment does: the client's mutation promise rejects, any
 * optimistic local query patch rolls back, and the error carries the given
 * message. Handlers must not throw anything else.
 */
export class SyncMutationFailure extends Error {}

/**
 * Handlers a spec (or a named fixture module) supplies to fake the Convex
 * sync channel. `value` answers every subscribed query; `mutation` and
 * `action` answer client mutations/actions with their return value sent
 * verbatim as the response result; `onQuery` observes each newly
 * subscribed query. A mutation/action handler may return a promise (the
 * harness awaits it and answers only when it settles) or throw — a thrown
 * error is answered as a failed response whose message the real Convex
 * client surfaces as the rejection reason, so specs can exercise failure
 * UI. Throw a `SyncMutationFailure` for an expected failure under test.
 */
export type SyncHandlers = {
  value: (path: string, args: Args) => unknown;
  onQuery?: (path: string, args: Args) => void;
  mutation?:
    | ((path: string, args: Args) => unknown)
    | ((path: string, args: Args) => Promise<unknown>);
  action?: (path: string, args: Args) => unknown;
};

export type SyncVersion = { querySet: number; identity: number; ts: string };

// Local sync transport only: fixtures never reach a Convex deployment.
export async function mockConvexSync(page: Page, handlers: SyncHandlers) {
  await page.routeWebSocket(/\/api\/.*\/sync/, (socket) => {
    const queries = new Map<
      number,
      { queryId: number; udfPath: string; args: Args[] }
    >();
    let version: SyncVersion = { querySet: 0, identity: 0, ts: "AAAAAAAAAAA=" };
    let tick = 0;
    function send(querySet = version.querySet) {
      const ts = Buffer.alloc(8);
      ts.writeBigUInt64LE(BigInt(++tick));
      const endVersion = { ...version, querySet, ts: ts.toString("base64") };
      socket.send(
        JSON.stringify({
          type: "Transition",
          startVersion: version,
          endVersion,
          modifications: [...queries.values()].map((q) => ({
            type: "QueryUpdated",
            queryId: q.queryId,
            value: handlers.value(q.udfPath, q.args[0] ?? {}),
            journal: null,
            logLines: [],
          })),
        }),
      );
      version = endVersion;
    }
    let tail: Promise<void> = Promise.resolve();
    const handle = async (raw: unknown) => {
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
          if (q.type === "Add") {
            queries.set(q.queryId, q);
            handlers.onQuery?.(q.udfPath, q.args[0] ?? {});
          } else queries.delete(q.queryId);
        }
        send(m.newVersion);
      }
      if (m.type === "Mutation") {
        if (!handlers.mutation)
          throw new Error(`Unexpected fixture mutation: ${m.udfPath}`);
        try {
          const result = await handlers.mutation(m.udfPath, m.args[0] ?? {});
          socket.send(
            JSON.stringify({
              type: "MutationResponse",
              requestId: m.requestId,
              success: true,
              result,
              ts: version.ts,
              logLines: [],
            }),
          );
        } catch (e) {
          // Real failure wire shape: the Convex client reads the rejection
          // message from `result` when `success` is false.
          socket.send(
            JSON.stringify({
              type: "MutationResponse",
              requestId: m.requestId,
              success: false,
              result: e instanceof Error ? e.message : String(e),
              logLines: [],
            }),
          );
        }
        send();
      }
      if (m.type === "Action") {
        if (!handlers.action)
          throw new Error(`Unexpected fixture action: ${m.udfPath}`);
        const result = handlers.action(m.udfPath, m.args[0] ?? {});
        // Action responses carry no ts field — matches the inline mocks this
        // harness replaced (e.g. queue-release, prepared-import).
        socket.send(
          JSON.stringify({
            type: "ActionResponse",
            requestId: m.requestId,
            success: true,
            result,
            logLines: [],
          }),
        );
        send();
      }
    };
    // Handle messages strictly in arrival order even when a handler awaits.
    socket.onMessage((raw) => {
      tail = tail.then(() => handle(raw));
    });
  });
}
