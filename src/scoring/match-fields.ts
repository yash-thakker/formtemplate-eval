import levenshtein from 'fast-levenshtein';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - no @types package
import munkres from 'munkres-js';
import type { FormTemplate } from '../schema.js';
import type { QuestionWithSection } from '../types.js';

const DEFAULT_MIN_SIMILARITY = 0.6;
const PAD_COST = 1000;

export interface QuestionMatch {
  extracted: QuestionWithSection;
  expected: QuestionWithSection;
  similarity: number;
}

export interface MatchResult {
  matched: QuestionMatch[];
  extractedExtra: QuestionWithSection[];
  expectedMissing: QuestionWithSection[];
}

function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/[:\s]+$/g, '').replace(/\s+/g, ' ');
}

/**
 * Normalized Levenshtein similarity in 0..1. Used for `questionValue` and
 * `sectionHeading` comparisons.
 */
export function textSimilarity(a: string, b: string): number {
  const na = normalize(a);
  const nb = normalize(b);
  if (na.length === 0 && nb.length === 0) return 1;
  const d = levenshtein.get(na, nb);
  const max = Math.max(na.length, nb.length);
  if (max === 0) return 1;
  return 1 - d / max;
}

/**
 * Flatten a FormTemplate into a list of `{ question, section }` tuples,
 * preserving section provenance for downstream scoring.
 */
export function flattenQuestions(template: FormTemplate): QuestionWithSection[] {
  const out: QuestionWithSection[] = [];
  for (const section of template.template) {
    for (const question of section.questionFields) {
      out.push({ question, section });
    }
  }
  return out;
}

/**
 * Bipartite match extracted questions to expected questions on
 * `questionValue` using the Hungarian algorithm. Matrix is padded to a
 * square so munkres can handle non-square inputs.
 */
export function matchQuestions(
  extracted: QuestionWithSection[],
  expected: QuestionWithSection[],
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

  const costs: number[][] = Array.from({ length: size }, () =>
    Array.from({ length: size }, () => PAD_COST),
  );
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      const sim = textSimilarity(extracted[i].question.questionValue, expected[j].question.questionValue);
      costs[i][j] = 1 - sim;
    }
  }

  const assignments = munkres(costs) as Array<[number, number]>;

  const matched: QuestionMatch[] = [];
  const usedExtracted = new Set<number>();
  const usedExpected = new Set<number>();
  for (const [i, j] of assignments) {
    if (i >= rows || j >= cols) continue;
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
