import { randomUUID } from 'node:crypto';
import type { Block } from '@aws-sdk/client-textract';
import type { FieldType, FormTemplate, FormTemplateSection, QuestionField } from '../schema.js';

function inferType(label: string, isSelection: boolean): FieldType {
  if (isSelection) return 'single-select';
  const l = label.toLowerCase();
  if (/\b(signature|signed|signee|sign here)\b/.test(l)) return 'users';
  if (/(date|dob|birth)/.test(l)) return 'date-time';
  if (/(no\.?|number|qty|quantity|amount|total|count|#)/.test(l)) return 'number';
  if (/(describe|description|notes|comments|details|remarks|explain)/.test(l)) return 'multi-line';
  if (/(url|website|link)/.test(l)) return 'url';
  return 'single-line';
}

function blocksById(blocks: Block[]): Map<string, Block> {
  const m = new Map<string, Block>();
  for (const b of blocks) if (b.Id) m.set(b.Id, b);
  return m;
}

function textFor(block: Block, byId: Map<string, Block>): string {
  if (!block.Relationships) return '';
  const parts: string[] = [];
  for (const rel of block.Relationships) {
    if (rel.Type !== 'CHILD' || !rel.Ids) continue;
    for (const id of rel.Ids) {
      const child = byId.get(id);
      if (!child) continue;
      if (child.BlockType === 'WORD' && child.Text) parts.push(child.Text);
      if (child.BlockType === 'SELECTION_ELEMENT' && child.SelectionStatus === 'SELECTED') parts.push('[X]');
    }
  }
  return parts.join(' ').trim();
}

function hasSelectionChild(block: Block, byId: Map<string, Block>): boolean {
  if (!block.Relationships) return false;
  for (const rel of block.Relationships) {
    if (rel.Type !== 'CHILD' || !rel.Ids) continue;
    for (const id of rel.Ids) {
      const child = byId.get(id);
      if (child?.BlockType === 'SELECTION_ELEMENT') return true;
    }
  }
  return false;
}

function buildQuestion(
  questionValue: string,
  fieldType: FieldType,
): QuestionField {
  const base = {
    _id: randomUUID(),
    fieldLabel: 'Label',
    questionValue,
    isMandatory: false,
  };
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
 * Project Textract Blocks (FORMS + TABLES + LAYOUT + SIGNATURES) into the
 * Cube FormTemplate shape.
 *
 * Rules:
 *   - LAYOUT_TITLE → form `name` (first one wins).
 *   - LAYOUT_SECTION_HEADER → a new section break. Questions following the
 *     header until the next header live inside it.
 *   - KEY_VALUE_SET (KEY) → a question. Type is `single-select` if the
 *     paired VALUE contains a SELECTION_ELEMENT, otherwise inferred from
 *     the label.
 *   - SIGNATURE → a `users` question (the platform's signature equivalent).
 *   - TABLE → a separate SECTION_TYPE_TABLE_SECTION with one question per
 *     header cell.
 *
 * Every section emitted gets a sectionCode; non-table sections default to
 * SECTION_TYPE_BLANK_SECTION.
 */
export function blocksToTemplate(blocks: Block[]): FormTemplate {
  const byId = blocksById(blocks);
  let name = 'Untitled Form';
  const sections: FormTemplateSection[] = [];

  // Use a single implicit "Header" section to collect anything before the
  // first explicit LAYOUT_SECTION_HEADER.
  let currentBlank: FormTemplateSection = {
    _id: randomUUID(),
    sectionHeading: 'Header',
    sectionCode: 'SECTION_TYPE_BLANK_SECTION',
    questionFields: [],
  };
  sections.push(currentBlank);

  for (const b of blocks) {
    switch (b.BlockType) {
      case 'LAYOUT_TITLE': {
        const t = textFor(b, byId);
        if (t && name === 'Untitled Form') name = t;
        break;
      }
      case 'LAYOUT_SECTION_HEADER': {
        const heading = textFor(b, byId);
        if (!heading) break;
        currentBlank = {
          _id: randomUUID(),
          sectionHeading: heading,
          sectionCode: 'SECTION_TYPE_BLANK_SECTION',
          questionFields: [],
        };
        sections.push(currentBlank);
        break;
      }
      case 'KEY_VALUE_SET': {
        if (!b.EntityTypes?.includes('KEY')) break;
        const label = textFor(b, byId);
        if (!label) break;
        let valueBlock: Block | undefined;
        for (const rel of b.Relationships ?? []) {
          if (rel.Type === 'VALUE' && rel.Ids) {
            for (const id of rel.Ids) {
              const v = byId.get(id);
              if (v?.BlockType === 'KEY_VALUE_SET') valueBlock = v;
            }
          }
        }
        const isSelection = valueBlock ? hasSelectionChild(valueBlock, byId) : false;
        const fieldType = inferType(label, isSelection);
        currentBlank.questionFields.push(buildQuestion(label, fieldType));
        break;
      }
      case 'SIGNATURE': {
        currentBlank.questionFields.push(buildQuestion('Signature', 'users'));
        break;
      }
      case 'TABLE': {
        // Each TABLE becomes its own section. Header cells (first row) become
        // the question fields of the table section.
        const tableSection: FormTemplateSection = {
          _id: randomUUID(),
          sectionHeading: 'Table',
          sectionCode: 'SECTION_TYPE_TABLE_SECTION',
          questionFields: [],
        };
        const cellIds: string[] = [];
        for (const rel of b.Relationships ?? []) {
          if (rel.Type === 'CHILD' && rel.Ids) cellIds.push(...rel.Ids);
        }
        const cells = cellIds
          .map((id) => byId.get(id))
          .filter((c): c is Block => c?.BlockType === 'CELL');
        // Prefer cells explicitly tagged as COLUMN_HEADER; fall back to row 1.
        let headerCells = cells.filter((c) => c.EntityTypes?.includes('COLUMN_HEADER'));
        if (headerCells.length === 0) headerCells = cells.filter((c) => c.RowIndex === 1);
        for (const cell of headerCells) {
          const text = textFor(cell, byId);
          if (!text) continue;
          tableSection.questionFields.push(buildQuestion(text, inferType(text, false)));
        }
        if (tableSection.questionFields.length > 0) sections.push(tableSection);
        break;
      }
      default:
        break;
    }
  }

  // Drop the implicit Header section if it ended up empty.
  const cleanSections = sections.filter((s, i) => !(i === 0 && s.questionFields.length === 0));

  return { name, description: '', template: cleanSections };
}

/**
 * Compact textual rendering of Textract Blocks for handing to an LLM as
 * context. Filtered to the blocks the LLM cares about (keys, signatures,
 * section headers, tables, titles); no raw WORD spam.
 */
export function blocksToCompactText(blocks: Block[]): string {
  const byId = blocksById(blocks);
  const lines: string[] = [];

  for (const b of blocks) {
    switch (b.BlockType) {
      case 'LAYOUT_TITLE':
        lines.push(`# TITLE: ${textFor(b, byId)}`);
        break;
      case 'LAYOUT_SECTION_HEADER':
        lines.push(`## SECTION: ${textFor(b, byId)}`);
        break;
      case 'KEY_VALUE_SET':
        if (b.EntityTypes?.includes('KEY')) {
          let valueBlock: Block | undefined;
          for (const rel of b.Relationships ?? []) {
            if (rel.Type === 'VALUE' && rel.Ids) {
              for (const id of rel.Ids) {
                const v = byId.get(id);
                if (v?.BlockType === 'KEY_VALUE_SET') valueBlock = v;
              }
            }
          }
          const hasSel = valueBlock ? hasSelectionChild(valueBlock, byId) : false;
          lines.push(`KEY: ${textFor(b, byId)}${hasSel ? '  [selection]' : ''}`);
        }
        break;
      case 'SIGNATURE':
        lines.push('SIGNATURE_LINE');
        break;
      case 'TABLE':
        lines.push(`TABLE (page ${b.Page})`);
        break;
      default:
        break;
    }
  }
  return lines.join('\n');
}
