import { describe, it, expect } from 'vitest';
import { scoreTemplate } from '../../src/scoring/compose-score.js';
import type { FormTemplate, FormTemplateSection, QuestionField } from '../../src/schema.js';

let _uuid = 0;
function uuid(): string {
  _uuid += 1;
  return `00000000-0000-0000-0000-${_uuid.toString().padStart(12, '0')}`;
}

function q(questionValue: string, fieldType: QuestionField['fieldType'] = 'single-line', isMandatory = false): QuestionField {
  const base = { _id: uuid(), fieldLabel: 'Label', questionValue, isMandatory };
  if (fieldType === 'date-time') return { ...base, fieldType, displayAs: 'dateOnly' };
  if (fieldType === 'users') return { ...base, fieldType, viewType: 'card', selectionType: 'singleUser' };
  if (fieldType === 'single-select') return { ...base, fieldType, answerChoices: ['Yes', 'No'], viewType: 'list' };
  return { ...base, fieldType } as QuestionField;
}

function section(heading: string, questions: QuestionField[], code: FormTemplateSection['sectionCode'] = 'SECTION_TYPE_BLANK_SECTION'): FormTemplateSection {
  return { _id: uuid(), sectionHeading: heading, sectionCode: code, questionFields: questions };
}

function tmpl(sections: FormTemplateSection[], name = 'Form'): FormTemplate {
  return { name, description: '', template: sections };
}

describe('scoreTemplate', () => {
  it('gives a perfect score for identical templates', () => {
    const t = tmpl([
      section('Personal Info', [q('Full Name', 'single-line', true), q('Date of Birth', 'date-time')]),
    ]);
    const r = scoreTemplate(t, t);
    expect(r.fieldRecall).toBe(1);
    expect(r.fieldPrecision).toBe(1);
    expect(r.fieldF1).toBe(1);
    expect(r.typeAccuracy).toBe(1);
    expect(r.sectionAccuracy).toBe(1);
    expect(r.labelSimilarity).toBe(1);
    expect(r.requiredAccuracy).toBe(1);
    expect(r.matchedPairs).toBe(2);
  });

  it('lowers recall when expected questions are missing', () => {
    const expected = tmpl([section('S', [q('Name'), q('DOB', 'date-time')])]);
    const extracted = tmpl([section('S', [q('Name')])]);
    const r = scoreTemplate(extracted, expected);
    expect(r.fieldRecall).toBe(0.5);
    expect(r.fieldPrecision).toBe(1);
    expect(r.unmatched.expectedMissing.map((x) => x.question.questionValue)).toEqual(['DOB']);
  });

  it('penalises wrong fieldType strictly (no partial credit)', () => {
    const expected = tmpl([section('S', [q('Hire Date', 'date-time')])]);
    const extracted = tmpl([section('S', [q('Hire Date', 'single-line')])]);
    const r = scoreTemplate(extracted, expected);
    expect(r.fieldRecall).toBe(1);
    expect(r.typeAccuracy).toBe(0);
  });

  it('lowers precision for hallucinated questions', () => {
    const expected = tmpl([section('S', [q('Name')])]);
    const extracted = tmpl([section('S', [q('Name'), q('Random Hallucinated Question')])]);
    const r = scoreTemplate(extracted, expected);
    expect(r.fieldRecall).toBe(1);
    expect(r.fieldPrecision).toBe(0.5);
    expect(r.unmatched.extractedExtra.map((x) => x.question.questionValue)).toEqual(['Random Hallucinated Question']);
  });

  it('sectionAccuracy is 1 when section heading and sectionCode both match', () => {
    const expected = tmpl([section('Personal Information', [q('Name')])]);
    const extracted = tmpl([section('Personal Information:', [q('Name')])]);
    const r = scoreTemplate(extracted, expected);
    expect(r.sectionAccuracy).toBe(1);
  });

  it('sectionAccuracy is 0 when sectionCode differs', () => {
    const expected = tmpl([section('Items', [q('Name')], 'SECTION_TYPE_BLANK_SECTION')]);
    const extracted = tmpl([section('Items', [q('Name')], 'SECTION_TYPE_TABLE_SECTION')]);
    const r = scoreTemplate(extracted, expected);
    expect(r.sectionAccuracy).toBe(0);
  });

  it('sectionAccuracy is 0 when section headings differ too much', () => {
    const expected = tmpl([section('Personal Information', [q('Name')])]);
    const extracted = tmpl([section('Project Details', [q('Name')])]);
    const r = scoreTemplate(extracted, expected);
    expect(r.sectionAccuracy).toBe(0);
  });

  it('requiredAccuracy compares isMandatory across matched pairs', () => {
    const expected = tmpl([section('S', [q('Name', 'single-line', true)])]);
    const extracted = tmpl([section('S', [q('Name', 'single-line', false)])]);
    const r = scoreTemplate(extracted, expected);
    expect(r.requiredAccuracy).toBe(0);
  });
});
