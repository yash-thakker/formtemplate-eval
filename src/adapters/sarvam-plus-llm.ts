import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { generateObject } from 'ai';
import type { ExtractionAdapter, FixtureMeta, AdapterResult } from '../types.js';
import { ExtractedTemplateSchema } from '../schema.js';
import { digitiseDocument } from '../ocr/sarvam.js';
import { getEnv, llmCost, ocrCost } from '../config.js';
import { TEMPLATE_EXTRACTION_SYSTEM, TEMPLATE_FROM_OCR_USER } from '../prompts/template-extraction.js';
import { buildResult } from './base.js';

export const sarvamPlusLlmAdapter: ExtractionAdapter = {
  name: 'sarvam-plus-llm',
  description: 'Sarvam Document Intelligence markdown → Gemini Flash structuring.',
  async extract(pdfPath: string, meta: FixtureMeta): Promise<AdapterResult> {
    const start = performance.now();
    const env = getEnv();
    if (!env.GOOGLE_GENERATIVE_AI_API_KEY) {
      return {
        result: null,
        rawOutput: null,
        metrics: { latencyMs: 0, costUsd: 0 },
        error: { message: 'GOOGLE_GENERATIVE_AI_API_KEY is not set' },
      };
    }
    try {
      const { markdown, pages } = await digitiseDocument(pdfPath, meta.language);

      const google = createGoogleGenerativeAI({ apiKey: env.GOOGLE_GENERATIVE_AI_API_KEY });
      const response = await generateObject({
        model: google('gemini-2.5-flash'),
        schema: ExtractedTemplateSchema,
        maxRetries: 2,
        system: TEMPLATE_EXTRACTION_SYSTEM,
        prompt: `${TEMPLATE_FROM_OCR_USER}${markdown}`,
      });

      const latencyMs = performance.now() - start;
      const inputTokens = response.usage?.promptTokens ?? 0;
      const outputTokens = response.usage?.completionTokens ?? 0;
      const costUsd =
        ocrCost('sarvam-doc-intel', pages) + llmCost('gemini-2.5-flash', inputTokens, outputTokens);

      const parsed = ExtractedTemplateSchema.safeParse(response.object);
      return buildResult(response.object, parsed, {
        latencyMs,
        costUsd,
        inputTokens,
        outputTokens,
        ocrPages: pages,
      });
    } catch (err) {
      const e = err as Error;
      return {
        result: null,
        rawOutput: null,
        metrics: { latencyMs: performance.now() - start, costUsd: 0 },
        error: { message: e.message, stack: e.stack },
      };
    }
  },
};
