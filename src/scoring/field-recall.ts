import type { MatchResult } from './match-fields.js';

export function questionRecall(match: MatchResult, expectedCount: number): number {
  if (expectedCount === 0) return 1;
  return match.matched.length / expectedCount;
}
