import type { ExtractedTemplate, Section } from '../schema.js';
import { labelSimilarity } from './match-fields.js';
import type { MatchResult } from './match-fields.js';

const SECTION_MATCH_THRESHOLD = 0.7;

function titleFor(template: ExtractedTemplate, sectionId: string | undefined): string | undefined {
  if (!sectionId) return undefined;
  const sec: Section | undefined = template.sections.find((s) => s.id === sectionId);
  return sec?.title;
}

/**
 * For each matched field pair, both sides must either share an unset section
 * or have sections whose titles fuzzy-match (>= SECTION_MATCH_THRESHOLD).
 */
export function sectionAccuracy(
  match: MatchResult,
  extractedTemplate: ExtractedTemplate,
  expectedTemplate: ExtractedTemplate,
): number {
  if (match.matched.length === 0) return 0;
  let hits = 0;
  for (const m of match.matched) {
    const extractedTitle = titleFor(extractedTemplate, m.extracted.sectionId);
    const expectedTitle = titleFor(expectedTemplate, m.expected.sectionId);
    if (!extractedTitle && !expectedTitle) {
      hits += 1;
      continue;
    }
    if (!extractedTitle || !expectedTitle) continue;
    if (labelSimilarity(extractedTitle, expectedTitle) >= SECTION_MATCH_THRESHOLD) hits += 1;
  }
  return hits / match.matched.length;
}
