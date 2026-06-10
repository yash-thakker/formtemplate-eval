import { randomUUID } from 'node:crypto';
import type { ExtractionAdapter, FixtureMeta, AdapterResult } from '../types.js';
import type { QuestionField } from '../schema.js';
import { FormTemplateSchema } from '../schema.js';
import { analyzeDocument } from '../ocr/textract.js';
import { ocrCost } from '../config.js';
import { buildResult } from './base.js';

/**
 * Textract Queries adapter — requires `queries` in the fixture meta.json.
 *
 * Each query becomes a `single-line` question whose `questionValue` is the
 * query text. The answer Textract found is stored in `fieldInstruction`
 * so it's visible in the raw output (the eval only scores the schema-shaped
 * fields, not the answers).
 *
 * Every query becomes one section so that flattened matching still has
 * section provenance.
 */
export const textractQueriesAdapter: ExtractionAdapter = {
  name: 'textract-queries',
  description: 'AWS Textract Queries. Fixture must declare per-form query list in meta.json.',
  async extract(pdfPath: string, meta: FixtureMeta): Promise<AdapterResult> {
    const start = performance.now();
    if (!meta.queries || meta.queries.length === 0) {
      return {
        result: null,
        rawOutput: null,
        metrics: { latencyMs: 0, costUsd: 0 },
        error: { message: 'textract-queries requires `queries` array in fixture meta.json' },
      };
    }
    try {
      const queries = meta.queries.map((q) => ({ Alias: q.alias, Text: q.text }));
      const { blocks, pages } = await analyzeDocument(pdfPath, ['QUERIES'], queries);

      const questionFields: QuestionField[] = [];
      for (const b of blocks) {
        if (b.BlockType !== 'QUERY' || !b.Query) continue;
        const questionValue = b.Query.Text ?? b.Query.Alias ?? 'query';
        // A QUERY may have multiple QUERY_RESULT links; pick the highest-confidence one.
        let answer: string | undefined;
        let bestConfidence = -Infinity;
        for (const rel of b.Relationships ?? []) {
          if (rel.Type !== 'ANSWER' || !rel.Ids) continue;
          for (const id of rel.Ids) {
            const ans = blocks.find((x) => x.Id === id && x.BlockType === 'QUERY_RESULT');
            if (!ans?.Text) continue;
            const conf = ans.Confidence ?? 0;
            if (conf > bestConfidence) {
              answer = ans.Text;
              bestConfidence = conf;
            }
          }
        }
        questionFields.push({
          _id: randomUUID(),
          fieldType: 'single-line',
          fieldLabel: 'Label',
          questionValue,
          isMandatory: false,
          fieldInstruction: answer,
        });
      }

      const template = {
        template: [
          {
            _id: randomUUID(),
            sectionHeading: 'Queries',
            sectionCode: 'SECTION_TYPE_BLANK_SECTION' as const,
            questionFields,
          },
        ],
      };
      const parsed = FormTemplateSchema.safeParse(template);
      const latencyMs = performance.now() - start;
      const costUsd = ocrCost('textract-queries', pages);
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
