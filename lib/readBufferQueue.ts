import {
  createBufferGraphqlClient,
  type ProviderAdapterContext,
} from "./providerAdapters";
import { destinationIdentity, type BufferDestination } from "./bufferContracts";
import type { QueueObservation } from "./queueCapacity";
/** Organization-wide pagination includes manual/external posts and other channels. */
export async function readBufferQueue(
  destination: BufferDestination,
  context: ProviderAdapterContext,
): Promise<QueueObservation> {
  const observation: QueueObservation = {
    identity: destinationIdentity(destination),
    channelId: destination.channelId,
    organizationId: destination.organizationId,
    checkedAt: Date.now(),
    complete: false,
    providerPosts: [],
  };
  const client = createBufferGraphqlClient(context);
  try {
    const limits = await client.graphql(
      `query BufferQueueLimits { account { organizations { id limits { scheduledPosts } } } }`,
    );
    const orgs = (
      limits.data.data as
        | {
            account?: {
              organizations?: {
                id: string;
                limits?: { scheduledPosts: number };
              }[];
            };
          }
        | undefined
    )?.account?.organizations;
    if (
      limits.response.ok &&
      !(Array.isArray(limits.data.errors) && limits.data.errors.length)
    ) {
      const value = orgs?.find((o) => o.id === destination.organizationId)
        ?.limits?.scheduledPosts;
      if (Number.isSafeInteger(value) && value! >= 0)
        observation.organizationLimit = value;
    }
    let after: string | undefined;
    const cursors = new Set<string>();
    const seen = new Set<string>();
    for (let page = 0; page < 20; page++) {
      const result = await client.graphql(
        `query BufferQueue($input: PostsInput!, $after:String) { posts(first:50,after:$after,input:$input) { edges { node { id channelId status dueAt } } pageInfo { hasNextPage endCursor } } }`,
        {
          input: {
            organizationId: destination.organizationId,
            filter: { status: ["scheduled", "sending"] },
          },
          ...(after ? { after } : {}),
        },
      );
      const posts = (
        result.data.data as
          | {
              posts?: {
                edges?: {
                  node?: {
                    id?: unknown;
                    channelId?: unknown;
                    status?: unknown;
                    dueAt?: unknown;
                  };
                }[];
                pageInfo?: { hasNextPage?: boolean; endCursor?: string };
              };
            }
          | undefined
      )?.posts;
      if (
        !result.response.ok ||
        (Array.isArray(result.data.errors) && result.data.errors.length) ||
        !posts?.edges ||
        typeof posts.pageInfo?.hasNextPage !== "boolean"
      )
        throw new Error("Incomplete queue read");
      for (const edge of posts.edges) {
        const node = edge.node;
        if (
          typeof node?.id !== "string" ||
          typeof node.channelId !== "string" ||
          !["scheduled", "sending"].includes(String(node.status))
        )
          throw new Error("Unverified queue row");
        if (seen.has(node.id)) continue;
        seen.add(node.id);
        observation.providerPosts.push({
          id: node.id,
          channelId: node.channelId,
          status: String(node.status),
          ...(typeof node.dueAt === "string" ? { dueAt: node.dueAt } : {}),
        });
      }
      if (!posts.pageInfo.hasNextPage) {
        observation.complete = true;
        break;
      }
      const cursor = posts.pageInfo.endCursor;
      if (!cursor || cursors.has(cursor))
        throw new Error("Invalid pagination cursor");
      cursors.add(cursor);
      after = cursor;
    }
    if (!observation.complete)
      observation.error =
        "Queue exceeds the bounded read; capacity remains unknown.";
  } catch {
    observation.error =
      "Provider count could not be completed; capacity remains unknown.";
  }
  observation.apiWindows = context.requestBudget?.observedWindows;
  return observation;
}
