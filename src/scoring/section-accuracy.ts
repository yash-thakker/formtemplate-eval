import { textSimilarity } from './match-fields.js';
import type { MatchResult } from './match-fields.js';

const SECTION_CODE_MISMATCH_PENALTY = 0.5;

/**
 * Soft section-context score for each matched question pair.
 *
 * Design choices:
 *   - Heading similarity contributes its raw value (0..1, no threshold).
 *     Near-matches get partial credit; identical headings get 1.0.
 *   - If sectionCode differs (BLANK vs TABLE), the score is multiplied by
 *     `SECTION_CODE_MISMATCH_PENALTY` rather than zeroed. Structural
 *     mismatches still hurt but never crush the metric.
 *
 * Range: 0..1. Average is reported.
 */
export function sectionAccuracy(match: MatchResult): number {
  if (match.matched.length === 0) return 0;
  let total = 0;
  for (const m of match.matched) {
    const sim = textSimilarity(
      m.extracted.section.sectionHeading,
      m.expected.section.sectionHeading,
    );
    const codeMatches = m.extracted.section.sectionCode === m.expected.section.sectionCode;
    total += codeMatches ? sim : sim * SECTION_CODE_MISMATCH_PENALTY;
  }
  return total / match.matched.length;
}
