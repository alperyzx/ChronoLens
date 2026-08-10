export type CacheViewType = 'today' | 'week';

function parseRequestDate(date: string): Date {
  const parsed = new Date(`${date}T00:00:00Z`);

  if (Number.isNaN(parsed.getTime())) {
    return new Date();
  }

  return parsed;
}

export function getISOWeekStartDate(date: string): Date {
  const requestDate = parseRequestDate(date);
  const weekStart = new Date(Date.UTC(requestDate.getUTCFullYear(), requestDate.getUTCMonth(), requestDate.getUTCDate()));
  const isoDayOfWeek = weekStart.getUTCDay() || 7;
  weekStart.setUTCDate(weekStart.getUTCDate() - isoDayOfWeek + 1);

  return weekStart;
}

export function getISOWeekCacheId(date: string): string {
  const requestDate = parseRequestDate(date);
  const isoDayOfWeek = requestDate.getUTCDay() || 7;
  const thursday = new Date(requestDate);
  thursday.setUTCDate(thursday.getUTCDate() + 4 - isoDayOfWeek);

  const isoYear = thursday.getUTCFullYear();
  const firstThursday = new Date(Date.UTC(isoYear, 0, 4));
  const firstIsoDayOfWeek = firstThursday.getUTCDay() || 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() + 4 - firstIsoDayOfWeek);
  const week = 1 + Math.round((thursday.getTime() - firstThursday.getTime()) / (7 * 24 * 60 * 60 * 1000));

  return `${isoYear}-w${String(week).padStart(2, '0')}`;
}

export function normalizeCacheDate(date: string, viewType: CacheViewType): string {
  return viewType === 'week' ? getISOWeekCacheId(date) : date;
}