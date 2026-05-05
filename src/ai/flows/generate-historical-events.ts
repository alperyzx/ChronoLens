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
import {HISTORICAL_EVENT_CATEGORIES} from '@/lib/historical-event-categories';
import {GEMINI_CACHE_MODEL, resolveGeminiContextCache} from '@/lib/gemini-context-cache';
import {
  buildBatchEventPrompt,
  buildBatchEventWeekPrompt,
  buildSingleEventPrompt,
  buildSingleEventWeekPrompt,
} from '@/lib/gemini-prompt-builders';

// Helper function to calculate the current week's date range
function getWeekDateRange(): { startDate: string; endDate: string; monthDay: string } {
  const today = new Date();
  const dayOfWeek = today.getDay(); // 0 = Sunday, 1 = Monday, etc.
  
  // Calculate start of week (Sunday)
  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() - dayOfWeek);
  
  // Calculate end of week (Saturday)
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 6);
  
  const startMonth = startOfWeek.toLocaleDateString('en-US', { month: 'long' });
  const endMonth = endOfWeek.toLocaleDateString('en-US', { month: 'long' });
  const startDay = startOfWeek.getDate();
  const endDay = endOfWeek.getDate();
  
  // Format: "November 24-30" or "November 30-December 6"
  const monthDay = startMonth === endMonth 
    ? `${startMonth} ${startDay}-${endDay}`
    : `${startMonth} ${startDay}-${endMonth} ${endDay}`;
  
  // Get MM-DD format for validation
  const startMM = String(startOfWeek.getMonth() + 1).padStart(2, '0');
  const startDD = String(startDay).padStart(2, '0');
  const endMM = String(endOfWeek.getMonth() + 1).padStart(2, '0');
  const endDD = String(endDay).padStart(2, '0');
  
  return {
    startDate: `${startMM}-${startDD}`,
    endDate: `${endMM}-${endDD}`,
    monthDay
  };
}

// Helper function to validate that event dates fall within the expected range
function filterEventsByDateRange(
  events: GenerateHistoricalEventsOutput,
  startMM_DD: string,
  endMM_DD: string
): GenerateHistoricalEventsOutput {
  const [startMonth, startDay] = startMM_DD.split('-').map(Number);
  const [endMonth, endDay] = endMM_DD.split('-').map(Number);
  
  return events.filter(event => {
    if (!event.date || !/^\d{4}-\d{2}-\d{2}$/.test(event.date)) {
      console.warn(`Filtered out event with invalid date format: ${event.title}`);
      return false;
    }
    
    const [, eventMonthStr, eventDayStr] = event.date.split('-');
    const eventMonth = parseInt(eventMonthStr, 10);
    const eventDay = parseInt(eventDayStr, 10);
    
    // Check if the event falls within the week range
    let isValid = false;
    
    if (startMonth === endMonth) {
      // Week is within the same month
      isValid = eventMonth === startMonth && eventDay >= startDay && eventDay <= endDay;
    } else {
      // Week spans two months (e.g., Nov 30 - Dec 6)
      const inFirstMonth = eventMonth === startMonth && eventDay >= startDay;
      const inSecondMonth = eventMonth === endMonth && eventDay <= endDay;
      isValid = inFirstMonth || inSecondMonth;
    }
    
    if (!isValid) {
      console.warn(`Filtered out event with date outside week range: ${event.title} (${event.date})`);
    }
    
    return isValid;
  });
}

const GenerateHistoricalEventsInputSchema = z.object({
  date: z.string().describe('The date for which to retrieve historical events (YYYY-MM-DD or "This Week").'),
  category: z.enum(['Sociology', 'Technology', 'Philosophy', 'Science', 'Politics', 'Art', 'Sports', 'Literature']).describe('The category of historical events to retrieve.'),
});
export type GenerateHistoricalEventsInput = z.infer<typeof GenerateHistoricalEventsInputSchema>;

const HistoricalEventSchema = z.object({
  title: z.string().describe('The title of the historical event.'),
  date: z.string().describe('The ISO date string of the historical event (YYYY-MM-DD).'),
  description: z.string().describe('A description of the historical event (50-100 words).'),
  category: z.enum(['Sociology', 'Technology', 'Philosophy', 'Science', 'Politics', 'Art', 'Sports', 'Literature']).describe('The category of the historical event.'),
  source: z.string().describe('URL to a reputable source verifying this historical event.'),
});

const GenerateHistoricalEventsOutputSchema = z.array(HistoricalEventSchema);
export type GenerateHistoricalEventsOutput = z.infer<typeof GenerateHistoricalEventsOutputSchema>;

const HistoricalEventsByCategorySchema = z.object({
  Sociology: z.array(HistoricalEventSchema),
  Technology: z.array(HistoricalEventSchema),
  Philosophy: z.array(HistoricalEventSchema),
  Science: z.array(HistoricalEventSchema),
  Politics: z.array(HistoricalEventSchema),
  Art: z.array(HistoricalEventSchema),
  Sports: z.array(HistoricalEventSchema),
  Literature: z.array(HistoricalEventSchema),
});

export type HistoricalEventsByCategory = z.infer<typeof HistoricalEventsByCategorySchema>;

const HISTORICAL_EVENTS_GENERATION_MODEL = 'googleai/gemini-3-flash-preview';

const SHARED_SINGLE_EVENT_CACHE_INSTRUCTIONS = `You are a passionate historian and educator specializing in historical events.

Your mission is to inspire and enlighten readers by sharing remarkable historical events that demonstrate human achievement, innovation, resilience, and progress.

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
- Category must match the requested category`;

const SINGLE_EVENT_TODAY_CACHE_INSTRUCTIONS = `${SHARED_SINGLE_EVENT_CACHE_INSTRUCTIONS}

Date rule:
- Only include events that happened on the exact same month and day as the live request date.

The live request will provide the date and category.`;

const SINGLE_EVENT_WEEK_CACHE_INSTRUCTIONS = `${SHARED_SINGLE_EVENT_CACHE_INSTRUCTIONS}

Date rule:
- Only include events whose MM-DD falls within the live request's week range.

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
- The category field must match the key it belongs to`;

const BATCH_EVENT_TODAY_CACHE_INSTRUCTIONS = `${SHARED_BATCH_EVENT_CACHE_INSTRUCTIONS}

Date rule:
- Only include events that happened on the exact same month and day as the live request date.

The live request will provide the date.`;

const BATCH_EVENT_WEEK_CACHE_INSTRUCTIONS = `${SHARED_BATCH_EVENT_CACHE_INSTRUCTIONS}

Date rule:
- Only include events that fall within the live request's week range.

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
    // Return empty array instead of throwing to allow partial data display
    return [];
  }
}

export async function generateHistoricalEventsByCategory(input: GenerateHistoricalEventsInput): Promise<HistoricalEventsByCategory> {
  try {
    return await generateHistoricalEventsByCategoryFlow(input);
  } catch (error) {
    console.error('Error generating batch historical events:', error);
    return {
      Sociology: [],
      Technology: [],
      Philosophy: [],
      Science: [],
      Politics: [],
      Art: [],
      Sports: [],
      Literature: [],
    };
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
    const {date} = input;
    if (date === 'This Week') {
      // Get today's date for context (Gemini will use week range to filter)
      const today = new Date().toISOString().slice(0, 10);
      const weekInfo = getWeekDateRange();
      const weekOutput = await generateHistoricalEventsWithCache({
        cacheId: 'historical-events-single-week',
        displayName: 'chronolens historical events single week',
        instructions: SINGLE_EVENT_WEEK_CACHE_INSTRUCTIONS,
        prompt: buildSingleEventWeekPrompt({ ...input, date: today }, weekInfo),
        outputSchema: GenerateHistoricalEventsOutputSchema,
        ttlSeconds: getTTLUntilEndOfWeek(),
      });
      // Filter out any events that don't match the week range
      return filterEventsByDateRange(weekOutput || [], weekInfo.startDate, weekInfo.endDate);
    }

    const todayOutput = await generateHistoricalEventsWithCache({
      cacheId: 'historical-events-single-today',
      displayName: 'chronolens historical events single today',
      instructions: SINGLE_EVENT_TODAY_CACHE_INSTRUCTIONS,
      prompt: buildSingleEventPrompt(input),
      outputSchema: GenerateHistoricalEventsOutputSchema,
      ttlSeconds: getTTLUntilMidnight(),
    });

    // Filter out any events that don't match the specific date
    const [, month, day] = date.split('-');
    const mmdd = `${month}-${day}`;
    return filterEventsByDateRange(todayOutput || [], mmdd, mmdd);
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
    const {date} = input;

    if (date === 'This Week') {
      // Get today's date for context (Gemini will use week range to filter)
      const today = new Date().toISOString().slice(0, 10);
      const weekInfo = getWeekDateRange();
      const weekOutput = await generateHistoricalEventsWithCache({
        cacheId: 'historical-events-batch-week',
        displayName: 'chronolens historical events batch week',
        instructions: BATCH_EVENT_WEEK_CACHE_INSTRUCTIONS,
        prompt: buildBatchEventWeekPrompt(today, weekInfo),
        outputSchema: HistoricalEventsByCategorySchema,
        ttlSeconds: getTTLUntilEndOfWeek(),
      });
      return filterByDateRangeForCategories(weekOutput || emptyCategoryMap(), weekInfo.startDate, weekInfo.endDate);
    }

    const todayOutput = await generateHistoricalEventsWithCache({
      cacheId: 'historical-events-batch-today',
      displayName: 'chronolens historical events batch today',
      instructions: BATCH_EVENT_TODAY_CACHE_INSTRUCTIONS,
      prompt: buildBatchEventPrompt(date),
      outputSchema: HistoricalEventsByCategorySchema,
      ttlSeconds: getTTLUntilMidnight(),
    });
    const [, month, day] = date.split('-');
    const mmdd = `${month}-${day}`;
    return filterByDateRangeForCategories(todayOutput || emptyCategoryMap(), mmdd, mmdd);
  }
);

function emptyCategoryMap(): HistoricalEventsByCategory {
  return {
    Sociology: [],
    Technology: [],
    Philosophy: [],
    Science: [],
    Politics: [],
    Art: [],
    Sports: [],
    Literature: [],
  };
}

function filterByDateRangeForCategories(
  eventsByCategory: HistoricalEventsByCategory,
  startMM_DD: string,
  endMM_DD: string
): HistoricalEventsByCategory {
  return {
    Sociology: filterEventsByDateRange(eventsByCategory.Sociology || [], startMM_DD, endMM_DD),
    Technology: filterEventsByDateRange(eventsByCategory.Technology || [], startMM_DD, endMM_DD),
    Philosophy: filterEventsByDateRange(eventsByCategory.Philosophy || [], startMM_DD, endMM_DD),
    Science: filterEventsByDateRange(eventsByCategory.Science || [], startMM_DD, endMM_DD),
    Politics: filterEventsByDateRange(eventsByCategory.Politics || [], startMM_DD, endMM_DD),
    Art: filterEventsByDateRange(eventsByCategory.Art || [], startMM_DD, endMM_DD),
    Sports: filterEventsByDateRange(eventsByCategory.Sports || [], startMM_DD, endMM_DD),
    Literature: filterEventsByDateRange(eventsByCategory.Literature || [], startMM_DD, endMM_DD),
  };
}

