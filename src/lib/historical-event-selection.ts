import type { CachedHistoricalEventSelection } from './cache-file';

export const MINIMUM_PUBLISHABLE_EVENTS = 3;
export const MAXIMUM_PUBLISHABLE_EVENTS = 5;
export const MAXIMUM_STORED_EVENTS = 6;

export function hasMinimumEvents(selection?: CachedHistoricalEventSelection | null): selection is CachedHistoricalEventSelection {
  return Boolean(
    selection &&
    selection.count >= MINIMUM_PUBLISHABLE_EVENTS &&
    Array.isArray(selection.events) &&
    selection.events.length >= MINIMUM_PUBLISHABLE_EVENTS
  );
}

export function mergeValidatedSelections(
  primary: CachedHistoricalEventSelection,
  refill: CachedHistoricalEventSelection
): CachedHistoricalEventSelection {
  const titles = new Set<string>();
  const sources = new Set<string>();
  const events = [...primary.events, ...refill.events]
    .filter(event => {
      const title = event.title.trim().toLowerCase();
      const source = event.source.trim().toLowerCase();

      if (titles.has(title) || sources.has(source)) {
        return false;
      }

      titles.add(title);
      sources.add(source);
      return true;
    })
    .slice(0, MAXIMUM_STORED_EVENTS)
    .map((event, index) => ({ ...event, significanceRank: index + 1 }));

  return {
    count: Math.min(
      events.length,
      MAXIMUM_PUBLISHABLE_EVENTS,
      Math.max(MINIMUM_PUBLISHABLE_EVENTS, primary.count, refill.count)
    ),
    events,
  };
}
