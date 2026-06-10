import { isTypedEntry } from '../schema.js';
import type { MatchResult } from './match-fields.js';

/**
 * Equality of `isMandatory` across matched pairs.
 *
 * Label-only column entries are excluded (they have no isMandatory).
 */
export function requiredAccuracy(match: MatchResult): number {
  const typedPairs = match.matched.filter(
    (m) => isTypedEntry(m.extracted.question) && isTypedEntry(m.expected.question),
  );
  if (typedPairs.length === 0) return 0;
  const hits = typedPairs.filter((m) => {
    if (!isTypedEntry(m.extracted.question) || !isTypedEntry(m.expected.question)) return false;
    return m.extracted.question.isMandatory === m.expected.question.isMandatory;
  }).length;
  return hits / typedPairs.length;
}
