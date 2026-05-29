import type { MatchResult } from './match-fields.js';

/**
 * Strict equality on `fieldType`. No partial credit for near-misses (e.g.,
 * single-line vs multi-line both count as wrong).
 */
export function typeAccuracy(match: MatchResult): number {
  if (match.matched.length === 0) return 0;
  const hits = match.matched.filter(
    (m) => m.extracted.question.fieldType === m.expected.question.fieldType,
  ).length;
  return hits / match.matched.length;
}
