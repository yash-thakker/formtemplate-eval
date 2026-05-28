import { createGoogleGenerativeAI } from '@ai-sdk/google';
import type { ExtractionAdapter, FixtureMeta, AdapterResult } from '../types.js';
import { getEnv } from '../config.js';
import { runLLMExtraction } from './llm-shared.js';

export const geminiFlashAdapter: ExtractionAdapter = {
  name: 'gemini-flash',
  description: 'Google Gemini 2.5 Flash — PDF in, structured template out (no separate OCR).',
  async extract(pdfPath: string, meta: FixtureMeta): Promise<AdapterResult> {
    const env = getEnv();
    if (!env.GOOGLE_GENERATIVE_AI_API_KEY) {
      return {
        result: null,
        rawOutput: null,
        metrics: { latencyMs: 0, costUsd: 0 },
        error: { message: 'GOOGLE_GENERATIVE_AI_API_KEY is not set' },
      };
    }
    const google = createGoogleGenerativeAI({ apiKey: env.GOOGLE_GENERATIVE_AI_API_KEY });
    return runLLMExtraction(
      { model: google('gemini-2.5-flash'), pricingKey: 'gemini-2.5-flash', pdfPath },
      meta,
    );
  },
};
