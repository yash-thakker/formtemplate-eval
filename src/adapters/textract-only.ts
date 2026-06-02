import type { ExtractionAdapter, FixtureMeta, AdapterResult } from '../types.js';
import { FormTemplateSchema } from '../schema.js';
import { analyzeDocument } from '../ocr/textract.js';
import { blocksToTemplate } from './textract-mapper.js';
import { ocrCost } from '../config.js';
import { buildResult } from './base.js';

export const textractOnlyAdapter: ExtractionAdapter = {
  name: 'textract-only',
  description: 'AWS Textract (FORMS + TABLES + LAYOUT + SIGNATURES). No LLM — Block mapping only.',
  async extract(pdfPath: string, _meta: FixtureMeta): Promise<AdapterResult> {
    const start = performance.now();
    try {
      const { blocks, pages } = await analyzeDocument(pdfPath, ['FORMS', 'TABLES', 'LAYOUT', 'SIGNATURES']);
      const template = blocksToTemplate(blocks);
      const parsed = FormTemplateSchema.safeParse(template);
      const latencyMs = performance.now() - start;
      // FORMS+TABLES+LAYOUT pages; SIGNATURES is free when combined.
      const costUsd =
        ocrCost('textract-forms', pages) +
        ocrCost('textract-tables', pages) +
        ocrCost('textract-layout', pages);
      return buildResult(blocks, parsed, { latencyMs, costUsd, ocrPages: pages });
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
