export type HistoricalEventsViewType = 'today' | 'week';

const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_IN_MS = 24 * 60 * 60 * 1000;
const MAX_DAILY_HISTORY_DAYS = 6;

// Clients send their own local calendar date, not a UTC one -- see
// getDateStringWithOffset in src/app/page.tsx, which pins to local noon
// precisely so the ISO conversion cannot shift the day. "Today" is therefore
// caller-relative, and real UTC offsets span -12..+14, so a caller's local
// date is always within one calendar day of the UTC date.
//
// Validating strictly against the UTC day rejected every user east of UTC
// between local midnight and their offset (00:00-03:00 in UTC+3) with
// "future dates are not supported", and trimmed the oldest day off the
// history window for users west of UTC.
const LOCAL_DATE_TOLERANCE_DAYS = 1;

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

// Safe for fixed-size day arithmetic: every value here is a UTC midnight, and
// UTC has no DST transitions.
function addUtcDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_IN_MS);
}

function getIsoWeekStart(date: Date): Date {
  const weekStart = startOfUtcDay(date);
  const isoDayOfWeek = weekStart.getUTCDay() || 7;
  weekStart.setUTCDate(weekStart.getUTCDate() - isoDayOfWeek + 1);
  return weekStart;
}

function parseIsoDate(value: string): Date | undefined {
  const match = ISO_DATE_PATTERN.exec(value);
  if (!match) {
    return undefined;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));

  return parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() === month - 1
    && parsed.getUTCDate() === day
    ? parsed
    : undefined;
}

export function validateHistoricalEventsRequestDate(
  value: string,
  viewType: HistoricalEventsViewType,
  now = new Date(),
): string | undefined {
  const requestDate = parseIsoDate(value);
  if (!requestDate) {
    return 'date must be a valid ISO calendar date in YYYY-MM-DD format';
  }

  const utcToday = startOfUtcDay(now);
  // The earliest and latest local "today" any caller on Earth can be on right
  // now. Both bounds are needed: the late one for callers east of UTC, the
  // early one for callers west of it.
  const latestLocalToday = addUtcDays(utcToday, LOCAL_DATE_TOLERANCE_DAYS);
  const earliestLocalToday = addUtcDays(utcToday, -LOCAL_DATE_TOLERANCE_DAYS);

  if (requestDate > latestLocalToday) {
    return 'future dates are not supported';
  }

  if (viewType === 'today') {
    const oldestSupportedDate = addUtcDays(earliestLocalToday, -MAX_DAILY_HISTORY_DAYS);
    return requestDate < oldestSupportedDate
      ? 'day view supports only today and the previous 6 days'
      : undefined;
  }

  const latestWeekStart = getIsoWeekStart(latestLocalToday);
  const earliestWeekStart = addUtcDays(getIsoWeekStart(earliestLocalToday), -7);
  const requestWeekStart = getIsoWeekStart(requestDate);

  return requestWeekStart < earliestWeekStart || requestWeekStart > latestWeekStart
    ? 'week view supports only the current and previous ISO weeks'
    : undefined;
}