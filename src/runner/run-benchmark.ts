import type { ExtractionAdapter, BenchmarkRow, Fixture, BenchmarkReport } from '../types.js';
import { runSingle } from './run-single.js';
import { logger } from '../utils/logger.js';
import { getEnv } from '../config.js';
import { execSync } from 'node:child_process';

function gitCommit(): string | null {
  try {
    return execSync('git rev-parse HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return null;
  }
}

async function mapWithConcurrency<I, O>(
  items: I[],
  concurrency: number,
  fn: (item: I) => Promise<O>,
): Promise<O[]> {
  const results: O[] = new Array(items.length);
  let next = 0;
  async function worker(): Promise<void> {
    while (true) {
      const idx = next++;
      if (idx >= items.length) return;
      results[idx] = await fn(items[idx]);
    }
  }
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

export interface RunBenchmarkOptions {
  useCache: boolean;
  concurrency?: number;
  retry?: boolean;
  onRow?: (row: BenchmarkRow) => void;
}

export async function runBenchmark(
  adapters: ExtractionAdapter[],
  fixtures: Fixture[],
  options: RunBenchmarkOptions,
): Promise<BenchmarkReport> {
  const env = getEnv();
  const concurrency = options.concurrency ?? env.EVAL_CONCURRENCY;
  const retry = options.retry ?? true;

  type Pair = { adapter: ExtractionAdapter; fixture: Fixture };
  const pairs: Pair[] = [];
  for (const a of adapters) for (const f of fixtures) pairs.push({ adapter: a, fixture: f });

  logger.info(
    { adapters: adapters.length, fixtures: fixtures.length, pairs: pairs.length, concurrency },
    'starting benchmark',
  );

  const rows = await mapWithConcurrency(pairs, concurrency, async ({ adapter, fixture }) => {
    const row = await runSingle(adapter, fixture, { useCache: options.useCache, retry });
    options.onRow?.(row);
    return row;
  });

  return {
    metadata: {
      timestamp: new Date().toISOString(),
      gitCommit: gitCommit(),
      nodeVersion: process.version,
      fixtureCount: fixtures.length,
      adapterCount: adapters.length,
      cacheEnabled: options.useCache,
    },
    rows,
  };
}
