import type { ExtractedTemplate } from '../schema.js';
import type { ScoreReport } from '../types.js';
import { matchFields } from './match-fields.js';
import { fieldRecall } from './field-recall.js';
import { fieldPrecision, fieldF1 } from './field-precision.js';
import { typeAccuracy } from './type-accuracy.js';
import { sectionAccuracy } from './section-accuracy.js';
import { meanLabelSimilarity } from './label-similarity.js';
import { requiredAccuracy } from './required-accuracy.js';

export interface ScoreOptions {
  minLabelSimilarity?: number;
}

export function scoreTemplate(
  extracted: ExtractedTemplate,
  expected: ExtractedTemplate,
  options: ScoreOptions = {},
): ScoreReport {
  const match = matchFields(extracted.fields, expected.fields, options.minLabelSimilarity);
  const recall = fieldRecall(match, expected.fields.length);
  const precision = fieldPrecision(match, extracted.fields.length);
  return {
    fieldRecall: recall,
    fieldPrecision: precision,
    fieldF1: fieldF1(precision, recall),
    typeAccuracy: typeAccuracy(match),
    sectionAccuracy: sectionAccuracy(match, extracted, expected),
    labelSimilarity: meanLabelSimilarity(match),
    requiredAccuracy: requiredAccuracy(match),
    matchedPairs: match.matched.length,
    unmatched: {
      extractedExtra: match.extractedExtra,
      expectedMissing: match.expectedMissing,
    },
  };
}
