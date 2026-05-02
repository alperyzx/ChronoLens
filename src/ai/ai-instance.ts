import {genkit} from 'genkit';
import {googleAI} from '@genkit-ai/googleai';

export const ai = genkit({
  plugins: [
    googleAI({
      apiKey: process.env.GOOGLE_GENAI_API_KEY,
      models: [
        'gemini-3-flash-preview',
        'gemini-3.1-flash-lite-preview',
        'gemini-3.1-pro-preview'
      ],
    }),
  ],
  model: 'googleai/gemini-3-flash-preview',
});