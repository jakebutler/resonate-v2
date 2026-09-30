import { it, expect } from "vitest";
import HomePage from "../page";
it("normalizes a repeated series query parameter to its first string value", async () => {
  const page = await HomePage({
    searchParams: Promise.resolve({ seriesId: ["first", "second"] }),
  });
  expect(page.props.children.props.children.props.initialSeriesId).toBe(
    "first",
  );
});
