import { render, screen, cleanup } from "@testing-library/react";
import { it, expect, vi, afterEach } from "vitest";
import { getFunctionName } from "convex/server";
import { useQuery } from "convex/react";
import { QueuePlanningPanel } from "../QueuePlanningPanel";
vi.mock("convex/react", () => ({
  useConvexAuth: () => ({ isAuthenticated: true }),
  useQuery: vi.fn(),
  useAction: () => vi.fn(),
  useMutation: () => vi.fn(),
}));
vi.mock("../QueueReleasePanel", () => ({ QueueReleasePanel: () => null }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
it.each(["invalid-id", "stale-id", "owned-lower-db"])(
  "resolves URL series %s before querying its plan and derives the owned brand",
  (seriesId) => {
    const calls: { path: string; args: unknown }[] = [];
    vi.mocked(useQuery).mockImplementation((ref, args) => {
      const path = getFunctionName(ref);
      calls.push({ path, args });
      if (path === "publishing:listBrands")
        return [
          { brandId: "corvo", name: "Corvo" },
          { brandId: "lower-db", name: "Lower DB" },
        ];
      if (path === "series:list")
        return [
          {
            _id: "owned-lower-db",
            brandId: "lower-db",
            title: "Lower DB series",
          },
        ];
      if (path === "queuePlanning:plan")
        return {
          projection: { unknown: "Fixture hold" },
          destination: null,
          reservations: [],
          candidates: [],
          partial: false,
        };
      return null;
    });
    render(
      <QueuePlanningPanel initialBrandId="corvo" initialSeriesId={seriesId} />,
    );
    const args = calls.find((c) => c.path === "queuePlanning:plan")!.args;
    expect(args).toEqual(
      seriesId === "owned-lower-db"
        ? { brandId: "lower-db", seriesId }
        : { brandId: "corvo" },
    );
    if (seriesId !== "owned-lower-db")
      expect(
        screen.getByText(
          "This series is unavailable. Showing the accessible brand queue.",
        ),
      ).toHaveTextContent("unavailable");
  },
);
it("waits for the owned series list before issuing a plan query", () => {
  const calls: unknown[] = [];
  vi.mocked(useQuery).mockImplementation((ref, args) => {
    const path = getFunctionName(ref);
    if (path === "publishing:listBrands")
      return [{ brandId: "corvo", name: "Corvo" }];
    if (path === "queuePlanning:plan") calls.push(args);
    return undefined;
  });
  render(<QueuePlanningPanel initialSeriesId="unresolved" />);
  expect(calls).toEqual(["skip"]);
});
