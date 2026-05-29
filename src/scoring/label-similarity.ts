import type { MatchResult } from './match-fields.js';

/** Mean similarity of matched `questionValue` pairs. */
export function meanQuestionSimilarity(match: MatchResult): number {
  if (match.matched.length === 0) return 0;
  return match.matched.reduce((acc, m) => acc + m.similarity, 0) / match.matched.length;
}
