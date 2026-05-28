import type { ExtractionAdapter, FixtureMeta, AdapterResult } from '../types.js';
import type { Field } from '../schema.js';
import { ExtractedTemplateSchema } from '../schema.js';
import { analyzeDocument } from '../ocr/textract.js';
import { ocrCost } from '../config.js';
import { buildResult } from './base.js';

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 60);
}

/**
 * Textract Queries adapter — requires `queries` in the fixture meta.json.
 *
 * Each query becomes a candidate field whose label is the query text. Query
 * answers populate `hint` so downstream consumers can see what Textract found
 * (the eval itself only scores the schema-shaped output).
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

      // Map QUERY blocks to fields.
      const fields: Field[] = [];
      const usedIds = new Set<string>();
      for (const b of blocks) {
        if (b.BlockType !== 'QUERY' || !b.Query) continue;
        const label = b.Query.Text ?? b.Query.Alias ?? 'query';
        const baseId = slugify(b.Query.Alias ?? label) || 'field';
        let id = baseId;
        let n = 1;
        while (usedIds.has(id)) id = `${baseId}-${n++}`;
        usedIds.add(id);
        // Find linked QUERY_RESULT for the hint.
        let answer: string | undefined;
        for (const rel of b.Relationships ?? []) {
          if (rel.Type !== 'ANSWER' || !rel.Ids) continue;
          const ans = blocks.find((x) => x.Id === rel.Ids![0] && x.BlockType === 'QUERY_RESULT');
          if (ans?.Text) answer = ans.Text;
        }
        fields.push({ id, label, type: 'text', required: false, hint: answer });
      }

      const template = { name: 'Untitled Form', sections: [], fields };
      const parsed = ExtractedTemplateSchema.safeParse(template);
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
