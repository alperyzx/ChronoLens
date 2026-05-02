export const HISTORICAL_EVENT_CATEGORIES = [
  'Sociology',
  'Technology',
  'Philosophy',
  'Science',
  'Politics',
  'Art',
  'Sports',
  'Literature',
] as const;

export type HistoricalEventCategory = (typeof HISTORICAL_EVENT_CATEGORIES)[number];