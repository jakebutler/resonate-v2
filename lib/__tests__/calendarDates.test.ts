import { describe, expect, it } from "vitest";
import { normalizeScheduledDate, parseScheduledDate } from "@/lib/calendarDates";

describe("calendarDates", () => {
  it("normalizes plain YMD strings", () => {
    expect(normalizeScheduledDate("2026-06-14")).toBe("2026-06-14");
  });

  it("normalizes ISO datetime strings to YMD", () => {
    expect(normalizeScheduledDate("2026-06-06T18:48:00.000Z")).toBe("2026-06-06");
    expect(normalizeScheduledDate("2026-06-06T00:00:00.000Z")).toBe("2026-06-06");
  });

  it("rejects malformed date strings", () => {
    expect(normalizeScheduledDate("not-a-date")).toBeUndefined();
    expect(normalizeScheduledDate("2026-13-40")).toBeUndefined();
  });

  it("parses normalized dates for calendar anchors", () => {
    const parsed = parseScheduledDate("2026-06-06T18:48:00.000Z");
    expect(parsed.getFullYear()).toBe(2026);
    expect(parsed.getMonth()).toBe(5);
    expect(parsed.getDate()).toBe(6);
  });
});
