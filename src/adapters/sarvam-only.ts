import { randomUUID } from 'node:crypto';
import type { ExtractionAdapter, FixtureMeta, AdapterResult } from '../types.js';
import type { BlankSection, FieldType, FormTemplate, QuestionField } from '../schema.js';
import { FormTemplateSchema } from '../schema.js';
import { digitiseDocument } from '../ocr/sarvam.js';
import { ocrCost } from '../config.js';
import { buildResult } from './base.js';

function inferType(label: string): FieldType {
  const l = label.toLowerCase();
  if (/\b(signature|signed|sign here|signee|representative)\b/.test(l)) return 'users';
  if (/(date|dob|birth)/.test(l)) return 'date-time';
  if (/(no\.?$|number|qty|quantity|amount|total|count|#)/.test(l)) return 'number';
  if (/(describe|description|notes|comments|details|remarks|explain|objection|recommendation)/.test(l)) return 'multi-line';
  if (/(url|website|link)/.test(l)) return 'url';
  return 'single-line';
}

function buildQuestion(questionValue: string, fieldType: FieldType): QuestionField {
  const base = { _id: randomUUID(), questionValue, isMandatory: false };
  switch (fieldType) {
    case 'single-select':
    case 'multi-select':
      return { ...base, fieldType, answerChoices: ['Yes', 'No'] };
    case 'look-up':
      return { ...base, fieldType, lookUpAnsFieldType: 'Location' };
    case 'single-line':
    case 'multi-line':
    case 'number':
    case 'date-time':
    case 'users':
    case 'fileUpload':
    case 'image':
    case 'geoLocation':
    case 'url':
      return { ...base, fieldType };
  }
}

// ---------------------------------------------------------------------------
// HTML-table-aware parser
// ---------------------------------------------------------------------------

const HTML_ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&apos;': "'",
  '&nbsp;': ' ',
};

function decodeEntities(s: string): string {
  return s.replace(/&[a-z]+;/gi, (m) => HTML_ENTITIES[m.toLowerCase()] ?? m);
}

const CHECKBOX_CHAR = /[☐□]/g;

// Cells that are pure project / form metadata — skip when emitting questions.
const METADATA_LABEL = /^(project|client|employer|gc|pmc|contractor|nominated\s+sub.*contractor|format\s+no\.?|sensitivity)\b/i;

// Lines that are obviously section-header-shaped (all caps, short).
function looksLikeSectionHeader(text: string): boolean {
  if (text.length > 80) return false;
  if (METADATA_LABEL.test(text)) return false;
  const letters = text.replace(/[^A-Za-z]/g, '');
  if (letters.length < 3) return false;
  // ≥ 70% uppercase letters → header.
  const upper = letters.replace(/[^A-Z]/g, '').length;
  if (upper / letters.length >= 0.7) return true;
  // Headers like "Comments / Recommendations of Engineer" — title case, trailing ":"
  if (/^[A-Z][A-Za-z\s/&-]*$/.test(text) && /^(comments|enclosures?|requested\s+by|received\s+by|safety|qa\s*\/?\s*qc|signatures?|approval|representatives?)\b/i.test(text)) {
    return true;
  }
  return false;
}

/**
 * Heuristic parser for Sarvam's HTML-flavored markdown output. Best-effort —
 * Sarvam emits `<table>...<td>cell</td>...</table>` even in `md` output mode
 * (no pure-markdown option exists per their docs). We strip tags, split on
 * cell boundaries, and look for label-shaped strings.
 */
function markdownToTemplate(rawMarkdown: string): FormTemplate {
  const decoded = decodeEntities(rawMarkdown);

  // Insert newlines at every cell / row / br / heading boundary so each
  // "logical line" carries one printed phrase.
  const flat = decoded
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\s*\/(td|th|tr|thead|tbody|table|h[1-6])\s*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[ \t]+/g, ' ');

  const lines: string[] = flat
    .split('\n')
    .map((l) => l.replace(/^[\s ]+|[\s ]+$/g, ''))
    .filter((l) => l.length > 0);

  const sections: BlankSection[] = [];
  let current: BlankSection = {
    _id: randomUUID(),
    sectionHeading: 'Header',
    sectionCode: 'SECTION_TYPE_BLANK_SECTION',
    questionFields: [],
  };
  sections.push(current);

  const seenLabels = new Set<string>();
  const pushQuestion = (label: string, type: FieldType) => {
    const norm = label.trim().replace(/[:\s]+$/, '');
    if (norm.length === 0 || norm.length > 120) return;
    const key = norm.toLowerCase();
    if (seenLabels.has(key)) return;
    seenLabels.add(key);
    current.questionFields.push(buildQuestion(norm, type));
  };

  for (const line of lines) {
    // Skip metadata identification lines (Project / Employer / GC / PMC / Contractor / Format / Sensitivity).
    if (METADATA_LABEL.test(line)) continue;

    // Checkbox-shaped cell: "☐ Label" or "□ Approved With Comments"
    if (CHECKBOX_CHAR.test(line)) {
      // Split on checkbox markers — a single cell may carry multiple options.
      const parts = line.split(CHECKBOX_CHAR).map((s) => s.trim()).filter(Boolean);
      for (const p of parts) {
        // Trim trailing context (e.g., "Roads" rather than "Roads Survey Tunnel Works ...").
        const first = p.split(/\s{2,}|\s+(?=☐|□)/)[0].trim();
        pushQuestion(first, 'single-select');
      }
      continue;
    }

    // Section header?
    if (looksLikeSectionHeader(line)) {
      current = {
        _id: randomUUID(),
        sectionHeading: line.replace(/[:.]+$/, '').trim(),
        sectionCode: 'SECTION_TYPE_BLANK_SECTION',
        questionFields: [],
      };
      sections.push(current);
      continue;
    }

    // A cell may pack multiple labels: "RFI NO: L&T/OG/RFI/    DATE:"
    // Split on long runs of whitespace, then process each chunk.
    const chunks = line.split(/\s{2,}/).map((c) => c.trim()).filter(Boolean);
    for (const chunk of chunks) {
      // Label-shaped: ends with a colon (possibly with trailing content), or is a bare field word.
      const labelMatch = /^([A-Za-z][A-Za-z0-9 .,'/&()-]{1,80})\s*:\s*(.*)$/.exec(chunk);
      if (labelMatch) {
        const label = labelMatch[1].trim();
        pushQuestion(label, inferType(label));
        continue;
      }
      // Bare common field words that often appear as label-only cells in Sarvam tables.
      if (/^(name|position|designation|signature|date(\s*&\s*time)?|date\s*&time|date\s*time)$/i.test(chunk)) {
        pushQuestion(chunk, inferType(chunk));
      }
    }
  }

  // Drop the implicit Header section if it ended up empty.
  return {
    template: sections.filter((s, i) => !(i === 0 && s.questionFields.length === 0)),
  };
}

export const sarvamOnlyAdapter: ExtractionAdapter = {
  name: 'sarvam-only',
  description: 'Sarvam Document Intelligence markdown → heuristic HTML-table parser (no LLM baseline).',
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
