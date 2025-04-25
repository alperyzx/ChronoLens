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

const GenerateHistoricalEventsInputSchema = z.object({
  date: z.string().describe('The date for which to retrieve historical events (YYYY-MM-DD or "This Week").'),
  category: z.enum(['Sociology', 'Technology', 'Philosophy', 'Science', 'Politics', 'Art']).describe('The category of historical events to retrieve.'),
});
export type GenerateHistoricalEventsInput = z.infer<typeof GenerateHistoricalEventsInputSchema>;

const HistoricalEventSchema = z.object({
  title: z.string().describe('The title of the historical event.'),
  date: z.string().describe('The ISO date string of the historical event (YYYY-MM-DD).'),
  description: z.string().describe('A description of the historical event (50-100 words).'),
  category: z.enum(['Sociology', 'Technology', 'Philosophy', 'Science', 'Politics', 'Art']).describe('The category of the historical event.'),
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
      category: z.enum(['Sociology', 'Technology', 'Philosophy', 'Science', 'Politics', 'Art']).describe('The category of historical events to retrieve.'),
    }),
  },
  output: {
    schema: z.array(z.object({
      title: z.string().describe('The title of the historical event.'),
      date: z.string().describe('The ISO date string of the historical event (YYYY-MM-DD).'),
      description: z.string().describe('A description of the historical event (50-100 words).'),
      category: z.enum(['Sociology', 'Technology', 'Philosophy', 'Science', 'Politics', 'Art']).describe('The category of the historical event.'),
      source: z.string().describe('URL to a reputable source verifying this historical event.'),
    })),
  },
  prompt: `As a historian specializing in {{{category}}}, provide significant historical events from past years related to {{{category}}} that occurred on the EXACT same month and day as {{{date}}}.

For the date {{{date}}}, ONLY include events that happened on the same calendar day and month (MM-DD) in previous years. For example, if the date is 2023-04-15, only provide events that happened on April 15th in previous years, like 1912-04-15 or 1865-04-15.

Today's date is ${new Date().toISOString().split('T')[0]}. 

IMPORTANT: STRICTLY verify that ALL returned event dates match the month and day of {{{date}}}. No event should be from a different month or day.

Ensure each event has a title, a valid ISO date (with matching month and day but from previous years), a description (50–100 words), a matching category, and a source URL to a reputable website (like Wikipedia, Encyclopedia Britannica, History.com, or academic institutions) that verifies the event.

The output must be a JSON array.`,
});

const historicalEventsPromptWeek = ai.definePrompt({
  name: 'historicalEventsPromptWeek',
  input: {
    schema: z.object({
      date: z.string().describe('The date for which to retrieve historical events ("This Week").'),
      category: z.enum(['Sociology', 'Technology', 'Philosophy', 'Science', 'Politics', 'Art']).describe('The category of historical events to retrieve.'),
    }),
  },
  output: {
    schema: z.array(z.object({
      title: z.string().describe('The title of the historical event.'),
      date: z.string().describe('The ISO date string of the historical event (YYYY-MM-DD).'),
      description: z.string().describe('A description of the historical event (50-100 words).'),
      category: z.enum(['Sociology', 'Technology', 'Philosophy', 'Science', 'Politics', 'Art']).describe('The category of the historical event.'),
      source: z.string().describe('URL to a reputable source verifying this historical event.'),
    })),
  },
  prompt: `As a historian specializing in {{{category}}}, provide significant historical events from past years related to {{{category}}} that occurred during this specific week of the year (same month and day range as the current week).

Today's date is ${new Date().toISOString().split('T')[0]}. Please provide events that happened during this same calendar week (same days and month) but in previous years.

For example, if today is March 20, provide events that happened between March 17-23 in previous years.

Ensure each event has:
1. A title
2. A valid ISO date (YYYY-MM-DD) that falls within this week's date range but from previous years
3. A description (50–100 words)
4. The matching category: {{{category}}}
5. A source URL to a reputable website (like Wikipedia, Encyclopedia Britannica, History.com, or academic institutions) that verifies the event. The source URL is REQUIRED and MUST be included for every single event.

The output must be a JSON array, with each event occurring during this same week in past years and MUST include a valid source URL for each event.`,
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
      const {output: weekOutput} = await historicalEventsPromptWeek(input);
      output = weekOutput;
    } else {
      const {output: todayOutput} = await historicalEventsPromptToday(input);
      output = todayOutput;
    }
    return output!;
  }
);

