import { readFile } from 'node:fs/promises';
import { generateObject } from 'ai';
import type { CoreUserMessage, LanguageModel } from 'ai';
import { FormTemplateSchema } from '../schema.js';
import type { AdapterResult, FixtureMeta } from '../types.js';
import { llmCost } from '../config.js';
import { logger } from '../utils/logger.js';
import { TEMPLATE_EXTRACTION_SYSTEM, TEMPLATE_EXTRACTION_USER } from '../prompts/template-extraction.js';

export type LLMPricingKey = 'gemini-2.5-flash' | 'gemini-2.5-pro' | 'claude-sonnet-4-6' | 'gpt-5';

export interface RunLLMArgs {
  model: LanguageModel;
  pricingKey: LLMPricingKey;
  pdfPath: string;
  /** Extra context appended to the user prompt (e.g., OCR output). */
  contextText?: string;
  /** Whether to also pass page images. Set false for pure text-context adapters. */
  attachPdf?: boolean;
}

export async function runLLMExtraction(args: RunLLMArgs, _meta: FixtureMeta): Promise<AdapterResult> {
  const start = performance.now();
  try {
    const fileBytes = args.attachPdf !== false ? new Uint8Array(await readFile(args.pdfPath)) : null;

    const userMessage: CoreUserMessage = {
      role: 'user',
      content: [
        { type: 'text', text: TEMPLATE_EXTRACTION_USER },
        ...(fileBytes ? [{ type: 'file' as const, data: fileBytes, mimeType: 'application/pdf' }] : []),
        ...(args.contextText ? [{ type: 'text' as const, text: args.contextText }] : []),
      ],
    };

    const response = await generateObject({
      model: args.model,
      schema: FormTemplateSchema,
      maxRetries: 2,
      system: TEMPLATE_EXTRACTION_SYSTEM,
      messages: [userMessage],
    });

    const latencyMs = performance.now() - start;
    const inputTokens = response.usage?.promptTokens ?? 0;
    const outputTokens = response.usage?.completionTokens ?? 0;
    const costUsd = llmCost(args.pricingKey, inputTokens, outputTokens);

    return {
      result: response.object,
      rawOutput: response.object,
      metrics: { latencyMs, costUsd, inputTokens, outputTokens },
    };
  } catch (err) {
    const e = err as Error;
    logger.error({ err: e, model: args.pricingKey }, 'LLM extraction failed');
    return {
      result: null,
      rawOutput: null,
      metrics: { latencyMs: performance.now() - start, costUsd: 0 },
      error: { message: e.message, stack: e.stack },
    };
  }
}
