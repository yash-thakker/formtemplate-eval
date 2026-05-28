import levenshtein from 'fast-levenshtein';
// munkres-js has no types; declare the shape we use.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - no @types package
import munkres from 'munkres-js';
import type { Field } from '../schema.js';

const DEFAULT_MIN_SIMILARITY = 0.6;
const PAD_COST = 1000; // cost used to pad the matrix to a square

export interface FieldMatch {
  extracted: Field;
  expected: Field;
  similarity: number;
}

export interface MatchResult {
  matched: FieldMatch[];
  extractedExtra: Field[];
  expectedMissing: Field[];
}

function normalizeLabel(s: string): string {
  return s.trim().toLowerCase().replace(/[:\s]+$/g, '').replace(/\s+/g, ' ');
}

export function labelSimilarity(a: string, b: string): number {
  const na = normalizeLabel(a);
  const nb = normalizeLabel(b);
  if (na.length === 0 && nb.length === 0) return 1;
  const d = levenshtein.get(na, nb);
  const max = Math.max(na.length, nb.length);
  if (max === 0) return 1;
  return 1 - d / max;
}

/**
 * Find the best one-to-one assignment between extracted and expected fields.
 *
 * Uses normalized Levenshtein similarity on labels as the affinity metric,
 * runs Hungarian algorithm for the minimum-cost assignment, then rejects any
 * pair whose similarity is below `minSimilarity`.
 *
 * Matrix is padded with high-cost dummy rows/columns so munkres can handle
 * non-square inputs (which is the common case).
 */
export function matchFields(
  extracted: Field[],
  expected: Field[],
  minSimilarity: number = DEFAULT_MIN_SIMILARITY,
): MatchResult {
  if (extracted.length === 0 || expected.length === 0) {
    return {
      matched: [],
      extractedExtra: [...extracted],
      expectedMissing: [...expected],
    };
  }

  const rows = extracted.length;
  const cols = expected.length;
  const size = Math.max(rows, cols);

  // Build padded cost matrix: cost = 1 - similarity, dummy cells = PAD_COST.
  const costs: number[][] = Array.from({ length: size }, () =>
    Array.from({ length: size }, () => PAD_COST),
  );
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      const sim = labelSimilarity(extracted[i].label, expected[j].label);
      costs[i][j] = 1 - sim;
    }
  }

  const assignments = munkres(costs) as Array<[number, number]>;

  const matched: FieldMatch[] = [];
  const usedExtracted = new Set<number>();
  const usedExpected = new Set<number>();
  for (const [i, j] of assignments) {
    if (i >= rows || j >= cols) continue; // padded slot
    const sim = 1 - costs[i][j];
    if (sim < minSimilarity) continue;
    matched.push({ extracted: extracted[i], expected: expected[j], similarity: sim });
    usedExtracted.add(i);
    usedExpected.add(j);
  }

  const extractedExtra = extracted.filter((_, i) => !usedExtracted.has(i));
  const expectedMissing = expected.filter((_, j) => !usedExpected.has(j));

  return { matched, extractedExtra, expectedMissing };
}
