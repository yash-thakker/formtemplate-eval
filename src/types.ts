import type {
  ColumnHeader,
  FormTemplate,
  FormTemplateSection,
  QuestionField,
} from './schema.js';

export type {
  ColumnHeader,
  FormTemplate,
  QuestionField,
  FormTemplateSection,
  FieldType,
} from './schema.js';

export interface AdapterMetrics {
  latencyMs: number;
  costUsd: number;
  inputTokens?: number;
  outputTokens?: number;
  ocrPages?: number;
}

export interface AdapterResult {
  result: FormTemplate | null;
  rawOutput: unknown;
  metrics: AdapterMetrics;
  error?: { message: string; stack?: string };
}

export interface FixtureMeta {
  id: string;
  name: string;
  notes?: string;
  queries?: Array<{ alias: string; text: string }>;
  language?: string;
}

export interface ExtractionAdapter {
  name: string;
  description: string;
  extract(pdfPath: string, fixtureMeta: FixtureMeta): Promise<AdapterResult>;
}

/**
 * A question OR a label-only column header, annotated with the section it
 * belongs to. Scoring uses this flattened-with-context view: matching
 * happens globally across the form on `questionValue`, while section
 * provenance is preserved so `sectionAccuracy` can compare the section
 * heading + sectionCode of each matched pair.
 *
 * Label-only column entries (table sections) are included so they
 * contribute to recall/precision and label similarity, but type and
 * required accuracy guards skip them since they have no fieldType.
 */
export interface QuestionWithSection {
  question: QuestionField | ColumnHeader;
  section: FormTemplateSection;
}

export interface ScoreReport {
  fieldRecall: number;
  fieldPrecision: number;
  fieldF1: number;
  typeAccuracy: number;
  /** Combined heading-fuzzy-match + sectionCode-equality on matched pairs. */
  sectionAccuracy: number;
  /** Mean Levenshtein similarity of questionValue across matched pairs. */
  labelSimilarity: number;
  /** Equality of `isMandatory` across matched pairs. */
  requiredAccuracy: number;
  matchedPairs: number;
  unmatched: {
    extractedExtra: QuestionWithSection[];
    expectedMissing: QuestionWithSection[];
  };
}

export type RunStatus = 'ok' | 'schema_invalid' | 'crashed' | 'timeout';

export interface BenchmarkRow {
  adapterName: string;
  fixtureId: string;
  scores: ScoreReport | null;
  metrics: AdapterMetrics;
  status: RunStatus;
  errorMessage?: string;
}

export interface Fixture {
  meta: FixtureMeta;
  pdfPath: string;
  expected: FormTemplate;
}

export interface BenchmarkRunMetadata {
  timestamp: string;
  gitCommit: string | null;
  nodeVersion: string;
  fixtureCount: number;
  adapterCount: number;
  cacheEnabled: boolean;
}

export interface BenchmarkReport {
  metadata: BenchmarkRunMetadata;
  rows: BenchmarkRow[];
}
