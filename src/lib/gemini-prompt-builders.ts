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

export type HistoricalEventRefillInput = {
  date: string;
  categories: string[];
  excludedEvents: Array<{ category: string; title: string; source: string }>;
  weekInfo?: HistoricalEventWeekInfo;
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

export function buildRefillEventPrompt(input: HistoricalEventRefillInput): string {
  const dateRule = input.weekInfo
    ? `Every event must fall between ${input.weekInfo.startDate} and ${input.weekInfo.endDate} (MM-DD).`
    : 'Every event must match the exact same month and day as the requested date.';
  const exclusions = input.excludedEvents.length > 0
    ? input.excludedEvents.map(event => `- ${event.category}: ${event.title} | ${event.source}`).join('\n')
    : '- None';

  return [
    'Generate replacement historical-event candidates for only the requested categories.',
    `Date: ${input.date}`,
    input.weekInfo ? `Week range: ${input.weekInfo.monthDay}` : '',
    `Categories: ${input.categories.join(', ')}`,
    dateRule,
    'Return at least 12 new candidates for each requested category.',
    'Do not repeat any excluded title or source URL.',
    'Use confident, live, permanent source URLs that directly verify each event.',
    'Prefer canonical English Wikipedia articles and official government, university, archive, or museum pages.',
    'Avoid news articles, publisher marketing pages, URL shorteners, and deep links likely to block automated access.',
    'When uncertain about a deep link, use the canonical Wikipedia biography or event article.',
    'Do not guess or fabricate URLs.',
    'Descriptions must be 50-100 words.',
    'Return JSON in this exact shape: {"events":[...]}.',
    'Each event must include title, date, description, category, source, and significanceRank.',
    'Excluded events:',
    exclusions,
  ].filter(Boolean).join('\n');
}
