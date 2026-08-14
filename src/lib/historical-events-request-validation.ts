export type HistoricalEventsViewType = 'today' | 'week';

const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_IN_MS = 24 * 60 * 60 * 1000;
const MAX_DAILY_HISTORY_DAYS = 6;

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
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

  const today = startOfUtcDay(now);
  if (requestDate > today) {
    return 'future dates are not supported';
  }

  if (viewType === 'today') {
    const oldestSupportedDate = new Date(today.getTime() - MAX_DAILY_HISTORY_DAYS * DAY_IN_MS);
    return requestDate < oldestSupportedDate
      ? 'day view supports only today and the previous 6 days'
      : undefined;
  }

  const currentWeekStart = getIsoWeekStart(today);
  const previousWeekStart = new Date(currentWeekStart.getTime() - 7 * DAY_IN_MS);
  const requestWeekStart = getIsoWeekStart(requestDate);

  return requestWeekStart < previousWeekStart || requestWeekStart > currentWeekStart
    ? 'week view supports only the current and previous ISO weeks'
    : undefined;
}