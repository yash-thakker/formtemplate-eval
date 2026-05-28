import type { BenchmarkReport } from '../types.js';

export function renderJsonReport(report: BenchmarkReport): string {
  return JSON.stringify(report, null, 2);
}
