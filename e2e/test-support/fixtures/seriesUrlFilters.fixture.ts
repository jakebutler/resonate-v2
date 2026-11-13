import { registerSyncFixture, type SyncFixture } from "./registry";

export type SeriesUrlFiltersFixture = {
  /** Every newly subscribed query, as { path, args }. */
  calls: { path: string; args: Record<string, unknown> }[];
};

registerSyncFixture<SeriesUrlFiltersFixture>("series-url-filters", () => {
  const calls: { path: string; args: Record<string, unknown> }[] = [];
  return {
    fixture: { calls },
    handlers: {
      value: (path) => {
        if (path === "publishing:listBrands")
          return [
            { brandId: "corvo", name: "Corvo Labs" },
            { brandId: "lower-db", name: "Lower DB" },
          ];
        if (path === "series:list")
          return [
            {
              _id: "owned-lower-db",
              brandId: "lower-db",
              title: "Lower DB series",
            },
            { _id: "other", brandId: "corvo", title: "Other series" },
          ];
        if (path === "publishing:listCalendarItems") return [];
        if (path === "publishing:bufferLiveSubmissionEnabled")
          return { enabled: false };
        if (path === "queuePlanning:plan")
          return {
            projection: {
              unknown: "Destination is unverified; refresh Connections.",
              availableForBacklog: null,
            },
            destination: null,
            snapshot: null,
            constraint: null,
            reservations: [],
            candidates: [],
            partial: false,
          };
        return null;
      },
      onQuery: (path, args) =>
        calls.push({ path, args: args as Record<string, unknown> }),
    },
  } satisfies SyncFixture<SeriesUrlFiltersFixture>;
});
