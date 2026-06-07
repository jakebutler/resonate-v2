const YMD_PREFIX_RE = /^(\d{4})-(\d{2})-(\d{2})/;

/** Normalize Convex/migration dates (YYYY-MM-DD or ISO datetime) to calendar YMD. */
export function normalizeScheduledDate(
  date: string | undefined | null
): string | undefined {
  if (!date) return undefined;
  const trimmed = date.trim();
  const match = trimmed.match(YMD_PREFIX_RE);
  if (!match) return undefined;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return undefined;
  }
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return undefined;
  }

  return `${match[1]}-${match[2]}-${match[3]}`;
}

/** Parse a scheduled date for calendar math; invalid input yields an Invalid Date. */
export function parseScheduledDate(date: string): Date {
  const normalized = normalizeScheduledDate(date);
  if (!normalized) return new Date(Number.NaN);

  const [year, month, day] = normalized.split("-").map(Number);
  return new Date(year, month - 1, day, 12);
}
