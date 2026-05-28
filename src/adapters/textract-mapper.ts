import type { Block } from '@aws-sdk/client-textract';
import type { ExtractedTemplate, Field, FieldType, Section } from '../schema.js';

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 60);
}

function ensureUnique(id: string, used: Set<string>): string {
  let candidate = id || 'field';
  let n = 1;
  while (used.has(candidate)) {
    candidate = `${id}-${n++}`;
  }
  used.add(candidate);
  return candidate;
}

function inferType(label: string): FieldType {
  const l = label.toLowerCase();
  if (/(date|dob|birth)/.test(l)) return 'date';
  if (/(no\.?|number|qty|quantity|amount|total|count)/.test(l)) return 'number';
  return 'text';
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

/**
 * Project a Textract Block list (from AnalyzeDocument with FORMS + TABLES +
 * LAYOUT + SIGNATURES) into our ExtractedTemplate shape.
 *
 * Rules (per spec):
 *   - KEY_VALUE_SET (KEY) → field; type 'checkbox' if VALUE contains a
 *     SELECTION_ELEMENT, otherwise inferred from the label.
 *   - SIGNATURE → field with type 'signature'.
 *   - TABLE → field with type 'table'.
 *   - LAYOUT_SECTION_HEADER → section.
 *   - LAYOUT_TITLE → form name (first one wins).
 */
export function blocksToTemplate(blocks: Block[]): ExtractedTemplate {
  const byId = blocksById(blocks);
  const sections: Section[] = [];
  const fields: Field[] = [];
  let name = 'Untitled Form';

  const usedIds = new Set<string>();
  const usedSectionIds = new Set<string>();
  let sectionOrder = 0;

  for (const b of blocks) {
    if (b.BlockType === 'LAYOUT_TITLE') {
      const t = textFor(b, byId);
      if (t && name === 'Untitled Form') name = t;
    } else if (b.BlockType === 'LAYOUT_SECTION_HEADER') {
      const title = textFor(b, byId);
      if (!title) continue;
      const id = ensureUnique(slugify(title) || 'section', usedSectionIds);
      sections.push({ id, title, order: sectionOrder++ });
    }
  }

  for (const b of blocks) {
    if (b.BlockType === 'KEY_VALUE_SET' && b.EntityTypes?.includes('KEY')) {
      const label = textFor(b, byId);
      if (!label) continue;
      // Look up the VALUE block paired via Relationships.VALUE
      let valueBlock: Block | undefined;
      for (const rel of b.Relationships ?? []) {
        if (rel.Type === 'VALUE' && rel.Ids) {
          for (const id of rel.Ids) {
            const v = byId.get(id);
            if (v?.BlockType === 'KEY_VALUE_SET') valueBlock = v;
          }
        }
      }
      const type: FieldType =
        valueBlock && hasSelectionChild(valueBlock, byId) ? 'checkbox' : inferType(label);
      const id = ensureUnique(slugify(label) || 'field', usedIds);
      fields.push({ id, label, type, required: false });
    } else if (b.BlockType === 'SIGNATURE') {
      const id = ensureUnique('signature', usedIds);
      fields.push({ id, label: 'Signature', type: 'signature', required: false });
    } else if (b.BlockType === 'TABLE') {
      const id = ensureUnique('table', usedIds);
      fields.push({ id, label: 'Table', type: 'table', required: false });
    }
  }

  return { name, sections, fields };
}

/**
 * Compact textual rendering of Textract Blocks for handing to an LLM as
 * context. Filters to the blocks the LLM actually needs (KEY/VALUE pairs,
 * table cells, layout headers/titles, signatures), no raw WORD spam.
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
          lines.push(`KEY: ${textFor(b, byId)}${hasSel ? '  [checkbox]' : ''}`);
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
