import { randomUUID } from 'node:crypto';
import type { ExtractionAdapter, FixtureMeta, AdapterResult } from '../types.js';
import type { BlankSection, FieldType, FormTemplate, QuestionField } from '../schema.js';
import { FormTemplateSchema } from '../schema.js';
import { digitiseDocument } from '../ocr/sarvam.js';
import { ocrCost } from '../config.js';
import { buildResult } from './base.js';

function inferType(label: string): FieldType {
  const l = label.toLowerCase();
  if (/\b(signature|signed|sign here|signee)\b/.test(l)) return 'users';
  if (/(date|dob|birth)/.test(l)) return 'date-time';
  if (/(no\.?|number|qty|quantity|amount|total|count|#)/.test(l)) return 'number';
  if (/(describe|description|notes|comments|details|remarks|explain)/.test(l)) return 'multi-line';
  if (/(url|website|link)/.test(l)) return 'url';
  return 'single-line';
}

function buildQuestion(questionValue: string, fieldType: FieldType): QuestionField {
  const base = { _id: randomUUID(), fieldLabel: 'Label', questionValue, isMandatory: false };
  switch (fieldType) {
    case 'single-select':
    case 'multi-select':
      return { ...base, fieldType, answerChoices: ['Yes', 'No'], viewType: 'list' };
    case 'date-time':
      return { ...base, fieldType, displayAs: 'dateOnly' };
    case 'users':
      return { ...base, fieldType, viewType: 'card', selectionType: 'singleUser' };
    case 'look-up':
      return { ...base, fieldType, lookUpAnsFieldType: 'Location' };
    case 'single-line':
    case 'multi-line':
    case 'number':
    case 'fileUpload':
    case 'image':
    case 'geoLocation':
    case 'url':
      return { ...base, fieldType };
  }
}

/**
 * Very small heuristic markdown parser: recognises headers (`#`-prefixed),
 * checkbox-shaped lines, and label-shaped lines like "Name: _____".
 *
 * Every header opens a new SECTION_TYPE_BLANK_SECTION. Sarvam markdown
 * doesn't tell us about table sections directly, so this baseline never
 * emits SECTION_TYPE_TABLE_SECTION — the +LLM variant is expected to.
 */
function markdownToTemplate(markdown: string): FormTemplate {
  const sections: BlankSection[] = [];
  let current: BlankSection = {
    _id: randomUUID(),
    sectionHeading: 'Header',
    sectionCode: 'SECTION_TYPE_BLANK_SECTION',
    questionFields: [],
  };
  sections.push(current);

  const lines = markdown.split('\n').map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    const headerMatch = /^#+\s+(.+)$/.exec(line);
    if (headerMatch) {
      current = {
        _id: randomUUID(),
        sectionHeading: headerMatch[1].trim(),
        sectionCode: 'SECTION_TYPE_BLANK_SECTION',
        questionFields: [],
      };
      sections.push(current);
      continue;
    }

    const checkboxMatch = /^(?:[-*]\s+)?\[[ x]\]\s+(.+)$/i.exec(line);
    if (checkboxMatch) {
      current.questionFields.push(buildQuestion(checkboxMatch[1].trim(), 'single-select'));
      continue;
    }

    const labelMatch = /^([A-Za-z][^:_]{1,60})\s*[:_]+\s*_*$/.exec(line);
    if (labelMatch) {
      const label = labelMatch[1].trim();
      current.questionFields.push(buildQuestion(label, inferType(label)));
    }
  }

  return {
    template: sections.filter((s, i) => !(i === 0 && s.questionFields.length === 0)),
  };
}

export const sarvamOnlyAdapter: ExtractionAdapter = {
  name: 'sarvam-only',
  description: 'Sarvam Document Intelligence markdown → heuristic template (no LLM).',
  async extract(pdfPath: string, meta: FixtureMeta): Promise<AdapterResult> {
    const start = performance.now();
    try {
      const { markdown, pages } = await digitiseDocument(pdfPath, meta.language);
      const template = markdownToTemplate(markdown);
      const parsed = FormTemplateSchema.safeParse(template);
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
