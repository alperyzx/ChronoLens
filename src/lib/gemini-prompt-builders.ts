import {HISTORICAL_EVENT_CATEGORIES} from './historical-event-categories';

export type HistoricalEventPromptDateInput = {
  date: string;
  category: string;
};

export type HistoricalEventWeekInfo = {
  monthDay: string;
  startDate: string;
  endDate: string;
};

export function buildSingleEventPrompt(input: HistoricalEventPromptDateInput): string {
  return [
    `Date: ${input.date}`,
    `Category: ${input.category}`,
    'Every returned event must match the exact same month and day as the requested date.',
    'Return exactly 3 distinct historical events as a JSON array.',
  ].join('\n');
}

export function buildSingleEventWeekPrompt(input: HistoricalEventPromptDateInput, weekInfo: HistoricalEventWeekInfo): string {
  return [
    `Date: ${input.date}`,
    `Week range: ${weekInfo.monthDay}`,
    `Start MM-DD: ${weekInfo.startDate}`,
    `End MM-DD: ${weekInfo.endDate}`,
    `Category: ${input.category}`,
    'Every returned event must fall within the requested week range.',
    'Return exactly 3 distinct historical events as a JSON array.',
  ].join('\n');
}

export function buildBatchEventPrompt(date: string): string {
  return [
    `Date: ${date}`,
    'Every returned event must match the exact same month and day as the requested date.',
    'Return a JSON object with exactly these keys: ' + HISTORICAL_EVENT_CATEGORIES.join(', '),
    'For each category, return exactly 3 distinct historical events.',
  ].join('\n');
}

export function buildBatchEventWeekPrompt(date: string, weekInfo: HistoricalEventWeekInfo): string {
  return [
    `Date: ${date}`,
    `Week range: ${weekInfo.monthDay}`,
    `Start MM-DD: ${weekInfo.startDate}`,
    `End MM-DD: ${weekInfo.endDate}`,
    'Every returned event must fall within the requested week range.',
    'Return a JSON object with exactly these keys: ' + HISTORICAL_EVENT_CATEGORIES.join(', '),
    'For each category, return exactly 3 distinct historical events.',
  ].join('\n');
}