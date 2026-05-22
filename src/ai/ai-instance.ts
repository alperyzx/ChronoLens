import {genkit} from 'genkit';
import {googleAI} from '@genkit-ai/google-genai';

const model = process.env.GENKIT_MODEL || 'googleai/gemini-3.1-flash-lite';

export const ai = genkit({
  plugins: [
    googleAI({
      apiKey: process.env.GOOGLE_GENAI_API_KEY,
    }),
  ],
  model,
});