import { describe, it, expect } from 'vitest';
import { matchQuestions, textSimilarity, flattenQuestions } from '../../src/scoring/match-fields.js';
import type { FormTemplate, FormTemplateSection, QuestionField } from '../../src/schema.js';
import type { QuestionWithSection } from '../../src/types.js';

let _uuid = 0;
function uuid(): string {
  _uuid += 1;
  return `00000000-0000-0000-0000-${_uuid.toString().padStart(12, '0')}`;
}

function q(questionValue: string, fieldType: QuestionField['fieldType'] = 'single-line'): QuestionField {
  const base = { _id: uuid(), fieldLabel: 'Label', questionValue, isMandatory: false };
  if (fieldType === 'date-time') return { ...base, fieldType, displayAs: 'dateOnly' };
  if (fieldType === 'users') return { ...base, fieldType, viewType: 'card', selectionType: 'singleUser' };
  if (fieldType === 'single-select') return { ...base, fieldType, answerChoices: ['A', 'B'], viewType: 'list' };
  return { ...base, fieldType } as QuestionField;
}

function section(
  heading: string,
  questions: QuestionField[],
  code: FormTemplateSection['sectionCode'] = 'SECTION_TYPE_BLANK_SECTION',
): FormTemplateSection {
  if (code === 'SECTION_TYPE_TABLE_SECTION') {
    return { _id: uuid(), sectionHeading: heading, sectionCode: code, columnFields: questions, rowFields: [] };
  }
  return { _id: uuid(), sectionHeading: heading, sectionCode: code, questionFields: questions };
}

function tmpl(sections: FormTemplateSection[]): FormTemplate {
  return { template: sections };
}

function withSec(question: QuestionField, sec: FormTemplateSection): QuestionWithSection {
  return { question, section: sec };
}

describe('textSimilarity', () => {
  it('returns 1 for identical text', () => {
    expect(textSimilarity('Full Name', 'Full Name')).toBe(1);
  });
  it('ignores trailing colons and case', () => {
    expect(textSimilarity('Full Name:', 'full name')).toBe(1);
  });
  it('is low for unrelated text', () => {
    expect(textSimilarity('Phone Number', 'Date of Birth')).toBeLessThan(0.4);
  });
});

describe('flattenQuestions', () => {
  it('preserves section provenance and ordering', () => {
    const s1 = section('A', [q('q1'), q('q2')]);
    const s2 = section('B', [q('q3')]);
    const t = tmpl([s1, s2]);
    const flat = flattenQuestions(t);
    expect(flat).toHaveLength(3);
    expect(flat.map((f) => f.question.questionValue)).toEqual(['q1', 'q2', 'q3']);
    expect(flat[0].section.sectionHeading).toBe('A');
    expect(flat[2].section.sectionHeading).toBe('B');
  });
});

describe('matchQuestions', () => {
  it('returns all expected as missing when extracted is empty', () => {
    const s = section('S', [q('A'), q('B')]);
    const expected = [withSec(s.questionFields[0], s), withSec(s.questionFields[1], s)];
    const m = matchQuestions([], expected);
    expect(m.matched).toHaveLength(0);
    expect(m.expectedMissing).toHaveLength(2);
  });

  it('matches identical questionValues', () => {
    const s = section('S', [q('Name'), q('Date of Birth')]);
    const t = section('S', [q('Date of Birth'), q('Name')]);
    const m = matchQuestions(
      [withSec(t.questionFields[0], t), withSec(t.questionFields[1], t)],
      [withSec(s.questionFields[0], s), withSec(s.questionFields[1], s)],
    );
    expect(m.matched).toHaveLength(2);
    expect(m.extractedExtra).toHaveLength(0);
    expect(m.expectedMissing).toHaveLength(0);
  });

  it('rejects pairs below similarity threshold', () => {
    const s1 = section('A', [q('Customer Phone Number')]);
    const s2 = section('A', [q('Building Permit Number')]);
    const m = matchQuestions(
      [withSec(s1.questionFields[0], s1)],
      [withSec(s2.questionFields[0], s2)],
      0.6,
    );
    expect(m.matched).toHaveLength(0);
    expect(m.extractedExtra).toHaveLength(1);
    expect(m.expectedMissing).toHaveLength(1);
  });

  it('picks the better assignment when labels overlap', () => {
    const s1 = section('S', [q('Project Name'), q('Project Number')]);
    const s2 = section('S', [q('Project Number'), q('Project Name')]);
    const m = matchQuestions(
      [withSec(s1.questionFields[0], s1), withSec(s1.questionFields[1], s1)],
      [withSec(s2.questionFields[0], s2), withSec(s2.questionFields[1], s2)],
    );
    expect(m.matched).toHaveLength(2);
    const pairs = m.matched.map((p) => `${p.extracted.question.questionValue}->${p.expected.question.questionValue}`).sort();
    expect(pairs).toEqual(['Project Name->Project Name', 'Project Number->Project Number']);
  });
});
