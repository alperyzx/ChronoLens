// This is a server-side code.
'use server';

/**
 * @fileOverview Summarizes historical events for a given category.
 *
 * - summarizeHistoricalEvents - A function that summarizes historical events.
 * - SummarizeHistoricalEventsInput - The input type for the summarizeHistoricalEvents function.
 * - SummarizeHistoricalEventsOutput - The return type for the summarizeHistoricalEvents function.
 */

import {ai} from '@/ai/ai-instance';
import {z} from 'genkit';

const SummarizeHistoricalEventsInputSchema = z.object({
  category: z.string().describe('The category of historical events.'),
  events: z.array(
    z.object({
      title: z.string(),
      date: z.string(),
      description: z.string(),
      source: z.string().optional(),
    })
  ).describe('An array of historical events to summarize.'),
});
export type SummarizeHistoricalEventsInput = z.infer<typeof SummarizeHistoricalEventsInputSchema>;

const SummarizeHistoricalEventsOutputSchema = z.object({
  summary: z.string().describe('A summary of the historical events for the given category.'),
});
export type SummarizeHistoricalEventsOutput = z.infer<typeof SummarizeHistoricalEventsOutputSchema>;

export async function summarizeHistoricalEvents(input: SummarizeHistoricalEventsInput): Promise<SummarizeHistoricalEventsOutput> {
  return summarizeHistoricalEventsFlow(input);
}

const prompt = ai.definePrompt({
  name: 'summarizeHistoricalEventsPrompt',
  input: {
    schema: z.object({
      category: z.string().describe('The category of historical events.'),
      events: z.array(
        z.object({
          title: z.string(),
          date: z.string(),
          description: z.string(),
          source: z.string().optional(),
        })
      ).describe('An array of historical events to summarize.'),
    }),
  },
  output: {
    schema: z.object({
      summary: z.string().describe('A summary of the historical events for the given category.'),
    }),
  },
  prompt: `You are a historian summarizing historical events for the category: {{{category}}}.
  Summarize the following events into a concise paragraph:
  {{#each events}}
  - {{{title}}} ({{{date}}}): {{{description}}}{{#if source}} (Source: {{{source}}}){{/if}}
  {{/each}}
  `,
});

const summarizeHistoricalEventsFlow = ai.defineFlow<
  typeof SummarizeHistoricalEventsInputSchema,
  typeof SummarizeHistoricalEventsOutputSchema
>(
  {
    name: 'summarizeHistoricalEventsFlow',
    inputSchema: SummarizeHistoricalEventsInputSchema,
    outputSchema: SummarizeHistoricalEventsOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);

