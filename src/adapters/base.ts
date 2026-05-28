import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ExtractedTemplateSchema } from '../schema.js';
import type { ExtractionAdapter, AdapterResult, FixtureMeta } from '../types.js';
import { hashFile } from '../utils/hash.js';
import { logger } from '../utils/logger.js';
import { withTimeout } from '../utils/timing.js';
import { getEnv } from '../config.js';

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CACHE_DIR = join(projectRoot, 'cache');

export interface CachedAdapterEntry {
  result: AdapterResult;
  pdfHash: string;
  cachedAt: string;
}

async function cachePath(adapterName: string, pdfHash: string): Promise<string> {
  const dir = join(CACHE_DIR, adapterName);
  await mkdir(dir, { recursive: true });
  return join(dir, `${pdfHash}.json`);
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

export async function readCache(adapterName: string, pdfHash: string): Promise<AdapterResult | null> {
  const p = await cachePath(adapterName, pdfHash);
  if (!(await pathExists(p))) return null;
  try {
    const raw = await readFile(p, 'utf8');
    const entry = JSON.parse(raw) as CachedAdapterEntry;
    return entry.result;
  } catch (e) {
    logger.warn({ err: e, p }, 'failed to read cache entry');
    return null;
  }
}

export async function writeCache(
  adapterName: string,
  pdfHash: string,
  result: AdapterResult,
): Promise<void> {
  const p = await cachePath(adapterName, pdfHash);
  const entry: CachedAdapterEntry = {
    result,
    pdfHash,
    cachedAt: new Date().toISOString(),
  };
  await writeFile(p, JSON.stringify(entry, null, 2), 'utf8');
}

export interface RunAdapterOptions {
  useCache: boolean;
  timeoutMs?: number;
}

/**
 * Wraps an adapter's extract() with caching, validation, and a hard timeout.
 *
 * Adapters themselves must:
 *   - Never throw — catch and return { error } in AdapterResult.
 *   - Validate their own output against ExtractedTemplateSchema and set
 *     result: null on validation failure.
 *
 * This wrapper re-checks the schema as a safety net and enforces the timeout.
 */
export async function runAdapter(
  adapter: ExtractionAdapter,
  pdfPath: string,
  fixtureMeta: FixtureMeta,
  options: RunAdapterOptions,
): Promise<AdapterResult> {
  const env = getEnv();
  const timeoutMs = options.timeoutMs ?? env.EVAL_TIMEOUT_MS;
  const pdfHash = await hashFile(pdfPath);

  if (options.useCache) {
    const cached = await readCache(adapter.name, pdfHash);
    if (cached) {
      logger.debug({ adapter: adapter.name, pdfHash }, 'cache hit');
      return cached;
    }
  }

  let result: AdapterResult;
  try {
    result = await withTimeout(adapter.extract(pdfPath, fixtureMeta), timeoutMs, adapter.name);
  } catch (err) {
    const e = err as Error;
    result = {
      result: null,
      rawOutput: null,
      metrics: { latencyMs: timeoutMs, costUsd: 0 },
      error: { message: e.message, stack: e.stack },
    };
  }

  // Safety net schema validation — adapters should already do this, but
  // double-check before returning so a buggy adapter can't poison scoring.
  if (result.result) {
    const parsed = ExtractedTemplateSchema.safeParse(result.result);
    if (!parsed.success) {
      result = {
        ...result,
        result: null,
        error: result.error ?? {
          message: `Schema validation failed in wrapper: ${parsed.error.message}`,
        },
      };
    } else {
      result = { ...result, result: parsed.data };
    }
  }

  await writeCache(adapter.name, pdfHash, result);
  return result;
}

/**
 * Helper for adapters that validate their LLM output. Returns a normalized
 * AdapterResult that adapters can return directly.
 */
export function buildResult(
  raw: unknown,
  parsed: ReturnType<typeof ExtractedTemplateSchema.safeParse>,
  metrics: AdapterResult['metrics'],
): AdapterResult {
  if (!parsed.success) {
    return {
      result: null,
      rawOutput: raw,
      metrics,
      error: { message: `Schema validation failed: ${parsed.error.message}` },
    };
  }
  return { result: parsed.data, rawOutput: raw, metrics };
}
