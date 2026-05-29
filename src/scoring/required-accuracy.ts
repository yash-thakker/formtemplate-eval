import type { MatchResult } from './match-fields.js';

/** Equality of `isMandatory` across matched pairs. */
export function requiredAccuracy(match: MatchResult): number {
  if (match.matched.length === 0) return 0;
  const hits = match.matched.filter(
    (m) => m.extracted.question.isMandatory === m.expected.question.isMandatory,
  ).length;
  return hits / match.matched.length;
}
