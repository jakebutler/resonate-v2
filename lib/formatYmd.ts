/**
 * Derives a civil calendar day (YYYY-MM-DD) in the given timezone, offset by
 * N days. Derive the local day FIRST, then apply the offset: using UTC alone
 * drifts one day after e.g. LA's UTC midnight rollover.
 */
export function formatYmdFromOffset(
  dayOffset: number,
  now = Date.now(),
  timeZone = "America/Los_Angeles"
) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(now));
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  const day = Number(parts.find((part) => part.type === "day")?.value);
  const base = new Date(Date.UTC(year, month - 1, day, 12));
  base.setUTCDate(base.getUTCDate() + dayOffset);
  return base.toISOString().slice(0, 10);
}
