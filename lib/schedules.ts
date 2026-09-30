export function scheduleToUtcIso(input: {
  scheduledDate: string;
  scheduledTime?: string;
  timezone: string;
}): string {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(input.scheduledDate) ||
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(input.scheduledTime ?? "09:00")
  )
    throw new Error("Save a valid calendar date and HH:MM local time.");
  const date = new Date(`${input.scheduledDate}T00:00:00Z`);
  if (
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== input.scheduledDate
  )
    throw new Error("Invalid calendar date.");
  if (
    input.timezone !== "UTC" &&
    !/^[A-Za-z_+-]+(?:\/[A-Za-z0-9_+-]+)+$/.test(input.timezone)
  )
    throw new Error("Select an IANA timezone.");
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: input.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const [year, month, day] = input.scheduledDate.split("-").map(Number);
  const [hour, minute] = (input.scheduledTime ?? "09:00")
    .split(":")
    .map(Number);
  const desired = Date.UTC(year, month - 1, day, hour, minute);
  function local(ms: number) {
    const parts = formatter.formatToParts(new Date(ms));
    const n = (type: string) =>
      Number(parts.find((p) => p.type === type)?.value);
    return Date.UTC(
      n("year"),
      n("month") - 1,
      n("day"),
      n("hour"),
      n("minute"),
    );
  }
  let ms = desired;
  for (let i = 0; i < 4; i++) ms += desired - local(ms);
  if (local(ms) !== desired)
    throw new Error(
      "This local time does not exist across daylight saving time; choose an explicit valid time.",
    );
  if (
    [-7200000, -3600000, -1800000, 1800000, 3600000, 7200000].some(
      (delta) => local(ms + delta) === desired,
    )
  )
    throw new Error(
      "This local time is ambiguous across daylight saving time; choose an unambiguous time.",
    );
  return new Date(ms).toISOString();
}
export function calendarDayOffset(
  date: string,
  days: number,
  time: string,
  timezone: string,
) {
  if (!Number.isInteger(days) || Math.abs(days) > 366)
    throw new Error("Offset must be an integer within one year.");
  scheduleToUtcIso({ scheduledDate: date, scheduledTime: time, timezone });
  const base = new Date(`${date}T12:00:00Z`);
  base.setUTCDate(base.getUTCDate() + days);
  const scheduledDate = base.toISOString().slice(0, 10);
  return {
    scheduledDate,
    scheduledTime: time,
    timezone,
    dueAt: scheduleToUtcIso({ scheduledDate, scheduledTime: time, timezone }),
  };
}
