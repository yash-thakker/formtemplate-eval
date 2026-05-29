import type { MatchResult } from './match-fields.js';

export function questionPrecision(match: MatchResult, extractedCount: number): number {
  if (extractedCount === 0) return 0;
  return match.matched.length / extractedCount;
}

export function questionF1(precision: number, recall: number): number {
  if (precision + recall === 0) return 0;
  return (2 * precision * recall) / (precision + recall);
}
