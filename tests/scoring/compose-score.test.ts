import { describe, it, expect } from 'vitest';
import { scoreTemplate } from '../../src/scoring/compose-score.js';
import type { ExtractedTemplate } from '../../src/schema.js';

function template(partial: Partial<ExtractedTemplate>): ExtractedTemplate {
  return {
    name: 'Test',
    sections: [],
    fields: [],
    ...partial,
  };
}

describe('scoreTemplate', () => {
  it('gives a perfect score for identical templates', () => {
    const t = template({
      name: 'Form A',
      sections: [{ id: 's1', title: 'Section 1', order: 0 }],
      fields: [
        { id: 'name', label: 'Name', type: 'text', required: true, sectionId: 's1' },
        { id: 'dob', label: 'Date of Birth', type: 'date', required: false, sectionId: 's1' },
      ],
    });
    const r = scoreTemplate(t, t);
    expect(r.fieldRecall).toBe(1);
    expect(r.fieldPrecision).toBe(1);
    expect(r.fieldF1).toBe(1);
    expect(r.typeAccuracy).toBe(1);
    expect(r.sectionAccuracy).toBe(1);
    expect(r.labelSimilarity).toBe(1);
    expect(r.requiredAccuracy).toBe(1);
    expect(r.matchedPairs).toBe(2);
    expect(r.unmatched.extractedExtra).toHaveLength(0);
    expect(r.unmatched.expectedMissing).toHaveLength(0);
  });

  it('handles missing fields (lower recall)', () => {
    const expected = template({
      fields: [
        { id: 'a', label: 'Name', type: 'text', required: false },
        { id: 'b', label: 'DOB', type: 'date', required: false },
      ],
    });
    const extracted = template({
      fields: [{ id: 'a', label: 'Name', type: 'text', required: false }],
    });
    const r = scoreTemplate(extracted, expected);
    expect(r.fieldRecall).toBe(0.5);
    expect(r.fieldPrecision).toBe(1);
    expect(r.matchedPairs).toBe(1);
    expect(r.unmatched.expectedMissing.map((f) => f.label)).toEqual(['DOB']);
  });

  it('penalizes wrong type on matched fields', () => {
    const expected = template({
      fields: [{ id: 'a', label: 'Hire Date', type: 'date', required: false }],
    });
    const extracted = template({
      fields: [{ id: 'a', label: 'Hire Date', type: 'text', required: false }],
    });
    const r = scoreTemplate(extracted, expected);
    expect(r.fieldRecall).toBe(1);
    expect(r.typeAccuracy).toBe(0);
  });

  it('detects extras (lower precision)', () => {
    const expected = template({
      fields: [{ id: 'a', label: 'Name', type: 'text', required: false }],
    });
    const extracted = template({
      fields: [
        { id: 'a', label: 'Name', type: 'text', required: false },
        { id: 'b', label: 'Random Hallucinated Field', type: 'text', required: false },
      ],
    });
    const r = scoreTemplate(extracted, expected);
    expect(r.fieldRecall).toBe(1);
    expect(r.fieldPrecision).toBe(0.5);
    expect(r.unmatched.extractedExtra.map((f) => f.label)).toEqual(['Random Hallucinated Field']);
  });

  it('section accuracy passes for near-identical section titles', () => {
    const expected = template({
      sections: [{ id: 's1', title: 'Personal Information', order: 0 }],
      fields: [{ id: 'a', label: 'Name', type: 'text', required: false, sectionId: 's1' }],
    });
    const extracted = template({
      sections: [{ id: 'x', title: 'Personal Information:', order: 0 }],
      fields: [{ id: 'a', label: 'Name', type: 'text', required: false, sectionId: 'x' }],
    });
    const r = scoreTemplate(extracted, expected);
    expect(r.sectionAccuracy).toBe(1);
  });

  it('section accuracy fails when section titles are too different', () => {
    const expected = template({
      sections: [{ id: 's1', title: 'Personal Information', order: 0 }],
      fields: [{ id: 'a', label: 'Name', type: 'text', required: false, sectionId: 's1' }],
    });
    const extracted = template({
      sections: [{ id: 'x', title: 'Project Details', order: 0 }],
      fields: [{ id: 'a', label: 'Name', type: 'text', required: false, sectionId: 'x' }],
    });
    const r = scoreTemplate(extracted, expected);
    expect(r.sectionAccuracy).toBe(0);
  });
});
