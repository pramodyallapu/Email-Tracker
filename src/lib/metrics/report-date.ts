/** Calendar timezone for dashboards (default: India). Override with REPORT_TIMEZONE. */
export function getReportTimezone(): string {
  return process.env.REPORT_TIMEZONE ?? "Asia/Kolkata";
}

/** yyyy-MM-dd in the report timezone */
export function toReportDate(
  instant: string | Date,
  timeZone = getReportTimezone()
): string {
  const d = typeof instant === "string" ? new Date(instant) : instant;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function timeZoneOffsetMinutes(timeZone: string, at: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "shortOffset",
  }).formatToParts(at);
  const tz = parts.find((p) => p.type === "timeZoneName")?.value ?? "GMT";
  const match = tz.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
  if (!match) return 0;
  const sign = match[1] === "-" ? -1 : 1;
  return sign * (Number(match[2]) * 60 + Number(match[3] ?? 0));
}

/** UTC instants for start/end of a calendar day in the report timezone */
export function reportDayBoundsUtc(
  dateStr: string,
  timeZone = getReportTimezone()
): { start: string; end: string } {
  const [y, m, d] = dateStr.split("-").map(Number);
  const anchor = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const offsetMin = timeZoneOffsetMinutes(timeZone, anchor);
  const startMs = Date.UTC(y, m - 1, d, 0, 0, 0, 0) - offsetMin * 60_000;
  const endMs = Date.UTC(y, m - 1, d, 23, 59, 59, 999) - offsetMin * 60_000;
  return {
    start: new Date(startMs).toISOString(),
    end: new Date(endMs).toISOString(),
  };
}

/** UTC instants for an inclusive calendar date range in the report timezone */
export function reportRangeBoundsUtc(
  startDate: string,
  endDate: string,
  timeZone = getReportTimezone()
): { start: string; end: string } {
  const { start } = reportDayBoundsUtc(startDate, timeZone);
  const { end } = reportDayBoundsUtc(endDate, timeZone);
  return { start, end };
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function parseReportDateParam(value?: string | null): string | undefined {
  if (!value?.trim() || !DATE_RE.test(value.trim())) return undefined;
  return value.trim();
}

export type ReportDateFilter = {
  startDate?: string;
  endDate?: string;
};

/** Inclusive UTC bounds for optional start/end calendar dates (report TZ). */
export function resolveReportDateBounds(
  filter?: ReportDateFilter
): { start?: string; end: string } | null {
  const startDate = parseReportDateParam(filter?.startDate);
  const endDate = parseReportDateParam(filter?.endDate);
  if (!startDate && !endDate) return null;

  const tz = getReportTimezone();
  const today = toReportDate(new Date(), tz);

  if (startDate && endDate) {
    const [from, to] =
      startDate <= endDate ? [startDate, endDate] : [endDate, startDate];
    return reportRangeBoundsUtc(from, to, tz);
  }

  if (startDate) {
    const { start } = reportDayBoundsUtc(startDate, tz);
    const { end } = reportDayBoundsUtc(today, tz);
    return { start, end };
  }

  return { end: reportDayBoundsUtc(endDate!, tz).end };
}

export function describeReportDateRange(filter?: ReportDateFilter): {
  startDate?: string;
  endDate?: string;
} | null {
  const startDate = parseReportDateParam(filter?.startDate);
  const endDate = parseReportDateParam(filter?.endDate);
  if (!startDate && !endDate) return null;

  return {
    startDate: startDate ?? undefined,
    endDate: endDate ?? toReportDate(new Date(), getReportTimezone()),
  };
}

/** Last N calendar days in report TZ (oldest first), including today */
export function reportDateRange(
  dayCount: number,
  timeZone = getReportTimezone()
): string[] {
  const dates = new Set<string>();
  let cursor = new Date();
  while (dates.size < dayCount) {
    dates.add(toReportDate(cursor, timeZone));
    cursor = new Date(cursor.getTime() - 86_400_000);
  }
  return Array.from(dates).sort();
}
