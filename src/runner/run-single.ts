import type { ExtractionAdapter, BenchmarkRow, Fixture } from '../types.js';
import { runAdapter } from '../adapters/base.js';
import { scoreTemplate } from '../scoring/compose-score.js';
import { withRetry } from './retry.js';
import { logger } from '../utils/logger.js';

export interface RunSingleOptions {
  useCache: boolean;
  timeoutMs?: number;
  retry: boolean;
}

export async function runSingle(
  adapter: ExtractionAdapter,
  fixture: Fixture,
  options: RunSingleOptions,
): Promise<BenchmarkRow> {
  const work = () => runAdapter(adapter, fixture.pdfPath, fixture.meta, { useCache: options.useCache, timeoutMs: options.timeoutMs });
  let result;
  try {
    result = options.retry
      ? await withRetry(work, { label: `${adapter.name}/${fixture.meta.id}` })
      : await work();
  } catch (err) {
    const e = err as Error;
    logger.error({ adapter: adapter.name, fixture: fixture.meta.id, err: e }, 'run-single crashed');
    return {
      adapterName: adapter.name,
      fixtureId: fixture.meta.id,
      scores: null,
      metrics: { latencyMs: 0, costUsd: 0 },
      status: e.message.toLowerCase().includes('timeout') ? 'timeout' : 'crashed',
      errorMessage: e.message,
    };
  }

  if (!result.result) {
    return {
      adapterName: adapter.name,
      fixtureId: fixture.meta.id,
      scores: null,
      metrics: result.metrics,
      status: result.error?.message.toLowerCase().includes('timeout') ? 'timeout' : 'schema_invalid',
      errorMessage: result.error?.message,
    };
  }

  const scores = scoreTemplate(result.result, fixture.expected);
  return {
    adapterName: adapter.name,
    fixtureId: fixture.meta.id,
    scores,
    metrics: result.metrics,
    status: 'ok',
  };
}
