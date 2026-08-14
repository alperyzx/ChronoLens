'use server';
/**
 * @fileOverview A historical event generator flow.
 *
 * - generateHistoricalEvents - A function that generates historical events based on the provided date and category.
 * - GenerateHistoricalEventsInput - The input type for the generateHistoricalEvents function.
 * - GenerateHistoricalEventsOutput - The return type for the generateHistoricalEvents function.
 */

import {ai} from '@/ai/ai-instance';
import {z} from 'genkit';
import {getTTLUntilEndOfWeek, getTTLUntilMidnight} from '@/lib/cache-file';
import {getISOWeekStartDate} from '@/lib/cache-keys';
import {HISTORICAL_EVENT_CATEGORIES, type HistoricalEventCategory} from '@/lib/historical-event-categories';
import {GEMINI_CACHE_MODEL, resolveGeminiContextCache} from '@/lib/gemini-context-cache';
import {
  buildBatchEventPrompt,
  buildBatchEventWeekPrompt,
  buildRefillEventPrompt,
  buildSingleEventPrompt,
  buildSingleEventWeekPrompt,
} from '@/lib/gemini-prompt-builders';

// Helper function to calculate a week's date range for the selected anchor date.
function getWeekDateRange(anchorDate: string): { startDate: string; endDate: string; monthDay: string } {
  const startOfWeek = getISOWeekStartDate(anchorDate);

  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setUTCDate(startOfWeek.getUTCDate() + 6);

  const startMonth = startOfWeek.toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' });
  const endMonth = endOfWeek.toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' });
  const startDay = startOfWeek.getUTCDate();
  const endDay = endOfWeek.getUTCDate();

  const monthDay = startMonth === endMonth
    ? `${startMonth} ${startDay}-${endDay}`
    : `${startMonth} ${startDay}-${endMonth} ${endDay}`;

  const startMM = String(startOfWeek.getUTCMonth() + 1).padStart(2, '0');
  const startDD = String(startDay).padStart(2, '0');
  const endMM = String(endOfWeek.getUTCMonth() + 1).padStart(2, '0');
  const endDD = String(endDay).padStart(2, '0');

  return {
    startDate: `${startMM}-${startDD}`,
    endDate: `${endMM}-${endDD}`,
    monthDay,
  };
}

function parseEventMonthDay(date: string): { month: number; day: number } | undefined {
  const trimmedDate = date.trim();

  const isoMatch = trimmedDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    return {
      month: Number(isoMatch[2]),
      day: Number(isoMatch[3]),
    };
  }

  const monthDayMatch = trimmedDate.match(/^(\d{1,2})-(\d{1,2})$/);
  if (monthDayMatch) {
    return {
      month: Number(monthDayMatch[1]),
      day: Number(monthDayMatch[2]),
    };
  }

  const parsedDate = new Date(trimmedDate);
  if (!Number.isNaN(parsedDate.getTime())) {
    return {
      month: parsedDate.getMonth() + 1,
      day: parsedDate.getDate(),
    };
  }

  return undefined;
}

function isEventInDateRange(eventDate: string, startMM_DD: string, endMM_DD: string): boolean {
  const parsedMonthDay = parseEventMonthDay(eventDate);
  if (!parsedMonthDay) {
    return false;
  }

  const [startMonth, startDay] = startMM_DD.split('-').map(Number);
  const [endMonth, endDay] = endMM_DD.split('-').map(Number);
  const { month, day } = parsedMonthDay;

  if (startMonth === endMonth) {
    return month === startMonth && day >= startDay && day <= endDay;
  }

  const inFirstMonth = month === startMonth && day >= startDay;
  const inSecondMonth = month === endMonth && day <= endDay;
  return inFirstMonth || inSecondMonth;
}

// Helper function to validate that event dates fall within the expected range
function filterEventsByDateRange(
  events: GenerateHistoricalEventsOutput['events'],
  startMM_DD: string,
  endMM_DD: string
): GenerateHistoricalEventsOutput['events'] {
  return events.filter(event => {
    if (!event.date) {
      console.warn(`Filtered out event with missing date: ${event.title}`);
      return false;
    }

    const isValid = isEventInDateRange(event.date, startMM_DD, endMM_DD);

    if (!isValid) {
      console.warn(`Filtered out event with date outside week range: ${event.title} (${event.date})`);
    }
    
    return isValid;
  });
}

function filterSelectionByDateRange(
  selection: GenerateHistoricalEventsOutput,
  startMM_DD: string,
  endMM_DD: string
): GenerateHistoricalEventsOutput {
  return {
    count: selection.count,
    events: filterEventsByDateRange(selection.events, startMM_DD, endMM_DD),
  };
}

function normalizeSelection(selection: GenerateHistoricalEventsOutput): GenerateHistoricalEventsOutput {
  const rankedEvents = [...selection.events]
    .map((event, index) => ({
      ...event,
      significanceRank: event.significanceRank > 0 ? event.significanceRank : index + 1,
    }))
    .sort((left, right) => left.significanceRank - right.significanceRank);

  const maxPublishable = Math.min(5, rankedEvents.length || 0);
  const normalizedCount = maxPublishable > 0
    ? Math.max(3, Math.min(selection.count || 3, maxPublishable))
    : 0;

  return {
    count: normalizedCount,
    events: rankedEvents,
  };
}

const GenerateHistoricalEventsInputSchema = z.object({
  date: z.string().describe('The anchor date for which to retrieve historical events (YYYY-MM-DD).'),
  viewType: z.enum(['today', 'week']).describe('Whether to generate a single-day or week-based selection.'),
  category: z.enum(['Sociology', 'Technology', 'Philosophy', 'Science', 'Politics', 'Art', 'Sports', 'Literature']).describe('The category of historical events to retrieve.'),
});
export type GenerateHistoricalEventsInput = z.infer<typeof GenerateHistoricalEventsInputSchema>;

const HistoricalEventSchema = z.object({
  title: z.string().describe('The title of the historical event.'),
  date: z.string().describe('The ISO date string of when the historical event actually occurred (YYYY-MM-DD), using the real historical year, not the request/current date.'),
  description: z.string().describe('A description of the historical event (50-100 words).'),
  category: z.enum(['Sociology', 'Technology', 'Philosophy', 'Science', 'Politics', 'Art', 'Sports', 'Literature']).describe('The category of the historical event.'),
  source: z.string().describe('URL to a reputable source verifying this historical event.'),
  significanceRank: z.coerce.number().int().positive().catch(0).describe('A 1-based ranking where 1 is the most significant event.'),
});

const HistoricalEventSelectionSchema = z.object({
  count: z.coerce.number().int().min(3).max(5).describe('How many events should be displayed for this category.'),
  events: z.array(HistoricalEventSchema).describe('The ranked candidate events ordered from most significant to least significant.'),
});

const HistoricalEventRefillSchema = z.object({
  events: z.array(HistoricalEventSchema),
});

const GenerateHistoricalEventsOutputSchema = HistoricalEventSelectionSchema;
export type GenerateHistoricalEventsOutput = z.infer<typeof GenerateHistoricalEventsOutputSchema>;

const HistoricalEventsByCategorySchema = z.object({
  Sociology: HistoricalEventSelectionSchema,
  Technology: HistoricalEventSelectionSchema,
  Philosophy: HistoricalEventSelectionSchema,
  Science: HistoricalEventSelectionSchema,
  Politics: HistoricalEventSelectionSchema,
  Art: HistoricalEventSelectionSchema,
  Sports: HistoricalEventSelectionSchema,
  Literature: HistoricalEventSelectionSchema,
});

export type HistoricalEventsByCategory = z.infer<typeof HistoricalEventsByCategorySchema>;

export type GenerateHistoricalEventRefillInput = {
  date: string;
  viewType: 'today' | 'week';
  categories: HistoricalEventCategory[];
  excludedEvents: Array<Pick<z.infer<typeof HistoricalEventSchema>, 'category' | 'title' | 'source'>>;
};

const SHARED_SINGLE_EVENT_CACHE_INSTRUCTIONS = `You are a passionate historian and educator specializing in the category provided in the live request.

Fully adopt the persona of an expert in that specific category. Your mission is to inspire and enlighten readers by sharing remarkable historical events in that category that demonstrate human achievement, innovation, resilience, and progress.

Selection criteria:
- Prioritize events that demonstrate human potential, progress, or resilience
- Include diverse perspectives and underrepresented voices when relevant
- Choose events that teach us something valuable about ourselves or our world
- Avoid trivial, purely negative, or overly obscure events unless they have profound lessons

Description guidelines:
- Write descriptions between 50 and 100 words
- Start with the impact or significance first
- Explain why this event matters and what we can learn from it
- Use engaging, accessible language that brings the story to life
- End with a thought-provoking insight or lasting legacy

Source validation:
- Only provide source URLs that are confident, live, and accessible
- Use well-established, permanent URLs
- Prefer general reference pages over specific deep links that may have moved
- Do not guess or fabricate URLs
- Each source must directly verify the event described

Output rules:
- Return only a JSON array
- Each event must include title, date, description, category, and source
- Date must be written as YYYY-MM-DD
- The date field MUST use the actual historical year the event occurred (for example 1965-08-11), NOT the current year and NOT the request date
- Never copy the request date into the date field; the request date only supplies the month and day to match
- Category must match the requested category`;

const SINGLE_EVENT_TODAY_CACHE_INSTRUCTIONS = `${SHARED_SINGLE_EVENT_CACHE_INSTRUCTIONS}

Date rule:
- Only include events that happened on the exact same month and day as the live request date, in any past year.
- The request date only provides the month and day to match. Set each event's date to the real historical year it happened, keeping the same month and day.

The live request will provide the date and category.`;

const SINGLE_EVENT_WEEK_CACHE_INSTRUCTIONS = `${SHARED_SINGLE_EVENT_CACHE_INSTRUCTIONS}

Date rule:
- Only include events whose MM-DD falls within the live request's week range, in any past year.
- The request only provides the month/day range to match. Set each event's date to the real historical year it happened, keeping the matching month and day.

The live request will provide the week range, start date, end date, and category.`;

const SHARED_BATCH_EVENT_CACHE_INSTRUCTIONS = `You are a passionate historian and educator.

Generate historical events for each category in one response.

Categories: ${HISTORICAL_EVENT_CATEGORIES.join(', ')}

Selection criteria:
- Prioritize events that demonstrate human potential, progress, or resilience
- Include diverse perspectives and underrepresented voices when relevant
- Choose events that teach us something valuable about ourselves or our world
- Avoid trivial, purely negative, or overly obscure events unless they have profound lessons

Description guidelines:
- Write descriptions between 50 and 100 words
- Start with the impact or significance first
- Explain why this event matters and what we can learn from it
- Use engaging, accessible language that brings the story to life
- End with a thought-provoking insight or lasting legacy

Source validation:
- Only provide source URLs that are confident, live, and accessible
- Use well-established, permanent URLs
- Do not guess or fabricate URLs
- Each source must directly verify the event described

Output rules:
- Return only a JSON object
- Include exactly one key for each category
- Each event must include title, date, description, category, and source
- Date must be written as YYYY-MM-DD
- The date field MUST use the actual historical year the event occurred (for example 1965-08-11), NOT the current year and NOT the request date
- Never copy the request date into the date field; the request date only supplies the month and day to match
- The category field must match the key it belongs to`;

const BATCH_EVENT_TODAY_CACHE_INSTRUCTIONS = `${SHARED_BATCH_EVENT_CACHE_INSTRUCTIONS}

Date rule:
- Only include events that happened on the exact same month and day as the live request date, in any past year.
- The request date only provides the month and day to match. Set each event's date to the real historical year it happened, keeping the same month and day.

The live request will provide the date.`;

const BATCH_EVENT_WEEK_CACHE_INSTRUCTIONS = `${SHARED_BATCH_EVENT_CACHE_INSTRUCTIONS}

Date rule:
- Only include events that fall within the live request's week range, in any past year.
- The request only provides the month/day range to match. Set each event's date to the real historical year it happened, keeping the matching month and day.

The live request will provide the week range, start date, and end date.`;

function getGeminiApiKey(): string | undefined {
  return process.env.GOOGLE_GENAI_API_KEY || process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
}

function stripCodeFences(text: string): string {
  return text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '');
}

function extractGeminiText(responseBody: { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> }): string {
  const parts = responseBody.candidates?.[0]?.content?.parts || [];
  return parts.map(part => part.text || '').join('').trim();
}

async function generateGeminiJson<T extends z.ZodTypeAny>(options: {
  prompt: string;
  cachedContent?: string;
  outputSchema: T;
}): Promise<z.infer<T> | undefined> {
  const apiKey = getGeminiApiKey();

  if (!apiKey) {
    throw new Error('Google Gemini API key not configured. Please set GOOGLE_GENAI_API_KEY or GOOGLE_API_KEY.');
  }

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/${GEMINI_CACHE_MODEL}:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: [{ text: options.prompt }],
        },
      ],
      cachedContent: options.cachedContent,
      generationConfig: {
        responseMimeType: 'application/json',
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(`Gemini generateContent failed: ${response.status} ${response.statusText} ${errorText}`);
  }

  const responseBody = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  const text = extractGeminiText(responseBody);
  if (!text) {
    return undefined;
  }

  const parsed = JSON.parse(stripCodeFences(text)) as unknown;
  return options.outputSchema.parse(parsed);
}

async function generateHistoricalEventsWithCache<T extends z.ZodTypeAny>(options: {
  cacheId: string;
  displayName: string;
  instructions: string;
  prompt: string;
  outputSchema: T;
  ttlSeconds?: number;
}): Promise<z.infer<T> | undefined> {
  const cachedContent = await resolveGeminiContextCache({
    cacheId: options.cacheId,
    displayName: options.displayName,
    model: GEMINI_CACHE_MODEL,
    instructions: options.instructions,
    ttlSeconds: options.ttlSeconds,
  });

  return await generateGeminiJson({
    prompt: options.prompt,
    cachedContent,
    outputSchema: options.outputSchema,
  });
}

// Optimized implementation with better error handling
export async function generateHistoricalEvents(input: GenerateHistoricalEventsInput): Promise<GenerateHistoricalEventsOutput> {
  try {
    return await generateHistoricalEventsFlow(input);
  } catch (error) {
    console.error('Error generating historical events:', error);
    return {
      count: 0,
      events: [],
    };
  }
}

export async function generateHistoricalEventsByCategory(input: GenerateHistoricalEventsInput): Promise<HistoricalEventsByCategory> {
  try {
    return await generateHistoricalEventsByCategoryFlow(input);
  } catch (error) {
    console.error('Error generating batch historical events:', error);
    return emptyCategorySelectionMap();
  }
}

export async function generateHistoricalEventRefill(input: GenerateHistoricalEventRefillInput): Promise<HistoricalEventsByCategory> {
  try {
    const weekInfo = input.viewType === 'week' ? getWeekDateRange(input.date) : undefined;
    const output = await generateGeminiJson({
      prompt: buildRefillEventPrompt({
        date: input.date,
        categories: input.categories,
        excludedEvents: input.excludedEvents,
        weekInfo,
      }),
      outputSchema: HistoricalEventRefillSchema,
    });
    const requestedCategories = new Set(
      input.categories.filter((category): category is HistoricalEventCategory =>
        HISTORICAL_EVENT_CATEGORIES.includes(category)
      )
    );
    const selections = emptyCategorySelectionMap();

    for (const event of output?.events || []) {
      if (requestedCategories.has(event.category)) {
        selections[event.category].events.push(event);
      }
    }

    for (const category of HISTORICAL_EVENT_CATEGORIES) {
      if (requestedCategories.has(category)) {
        selections[category].count = 3;
      }
    }

    if (weekInfo) {
      return normalizeSelectionsByCategory(filterByDateRangeForCategories(selections, weekInfo.startDate, weekInfo.endDate));
    }

    const [, month, day] = input.date.split('-');
    const mmdd = `${month}-${day}`;
    return normalizeSelectionsByCategory(filterByDateRangeForCategories(selections, mmdd, mmdd));
  } catch (error) {
    console.error('Error generating historical event refills:', error);
    return emptyCategorySelectionMap();
  }
}

const generateHistoricalEventsFlow = ai.defineFlow<
  typeof GenerateHistoricalEventsInputSchema,
  typeof GenerateHistoricalEventsOutputSchema
>(
  {
    name: 'generateHistoricalEventsFlow',
    inputSchema: GenerateHistoricalEventsInputSchema,
    outputSchema: GenerateHistoricalEventsOutputSchema,
  },
  async input => {
    const {date, viewType} = input;

    if (viewType === 'week') {
      const weekInfo = getWeekDateRange(date);
      const weekOutput = await generateHistoricalEventsWithCache({
        cacheId: 'historical-events-single-week',
        displayName: 'chronolens historical events single week v3',
        instructions: SINGLE_EVENT_WEEK_CACHE_INSTRUCTIONS,
        prompt: buildSingleEventWeekPrompt({ date, category: input.category }, weekInfo),
        outputSchema: GenerateHistoricalEventsOutputSchema,
        ttlSeconds: getTTLUntilEndOfWeek(),
      });

      return normalizeSelection(filterSelectionByDateRange(weekOutput || { count: 0, events: [] }, weekInfo.startDate, weekInfo.endDate));
    }

    const todayOutput = await generateHistoricalEventsWithCache({
      cacheId: 'historical-events-single-today',
      displayName: 'chronolens historical events single today v3',
      instructions: SINGLE_EVENT_TODAY_CACHE_INSTRUCTIONS,
      prompt: buildSingleEventPrompt(input),
      outputSchema: GenerateHistoricalEventsOutputSchema,
      ttlSeconds: getTTLUntilMidnight(),
    });

    // Filter out any events that don't match the specific date
    const [, month, day] = date.split('-');
    const mmdd = `${month}-${day}`;
    return normalizeSelection(filterSelectionByDateRange(todayOutput || { count: 0, events: [] }, mmdd, mmdd));
  }
);

const generateHistoricalEventsByCategoryFlow = ai.defineFlow<
  typeof GenerateHistoricalEventsInputSchema,
  typeof HistoricalEventsByCategorySchema
>(
  {
    name: 'generateHistoricalEventsByCategoryFlow',
    inputSchema: GenerateHistoricalEventsInputSchema,
    outputSchema: HistoricalEventsByCategorySchema,
  },
  async input => {
    const {date, viewType} = input;

    if (viewType === 'week') {
      const weekInfo = getWeekDateRange(date);
      const weekOutput = await generateHistoricalEventsWithCache({
        cacheId: 'historical-events-batch-week',
        displayName: 'chronolens historical events batch week v2',
        instructions: BATCH_EVENT_WEEK_CACHE_INSTRUCTIONS,
        prompt: buildBatchEventWeekPrompt(date, weekInfo),
        outputSchema: HistoricalEventsByCategorySchema,
        ttlSeconds: getTTLUntilEndOfWeek(),
      });
      return normalizeSelectionsByCategory(filterByDateRangeForCategories(weekOutput || emptyCategorySelectionMap(), weekInfo.startDate, weekInfo.endDate));
    }

    const todayOutput = await generateHistoricalEventsWithCache({
      cacheId: 'historical-events-batch-today',
      displayName: 'chronolens historical events batch today v2',
      instructions: BATCH_EVENT_TODAY_CACHE_INSTRUCTIONS,
      prompt: buildBatchEventPrompt(date),
      outputSchema: HistoricalEventsByCategorySchema,
      ttlSeconds: getTTLUntilMidnight(),
    });
    const [, month, day] = date.split('-');
    const mmdd = `${month}-${day}`;
    return normalizeSelectionsByCategory(filterByDateRangeForCategories(todayOutput || emptyCategorySelectionMap(), mmdd, mmdd));
  }
);

function emptyHistoricalEventSelection(): GenerateHistoricalEventsOutput {
  return {
    count: 0,
    events: [],
  };
}

function emptyCategorySelectionMap(): HistoricalEventsByCategory {
  return {
    Sociology: emptyHistoricalEventSelection(),
    Technology: emptyHistoricalEventSelection(),
    Philosophy: emptyHistoricalEventSelection(),
    Science: emptyHistoricalEventSelection(),
    Politics: emptyHistoricalEventSelection(),
    Art: emptyHistoricalEventSelection(),
    Sports: emptyHistoricalEventSelection(),
    Literature: emptyHistoricalEventSelection(),
  };
}

function filterByDateRangeForCategories(
  eventsByCategory: HistoricalEventsByCategory,
  startMM_DD: string,
  endMM_DD: string
): HistoricalEventsByCategory {
  return {
    Sociology: filterSelectionByDateRange(eventsByCategory.Sociology || emptyHistoricalEventSelection(), startMM_DD, endMM_DD),
    Technology: filterSelectionByDateRange(eventsByCategory.Technology || emptyHistoricalEventSelection(), startMM_DD, endMM_DD),
    Philosophy: filterSelectionByDateRange(eventsByCategory.Philosophy || emptyHistoricalEventSelection(), startMM_DD, endMM_DD),
    Science: filterSelectionByDateRange(eventsByCategory.Science || emptyHistoricalEventSelection(), startMM_DD, endMM_DD),
    Politics: filterSelectionByDateRange(eventsByCategory.Politics || emptyHistoricalEventSelection(), startMM_DD, endMM_DD),
    Art: filterSelectionByDateRange(eventsByCategory.Art || emptyHistoricalEventSelection(), startMM_DD, endMM_DD),
    Sports: filterSelectionByDateRange(eventsByCategory.Sports || emptyHistoricalEventSelection(), startMM_DD, endMM_DD),
    Literature: filterSelectionByDateRange(eventsByCategory.Literature || emptyHistoricalEventSelection(), startMM_DD, endMM_DD),
  };
}

function normalizeSelectionsByCategory(eventsByCategory: HistoricalEventsByCategory): HistoricalEventsByCategory {
  return {
    Sociology: normalizeSelection(eventsByCategory.Sociology || emptyHistoricalEventSelection()),
    Technology: normalizeSelection(eventsByCategory.Technology || emptyHistoricalEventSelection()),
    Philosophy: normalizeSelection(eventsByCategory.Philosophy || emptyHistoricalEventSelection()),
    Science: normalizeSelection(eventsByCategory.Science || emptyHistoricalEventSelection()),
    Politics: normalizeSelection(eventsByCategory.Politics || emptyHistoricalEventSelection()),
    Art: normalizeSelection(eventsByCategory.Art || emptyHistoricalEventSelection()),
    Sports: normalizeSelection(eventsByCategory.Sports || emptyHistoricalEventSelection()),
    Literature: normalizeSelection(eventsByCategory.Literature || emptyHistoricalEventSelection()),
  };
}
