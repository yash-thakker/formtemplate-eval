import { createOpenAI } from '@ai-sdk/openai';
import type { ExtractionAdapter, FixtureMeta, AdapterResult } from '../types.js';
import { getEnv } from '../config.js';
import { runLLMExtraction } from './llm-shared.js';

export const gpt5Adapter: ExtractionAdapter = {
  name: 'gpt5',
  description: 'OpenAI GPT-5 — PDF in, structured template out.',
  async extract(pdfPath: string, meta: FixtureMeta): Promise<AdapterResult> {
    const env = getEnv();
    if (!env.OPENAI_API_KEY) {
      return {
        result: null,
        rawOutput: null,
        metrics: { latencyMs: 0, costUsd: 0 },
        error: { message: 'OPENAI_API_KEY is not set' },
      };
    }
    const openai = createOpenAI({ apiKey: env.OPENAI_API_KEY });
    return runLLMExtraction({ model: openai('gpt-5'), pricingKey: 'gpt-5', pdfPath }, meta);
  },
};
