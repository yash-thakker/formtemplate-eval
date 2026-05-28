import type { MatchResult } from './match-fields.js';

export function typeAccuracy(match: MatchResult): number {
  if (match.matched.length === 0) return 0;
  const hits = match.matched.filter((m) => m.extracted.type === m.expected.type).length;
  return hits / match.matched.length;
}
