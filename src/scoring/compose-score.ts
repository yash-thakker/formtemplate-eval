import type { FormTemplate } from '../schema.js';
import type { ScoreReport } from '../types.js';
import { flattenQuestions, matchQuestions } from './match-fields.js';
import { questionRecall } from './field-recall.js';
import { questionPrecision, questionF1 } from './field-precision.js';
import { typeAccuracy } from './type-accuracy.js';
import { sectionAccuracy } from './section-accuracy.js';
import { meanQuestionSimilarity } from './label-similarity.js';
import { requiredAccuracy } from './required-accuracy.js';

export interface ScoreOptions {
  minQuestionSimilarity?: number;
}

export function scoreTemplate(
  extracted: FormTemplate,
  expected: FormTemplate,
  options: ScoreOptions = {},
): ScoreReport {
  const extractedFlat = flattenQuestions(extracted);
  const expectedFlat = flattenQuestions(expected);
  const match = matchQuestions(extractedFlat, expectedFlat, options.minQuestionSimilarity);
  const recall = questionRecall(match, expectedFlat.length);
  const precision = questionPrecision(match, extractedFlat.length);
  return {
    fieldRecall: recall,
    fieldPrecision: precision,
    fieldF1: questionF1(precision, recall),
    typeAccuracy: typeAccuracy(match),
    sectionAccuracy: sectionAccuracy(match),
    labelSimilarity: meanQuestionSimilarity(match),
    requiredAccuracy: requiredAccuracy(match),
    matchedPairs: match.matched.length,
    unmatched: {
      extractedExtra: match.extractedExtra,
      expectedMissing: match.expectedMissing,
    },
  };
}
