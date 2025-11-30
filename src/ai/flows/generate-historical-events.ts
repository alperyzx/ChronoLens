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

const historicalEventsPromptToday = ai.definePrompt({
  name: 'historicalEventsPromptToday',
  input: {
    schema: z.object({
      date: z.string().describe('The date for which to retrieve historical events (YYYY-MM-DD).'),
      category: z.enum(['Sociology', 'Technology', 'Philosophy', 'Science', 'Politics', 'Art', 'Sports', 'Literature']).describe('The category of historical events to retrieve.'),
    }),
  },
  output: {
    schema: z.array(z.object({
      title: z.string().describe('The title of the historical event.'),
      date: z.string().describe('The ISO date string of the historical event (YYYY-MM-DD).'),
      description: z.string().describe('A description of the historical event (50-100 words).'),
      category: z.enum(['Sociology', 'Technology', 'Philosophy', 'Science', 'Politics', 'Art', 'Sports', 'Literature']).describe('The category of the historical event.'),
      source: z.string().describe('URL to a reputable source verifying this historical event.'),
    })),
  },
  prompt: `You are a passionate historian and educator specializing in {{{category}}}. Your mission is to inspire and enlighten readers by sharing remarkable historical events that demonstrate human achievement, innovation, resilience, and progress.

For the date {{{date}}}, curate INSPIRING and MEANINGFUL historical events from past years that occurred on the EXACT same month and day (MM-DD). These events should:

✨ INSPIRE: Showcase breakthroughs, triumphs, courage, creativity, or pivotal moments that changed the world
✨ EDUCATE: Offer valuable lessons, insights, or perspectives that remain relevant today
✨ RESONATE: Connect emotionally with readers through stories of human achievement, discovery, or transformation
✨ MATTER: Focus on events with lasting impact or significance that people should remember

SELECTION CRITERIA:
- Prioritize events that demonstrate human potential, progress, or resilience
- Include diverse perspectives and underrepresented voices when relevant
- Choose events that teach us something valuable about ourselves or our world
- Avoid trivial, purely negative, or overly obscure events unless they have profound lessons

DATE ACCURACY:
Today's date is ${new Date().toISOString().split('T')[0]}. ONLY include events that happened on the same calendar day and month (MM-DD) in previous years. For example, if the date is 2023-04-15, only provide events that happened on April 15th in previous years, like 1912-04-15 or 1865-04-15.

IMPORTANT: STRICTLY verify that ALL returned event dates match the month and day of {{{date}}}. No event should be from a different month or day.

DESCRIPTION GUIDELINES:
Write descriptions (50-100 words) that:
- Start with the IMPACT or SIGNIFICANCE first
- Explain WHY this event matters and what we can learn from it
- Use engaging, accessible language that brings the story to life
- End with a thought-provoking insight or lasting legacy

Each event must include:
1. A compelling, clear title
2. A valid ISO date (YYYY-MM-DD) with matching month and day but from previous years
3. An inspiring description (50-100 words)
4. The matching category: {{{category}}}
5. A source URL to a reputable website (Wikipedia, Encyclopedia Britannica, History.com, academic institutions, or established historical organizations)

SOURCE VALIDATION:
- ONLY provide source URLs that you are confident are LIVE and ACCESSIBLE
- Use well-established, permanent URLs (e.g., Wikipedia articles, major encyclopedias)
- Prefer general reference pages over specific deep links that may have moved
- DO NOT guess or fabricate URLs - if unsure about a source, choose a different event that you can verify
- Each source must directly verify the event described

The output must be a JSON array. Make every event worth remembering.`,
});

const historicalEventsPromptWeek = ai.definePrompt({
  name: 'historicalEventsPromptWeek',
  input: {
    schema: z.object({
      date: z.string().describe('The date for which to retrieve historical events ("This Week").'),
      category: z.enum(['Sociology', 'Technology', 'Philosophy', 'Science', 'Politics', 'Art', 'Sports', 'Literature']).describe('The category of historical events to retrieve.'),
      weekRange: z.string().describe('The pre-calculated week range (e.g., "November 24-30")'),
      startMM_DD: z.string().describe('Start of week in MM-DD format'),
      endMM_DD: z.string().describe('End of week in MM-DD format'),
    }),
  },
  output: {
    schema: z.array(z.object({
      title: z.string().describe('The title of the historical event.'),
      date: z.string().describe('The ISO date string of the historical event (YYYY-MM-DD).'),
      description: z.string().describe('A description of the historical event (50-100 words).'),
      category: z.enum(['Sociology', 'Technology', 'Philosophy', 'Science', 'Politics', 'Art', 'Sports', 'Literature']).describe('The category of the historical event.'),
      source: z.string().describe('URL to a reputable source verifying this historical event.'),
    })),
  },
  prompt: `You are a passionate historian and educator specializing in {{{category}}}. Your mission is to inspire and enlighten readers by sharing remarkable historical events that demonstrate human achievement, innovation, resilience, and progress.

═══════════════════════════════════════════════════════════════════════════════
🗓️ THIS WEEK'S DATE RANGE: {{{weekRange}}}
📅 VALID DATES: Events must have MM-DD between {{{startMM_DD}}} and {{{endMM_DD}}}
═══════════════════════════════════════════════════════════════════════════════

You MUST ONLY return events that occurred during {{{weekRange}}} in past years.

EXAMPLES OF VALID vs INVALID DATES (if week is November 24-30):
✅ VALID: 1859-11-24 (November 24) - Darwin publishes Origin of Species
✅ VALID: 1942-11-28 (November 28) - Cocoanut Grove fire
✅ VALID: 1947-11-29 (November 29) - UN votes on Palestine partition
❌ INVALID: 1861-02-15 (February 15) - WRONG MONTH
❌ INVALID: 1905-02-02 (February 2) - WRONG MONTH
❌ INVALID: 1991-06-27 (June 27) - WRONG MONTH

🚨 CRITICAL REQUIREMENTS:
1. Every event date MUST have MM-DD between {{{startMM_DD}}} and {{{endMM_DD}}}
2. DO NOT include ANY event from February, June, August, or any month outside the current week
3. If you cannot find verified events for this specific week, return an EMPTY array []
4. It is better to return 0 events than to include events with wrong dates

For this week in history, curate INSPIRING and MEANINGFUL events. These events should:

✨ INSPIRE: Showcase breakthroughs, triumphs, courage, creativity, or pivotal moments that changed the world
✨ EDUCATE: Offer valuable lessons, insights, or perspectives that remain relevant today
✨ RESONATE: Connect emotionally with readers through stories of human achievement, discovery, or transformation
✨ MATTER: Focus on events with lasting impact or significance that people should remember

SELECTION CRITERIA:
- Prioritize events that demonstrate human potential, progress, or resilience
- Include diverse perspectives and underrepresented voices when relevant
- Choose events that teach us something valuable about ourselves or our world
- Avoid trivial, purely negative, or overly obscure events unless they have profound lessons

DESCRIPTION GUIDELINES:
Write descriptions (50-100 words) that:
- Start with the IMPACT or SIGNIFICANCE first
- Explain WHY this event matters and what we can learn from it
- Use engaging, accessible language that brings the story to life
- End with a thought-provoking insight or lasting legacy

Each event must include:
1. A compelling, clear title
2. A valid ISO date (YYYY-MM-DD) where MM-DD is between {{{startMM_DD}}} and {{{endMM_DD}}}
3. An inspiring description (50-100 words)
4. The matching category: {{{category}}}
5. A source URL to a reputable website (Wikipedia, Encyclopedia Britannica, History.com, or academic institutions)

SOURCE VALIDATION:
- ONLY provide source URLs that you are confident are LIVE and ACCESSIBLE
- Use well-established, permanent URLs (e.g., Wikipedia articles, major encyclopedias)
- DO NOT guess or fabricate URLs - if unsure about a source, choose a different event
- Each source must directly verify the event described

The output must be a JSON array. Return ONLY events that fall within {{{weekRange}}}. Make every event worth remembering.`,
});

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
    let output;
    if (date === 'This Week') {
      // Pre-calculate the week range
      const weekInfo = getWeekDateRange();
      const weekInput = {
        ...input,
        weekRange: weekInfo.monthDay,
        startMM_DD: weekInfo.startDate,
        endMM_DD: weekInfo.endDate,
      };
      const {output: weekOutput} = await historicalEventsPromptWeek(weekInput);
      // Filter out any events that don't match the week range
      output = filterEventsByDateRange(weekOutput || [], weekInfo.startDate, weekInfo.endDate);
    } else {
      const {output: todayOutput} = await historicalEventsPromptToday(input);
      // Filter out any events that don't match the specific date
      const [, month, day] = date.split('-');
      const mmdd = `${month}-${day}`;
      output = filterEventsByDateRange(todayOutput || [], mmdd, mmdd);
    }
    return output!;
  }
);

