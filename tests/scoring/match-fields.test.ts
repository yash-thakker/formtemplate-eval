import { describe, it, expect } from 'vitest';
import { matchFields, labelSimilarity } from '../../src/scoring/match-fields.js';
import type { Field } from '../../src/schema.js';

function f(id: string, label: string, type: Field['type'] = 'text', required = false): Field {
  return { id, label, type, required };
}

describe('labelSimilarity', () => {
  it('returns 1 for identical labels', () => {
    expect(labelSimilarity('Full Name', 'Full Name')).toBe(1);
  });

  it('ignores trailing colons and whitespace', () => {
    expect(labelSimilarity('Full Name:', 'Full Name')).toBe(1);
    expect(labelSimilarity('  Full Name  ', 'Full Name')).toBe(1);
  });

  it('is case-insensitive', () => {
    expect(labelSimilarity('FULL NAME', 'full name')).toBe(1);
  });

  it('returns a high value for near-matches', () => {
    expect(labelSimilarity('Phone Number', 'Phone Num')).toBeGreaterThan(0.6);
  });

  it('returns a low value for unrelated labels', () => {
    expect(labelSimilarity('Phone Number', 'Date of Birth')).toBeLessThan(0.4);
  });
});

describe('matchFields', () => {
  it('returns all expected as missing when extracted is empty', () => {
    const expected = [f('a', 'Name'), f('b', 'Date')];
    const m = matchFields([], expected);
    expect(m.matched).toHaveLength(0);
    expect(m.expectedMissing).toHaveLength(2);
    expect(m.extractedExtra).toHaveLength(0);
  });

  it('returns all extracted as extras when expected is empty', () => {
    const extracted = [f('a', 'Name')];
    const m = matchFields(extracted, []);
    expect(m.matched).toHaveLength(0);
    expect(m.extractedExtra).toHaveLength(1);
    expect(m.expectedMissing).toHaveLength(0);
  });

  it('matches exact label pairs', () => {
    const extracted = [f('1', 'Name'), f('2', 'Date of Birth')];
    const expected = [f('a', 'Date of Birth'), f('b', 'Name')];
    const m = matchFields(extracted, expected);
    expect(m.matched).toHaveLength(2);
    expect(m.extractedExtra).toHaveLength(0);
    expect(m.expectedMissing).toHaveLength(0);
  });

  it('rejects matches below the similarity threshold', () => {
    const extracted = [f('1', 'Customer Phone Number')];
    const expected = [f('a', 'Building Permit Number')];
    const m = matchFields(extracted, expected, 0.6);
    expect(m.matched).toHaveLength(0);
    expect(m.extractedExtra).toHaveLength(1);
    expect(m.expectedMissing).toHaveLength(1);
  });

  it('picks the better assignment when labels overlap partially', () => {
    const extracted = [f('1', 'Project Name'), f('2', 'Project Number')];
    const expected = [f('a', 'Project Number'), f('b', 'Project Name')];
    const m = matchFields(extracted, expected);
    expect(m.matched).toHaveLength(2);
    const labels = m.matched.map((p) => `${p.extracted.label}->${p.expected.label}`).sort();
    expect(labels).toEqual(['Project Name->Project Name', 'Project Number->Project Number']);
  });

  it('reports extras and missings when sizes differ', () => {
    const extracted = [f('1', 'Name'), f('2', 'Address'), f('3', 'Garbage Extra')];
    const expected = [f('a', 'Name'), f('b', 'Phone')];
    const m = matchFields(extracted, expected);
    expect(m.matched.length).toBe(1);
    expect(m.matched[0].extracted.label).toBe('Name');
    expect(m.expectedMissing.map((x) => x.label).sort()).toEqual(['Phone']);
    expect(m.extractedExtra.map((x) => x.label).sort()).toEqual(['Address', 'Garbage Extra']);
  });

  it('matches when labels differ only in punctuation/case', () => {
    const extracted = [f('1', 'date of birth:')];
    const expected = [f('a', 'Date of Birth')];
    const m = matchFields(extracted, expected);
    expect(m.matched).toHaveLength(1);
    expect(m.matched[0].similarity).toBe(1);
  });
});
