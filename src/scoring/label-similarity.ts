import type { MatchResult } from './match-fields.js';

export function meanLabelSimilarity(match: MatchResult): number {
  if (match.matched.length === 0) return 0;
  const sum = match.matched.reduce((acc, m) => acc + m.similarity, 0);
  return sum / match.matched.length;
}
