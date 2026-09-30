import { render, screen } from "@testing-library/react";
import { it, expect, vi } from "vitest";
import { useQuery } from "convex/react";
import { BufferDestinationPanel } from "../BufferDestinationPanel";
vi.mock("convex/react", () => ({
  useQuery: vi.fn(),
  useConvexAuth: () => ({ isAuthenticated: true }),
  useMutation: () => vi.fn(),
  useAction: () => vi.fn(),
}));
it("shows a failed refresh alongside retained destination facts and holds destination review until refreshed", () => {
  const destination = {
    channelId: "fixture-page",
    organizationId: "fixture-org",
    displayName: "Fixture Company",
    handle: "corvo-labs-us",
    accountType: "page",
    disconnected: false,
    locked: false,
    queuePaused: false,
    flagsVerified: true,
    checkedAt: Date.now(),
    firstComment: {
      value: "unknown",
      source: "unknown",
      checkedAt: Date.now(),
      evidence: "Unknown fixture plan",
    },
  };
  const post = {
    _id: "fixture-post",
    title: "Reviewed copy",
    content: "Exact original copy",
    scheduledDate: "2030-10-07",
    scheduledTime: "09:00",
    timezone: "America/Los_Angeles",
  } as Parameters<typeof BufferDestinationPanel>[0]["post"];
  vi.mocked(useQuery).mockReturnValue({
    destination,
    error: "Connection lookup failed; refresh Connections.",
  });
  const { rerender } = render(
    <BufferDestinationPanel brandId="corvo" post={post} />,
  );
  expect(screen.getByText(/Fixture Company/)).toBeInTheDocument();
  expect(screen.getByRole("status")).toHaveTextContent(
    "Connection lookup failed",
  );
  expect(
    screen.getByRole("button", {
      name: "Review this destination and schedule",
    }),
  ).toBeDisabled();
  expect(
    screen.getByRole("button", { name: "Refresh destination" }),
  ).toBeEnabled();
  vi.mocked(useQuery).mockReturnValue({ destination });
  rerender(<BufferDestinationPanel brandId="corvo" post={post} />);
  expect(
    screen.queryByText(/Connection lookup failed/),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole("button", {
      name: "Review this destination and schedule",
    }),
  ).toBeEnabled();
});
