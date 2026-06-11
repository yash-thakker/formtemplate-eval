import { mkdir, writeFile, readdir, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { BenchmarkReport } from '../types.js';
import { renderMarkdownReport } from '../report/markdown.js';
import { renderJsonReport } from '../report/json.js';

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const REPORTS_DIR = join(projectRoot, 'reports');

function timestampSlug(d = new Date()): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

export async function writeReportToDisk(report: BenchmarkReport): Promise<string> {
  const slug = timestampSlug(new Date(report.metadata.timestamp));
  const dir = join(REPORTS_DIR, slug);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'results.json'), renderJsonReport(report), 'utf8');
  await writeFile(join(dir, 'report.md'), renderMarkdownReport(report), 'utf8');

  // Per-(adapter, fixture) extraction files for easy auditing of what each
  // model produced. Useful for diffing against expected.json side-by-side.
  const extractionsDir = join(dir, 'extractions');
  await mkdir(extractionsDir, { recursive: true });
  for (const row of report.rows) {
    const payload = {
      adapter: row.adapterName,
      fixture: row.fixtureId,
      status: row.status,
      errorMessage: row.errorMessage,
      metrics: row.metrics,
      scores: row.scores,
      extracted: row.extracted,
    };
    const filename = `${row.adapterName}--${row.fixtureId}.json`;
    await writeFile(join(extractionsDir, filename), JSON.stringify(payload, null, 2), 'utf8');
  }

  return dir;
}

export async function findLatestReport(): Promise<string | null> {
  try {
    const entries = await readdir(REPORTS_DIR);
    const dirs = entries.filter((e) => !e.startsWith('.')).sort();
    if (dirs.length === 0) return null;
    return join(REPORTS_DIR, dirs[dirs.length - 1]);
  } catch {
    return null;
  }
}

export async function readReport(dir: string): Promise<BenchmarkReport> {
  const raw = await readFile(join(dir, 'results.json'), 'utf8');
  return JSON.parse(raw) as BenchmarkReport;
}
