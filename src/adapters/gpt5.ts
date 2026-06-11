import { createOpenAI } from '@ai-sdk/openai';
import type { ExtractionAdapter, FixtureMeta, AdapterResult } from '../types.js';
import { getEnv } from '../config.js';
import { runLLMExtraction } from './llm-shared.js';

/**
 * OpenAI GPT-5 via the Responses API with minimal reasoning effort.
 *
 * Why the Responses API: GPT-5 is a reasoning model. On Chat Completions the
 * default reasoning effort produces multi-minute thinking phases for any
 * structured-output task with PDF input — which blew past our 90s timeout
 * (and even 180s). The Responses API is OpenAI's modern endpoint for
 * reasoning models and lets us pass `reasoning_effort: 'minimal'` via
 * provider options for fastest time-to-first-token. This is the right
 * setting for extraction-style tasks (no chain-of-thought needed).
 *
 * Docs: https://developers.openai.com/cookbook/examples/gpt-5/gpt-5_prompting_guide
 */
export const gpt5Adapter: ExtractionAdapter = {
  name: 'gpt5',
  description: 'OpenAI GPT-5 (Responses API, reasoning_effort=minimal) — PDF in, structured template out.',
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
    return runLLMExtraction(
      {
        model: openai.responses('gpt-5'),
        pricingKey: 'gpt-5',
        pdfPath,
        providerOptions: { openai: { reasoningEffort: 'minimal' } },
      },
      meta,
    );
  },
};
