export type CacheViewType = 'today' | 'week';

function parseRequestDate(date: string): Date {
  const parsed = new Date(`${date}T00:00:00Z`);

  if (Number.isNaN(parsed.getTime())) {
    return new Date();
  }

  return parsed;
}

export function getWeekCacheDate(date: string): string {
  const requestDate = parseRequestDate(date);
  const weekStart = new Date(Date.UTC(
    requestDate.getUTCFullYear(),
    requestDate.getUTCMonth(),
    requestDate.getUTCDate()
  ));

  const dayOfWeek = weekStart.getUTCDay();
  weekStart.setUTCDate(weekStart.getUTCDate() - dayOfWeek);

  return weekStart.toISOString().slice(0, 10);
}

export function normalizeCacheDate(date: string, viewType: CacheViewType): string {
  return viewType === 'week' ? getWeekCacheDate(date) : date;
}