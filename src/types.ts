import type { ExtractedTemplate, Field } from './schema.js';

export type { ExtractedTemplate, Field, Section, FieldType } from './schema.js';

export interface AdapterMetrics {
  latencyMs: number;
  costUsd: number;
  inputTokens?: number;
  outputTokens?: number;
  ocrPages?: number;
}

export interface AdapterResult {
  result: ExtractedTemplate | null;
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

export interface ScoreReport {
  fieldRecall: number;
  fieldPrecision: number;
  fieldF1: number;
  typeAccuracy: number;
  sectionAccuracy: number;
  labelSimilarity: number;
  requiredAccuracy: number;
  matchedPairs: number;
  unmatched: {
    extractedExtra: Field[];
    expectedMissing: Field[];
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
  expected: ExtractedTemplate;
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
