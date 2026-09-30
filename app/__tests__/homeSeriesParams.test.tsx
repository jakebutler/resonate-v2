import type { ReactNode } from "react";
import { it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import HomePage from "../page";
vi.mock("@/components/shell/Shell", () => ({
  Shell: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock("@/components/PersistedPublishingPanel", () => ({
  PersistedPublishingPanel: ({
    initialSeriesId,
  }: {
    initialSeriesId?: string;
  }) => <div data-testid="calendar-series">{initialSeriesId}</div>,
}));
it("normalizes a repeated series query parameter to its first string value", async () => {
  render(
    await HomePage({
      searchParams: Promise.resolve({ seriesId: ["first", "second"] }),
    }),
  );
  expect(screen.getByTestId("calendar-series")).toHaveTextContent("first");
});
