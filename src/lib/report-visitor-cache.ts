type VisitorReportCacheEntry = {
  expiresAt: number;
};

const visitorReports = new Map<string, VisitorReportCacheEntry>();

function getCacheKey(visitorId: string, contentId: string): string {
  return `${visitorId}:${contentId}`;
}

function clearExpiredEntries(now: number): void {
  for (const [key, entry] of visitorReports) {
    if (entry.expiresAt <= now) {
      visitorReports.delete(key);
    }
  }
}

/**
 * Records one report per signed visitor and content ID in the current server cache.
 * This cache intentionally uses no database and therefore adds no database calls.
 */
export function recordUniqueVisitorReport(
  visitorId: string,
  contentId: string,
  expiresAt: number,
): boolean {
  const now = Date.now();
  clearExpiredEntries(now);

  const key = getCacheKey(visitorId, contentId);
  if (visitorReports.has(key)) {
    return false;
  }

  visitorReports.set(key, { expiresAt });
  return true;
}

export function releaseVisitorReportReservation(visitorId: string, contentId: string): void {
  visitorReports.delete(getCacheKey(visitorId, contentId));
}