import { isTypedEntry } from '../schema.js';
import type { MatchResult } from './match-fields.js';

/**
 * Strict equality on `fieldType`. No partial credit for near-misses.
 *
 * Label-only column entries (no fieldType) are excluded from both
 * numerator and denominator — they're not typed inputs.
 */
export function typeAccuracy(match: MatchResult): number {
  const typedPairs = match.matched.filter(
    (m) => isTypedEntry(m.extracted.question) && isTypedEntry(m.expected.question),
  );
  if (typedPairs.length === 0) return 0;
  const hits = typedPairs.filter((m) => {
    // Both are QuestionField here, narrow with the type guard.
    if (!isTypedEntry(m.extracted.question) || !isTypedEntry(m.expected.question)) return false;
    return m.extracted.question.fieldType === m.expected.question.fieldType;
  }).length;
  return hits / typedPairs.length;
}
