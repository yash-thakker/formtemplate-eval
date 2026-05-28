import type { MatchResult } from './match-fields.js';

export function requiredAccuracy(match: MatchResult): number {
  if (match.matched.length === 0) return 0;
  const hits = match.matched.filter((m) => m.extracted.required === m.expected.required).length;
  return hits / match.matched.length;
}
