import { createGoogleGenerativeAI } from '@ai-sdk/google';
import type { ExtractionAdapter, FixtureMeta, AdapterResult } from '../types.js';
import { FormTemplateSchema } from '../schema.js';
import { analyzeDocument } from '../ocr/textract.js';
import { blocksToCompactText } from './textract-mapper.js';
import { getEnv, llmCost, ocrCost } from '../config.js';
import { generateObject } from 'ai';
import { TEMPLATE_EXTRACTION_SYSTEM, TEMPLATE_FROM_OCR_USER } from '../prompts/template-extraction.js';
import { buildResult } from './base.js';

/**
 * Textract OCR → Gemini Flash structuring.
 *
 * We use Gemini Flash as the structuring LLM by default. The choice could
 * become configurable later if the user wants a Textract+claude or Textract+gpt5
 * variant, but the current spec calls for a single Textract+LLM adapter.
 */
export const textractPlusLlmAdapter: ExtractionAdapter = {
  name: 'textract-plus-llm',
  description: 'AWS Textract (FORMS+TABLES+LAYOUT+SIGNATURES) → Gemini Flash structuring.',
  async extract(pdfPath: string, _meta: FixtureMeta): Promise<AdapterResult> {
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
      const { blocks, pages } = await analyzeDocument(pdfPath, ['FORMS', 'TABLES', 'LAYOUT', 'SIGNATURES']);
      const ocrText = blocksToCompactText(blocks);

      const google = createGoogleGenerativeAI({ apiKey: env.GOOGLE_GENERATIVE_AI_API_KEY });
      const response = await generateObject({
        model: google('gemini-2.5-flash'),
        schema: FormTemplateSchema,
        maxRetries: 2,
        system: TEMPLATE_EXTRACTION_SYSTEM,
        prompt: `${TEMPLATE_FROM_OCR_USER}${ocrText}`,
      });

      const latencyMs = performance.now() - start;
      const inputTokens = response.usage?.promptTokens ?? 0;
      const outputTokens = response.usage?.completionTokens ?? 0;
      // FORMS+TABLES+LAYOUT pages; SIGNATURES free when combined.
      const costUsd =
        ocrCost('textract-forms', pages) +
        ocrCost('textract-tables', pages) +
        ocrCost('textract-layout', pages) +
        llmCost('gemini-2.5-flash', inputTokens, outputTokens);

      const parsed = FormTemplateSchema.safeParse(response.object);
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
