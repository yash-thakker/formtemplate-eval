import type { ExtractionAdapter, FixtureMeta, AdapterResult } from '../types.js';
import type { Field, FieldType, Section } from '../schema.js';
import { ExtractedTemplateSchema } from '../schema.js';
import { digitiseDocument } from '../ocr/sarvam.js';
import { ocrCost } from '../config.js';
import { buildResult } from './base.js';

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-').slice(0, 60);
}

function inferType(label: string): FieldType {
  const l = label.toLowerCase();
  if (/(date|dob|birth)/.test(l)) return 'date';
  if (/(no\.?|number|qty|quantity|amount|total|count)/.test(l)) return 'number';
  return 'text';
}

/**
 * Very small heuristic parser: scan Sarvam's markdown output for headers
 * and field-shaped lines (lines ending with a colon or with a blank/`____`).
 * This is a baseline — the +LLM variant is expected to do far better.
 */
function markdownToTemplate(markdown: string, name = 'Untitled Form') {
  const sections: Section[] = [];
  const fields: Field[] = [];
  const usedFieldIds = new Set<string>();
  const usedSectionIds = new Set<string>();
  let currentSectionId: string | undefined;
  let order = 0;

  const lines = markdown.split('\n').map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    const headerMatch = /^#+\s+(.+)$/.exec(line);
    if (headerMatch) {
      const title = headerMatch[1].trim();
      let id = slugify(title) || 'section';
      let n = 1;
      while (usedSectionIds.has(id)) id = `${slugify(title)}-${n++}`;
      usedSectionIds.add(id);
      sections.push({ id, title, order: order++ });
      currentSectionId = id;
      continue;
    }

    // checkbox-shaped: "[ ] Some option" or "- [ ] Some option"
    const checkboxMatch = /^(?:[-*]\s+)?\[[ x]\]\s+(.+)$/i.exec(line);
    if (checkboxMatch) {
      const label = checkboxMatch[1].trim();
      let id = slugify(label) || 'field';
      let n = 1;
      while (usedFieldIds.has(id)) id = `${slugify(label)}-${n++}`;
      usedFieldIds.add(id);
      fields.push({ id, label, type: 'checkbox', required: false, sectionId: currentSectionId });
      continue;
    }

    // field-shaped: "Label:" or "Label: ____" or "Label _____"
    const labelMatch = /^([A-Za-z][^:_]{1,60})\s*[:_]+\s*_*$/.exec(line);
    if (labelMatch) {
      const label = labelMatch[1].trim();
      let id = slugify(label) || 'field';
      let n = 1;
      while (usedFieldIds.has(id)) id = `${slugify(label)}-${n++}`;
      usedFieldIds.add(id);
      fields.push({
        id,
        label,
        type: inferType(label),
        required: false,
        sectionId: currentSectionId,
      });
    }
  }

  return { name, sections, fields };
}

export const sarvamOnlyAdapter: ExtractionAdapter = {
  name: 'sarvam-only',
  description: 'Sarvam Document Intelligence markdown → heuristic template (no LLM).',
  async extract(pdfPath: string, meta: FixtureMeta): Promise<AdapterResult> {
    const start = performance.now();
    try {
      const { markdown, pages } = await digitiseDocument(pdfPath, meta.language);
      const template = markdownToTemplate(markdown, meta.name);
      const parsed = ExtractedTemplateSchema.safeParse(template);
      const latencyMs = performance.now() - start;
      const costUsd = ocrCost('sarvam-doc-intel', pages);
      return buildResult(markdown, parsed, { latencyMs, costUsd, ocrPages: pages });
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
