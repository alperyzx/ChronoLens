import { createHash } from 'crypto';
import {
  HISTORICAL_EVENT_CATEGORIES,
  type HistoricalEventCategory,
} from './historical-event-categories';

const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const MAX_TITLE_LENGTH = 300;

export type ValidatedReportContent = {
  title: string;
  category: HistoricalEventCategory;
  date: string;
  contentId: string;
};

function isValidIsoCalendarDate(value: string): boolean {
  const match = ISO_DATE_PATTERN.exec(value);
  if (!match) {
    return false;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));

  return parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() === month - 1
    && parsed.getUTCDate() === day;
}

export function validateReportContent(value: unknown):
  | { content: ValidatedReportContent }
  | { error: string } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { error: 'Request body must be an object' };
  }

  const { title, category, date } = value as Record<string, unknown>;
  if (typeof title !== 'string' || typeof category !== 'string' || typeof date !== 'string') {
    return { error: 'title, category, and date must be strings' };
  }

  const normalizedTitle = title.trim();
  if (!normalizedTitle || normalizedTitle.length > MAX_TITLE_LENGTH || /[\u0000-\u001F\u007F]/.test(normalizedTitle)) {
    return { error: `title must be between 1 and ${MAX_TITLE_LENGTH} printable characters` };
  }

  if (!HISTORICAL_EVENT_CATEGORIES.includes(category as HistoricalEventCategory)) {
    return { error: 'Invalid category' };
  }

  if (!isValidIsoCalendarDate(date)) {
    return { error: 'date must be a valid ISO calendar date in YYYY-MM-DD format' };
  }

  const normalizedCategory = category as HistoricalEventCategory;
  const contentId = createHash('sha256')
    .update(`${normalizedTitle}\u0000${normalizedCategory}\u0000${date}`)
    .digest('base64url');

  return {
    content: {
      title: normalizedTitle,
      category: normalizedCategory,
      date,
      contentId,
    },
  };
}