import { createAnthropic } from '@ai-sdk/anthropic';
import type { ExtractionAdapter, FixtureMeta, AdapterResult } from '../types.js';
import { getEnv } from '../config.js';
import { runLLMExtraction } from './llm-shared.js';

export const claudeSonnetAdapter: ExtractionAdapter = {
  name: 'claude-sonnet',
  description: 'Anthropic Claude Sonnet 4.6 — PDF in, structured template out.',
  async extract(pdfPath: string, meta: FixtureMeta): Promise<AdapterResult> {
    const env = getEnv();
    if (!env.ANTHROPIC_API_KEY) {
      return {
        result: null,
        rawOutput: null,
        metrics: { latencyMs: 0, costUsd: 0 },
        error: { message: 'ANTHROPIC_API_KEY is not set' },
      };
    }
    const anthropic = createAnthropic({ apiKey: env.ANTHROPIC_API_KEY });
    return runLLMExtraction(
      { model: anthropic('claude-sonnet-4-6'), pricingKey: 'claude-sonnet-4-6', pdfPath },
      meta,
    );
  },
};
