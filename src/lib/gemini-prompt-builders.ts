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

const EVENT_SELECTION_GUIDANCE = [
  'Return a JSON object with a count field between 3 and 5.',
  'Return an events array containing at least 6 candidate events ordered from most significant to least significant.',
  'Each event must include a significanceRank field, starting at 1 for the most significant event and increasing by 1 for each following event.',
  'The count field tells the app how many events to publish from the ranked list.',
].join('\n');

export function buildSingleEventPrompt(input: HistoricalEventPromptDateInput): string {
  return [
    `Date: ${input.date}`,
    `Category: ${input.category}`,
    'Every returned event must match the exact same month and day as the requested date.',
    EVENT_SELECTION_GUIDANCE,
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
    EVENT_SELECTION_GUIDANCE,
  ].join('\n');
}

export function buildBatchEventPrompt(date: string): string {
  return [
    `Date: ${date}`,
    'Every returned event must match the exact same month and day as the requested date.',
    'Return a JSON object with exactly these keys: ' + HISTORICAL_EVENT_CATEGORIES.join(', '),
    'For each category, return a JSON object that follows this selection format:',
    EVENT_SELECTION_GUIDANCE,
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
    'For each category, return a JSON object that follows this selection format:',
    EVENT_SELECTION_GUIDANCE,
  ].join('\n');
}