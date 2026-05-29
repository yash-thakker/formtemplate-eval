import { textSimilarity } from './match-fields.js';
import type { MatchResult } from './match-fields.js';

const SECTION_HEADING_THRESHOLD = 0.7;

/**
 * For each matched question pair, the pair "shares a section" iff:
 *   - sectionHeading similarity >= 0.7, AND
 *   - sectionCode is identical (BLANK vs TABLE).
 *
 * Both must hold — section structure matters for downstream consumers.
 */
export function sectionAccuracy(match: MatchResult): number {
  if (match.matched.length === 0) return 0;
  let hits = 0;
  for (const m of match.matched) {
    const exSec = m.extracted.section;
    const expSec = m.expected.section;
    if (exSec.sectionCode !== expSec.sectionCode) continue;
    if (textSimilarity(exSec.sectionHeading, expSec.sectionHeading) < SECTION_HEADING_THRESHOLD) continue;
    hits += 1;
  }
  return hits / match.matched.length;
}
