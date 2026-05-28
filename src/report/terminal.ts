import Table from 'cli-table3';
import type { BenchmarkReport, BenchmarkRow } from '../types.js';

interface AdapterSummary {
  name: string;
  f1: number;
  typeAcc: number;
  sectionAcc: number;
  meanLatencyMs: number;
  totalCost: number;
  successRate: number;
}

export function summarizeByAdapter(rows: BenchmarkRow[]): AdapterSummary[] {
  const byAdapter = new Map<string, BenchmarkRow[]>();
  for (const r of rows) {
    const arr = byAdapter.get(r.adapterName) ?? [];
    arr.push(r);
    byAdapter.set(r.adapterName, arr);
  }
  const out: AdapterSummary[] = [];
  for (const [name, list] of byAdapter) {
    const ok = list.filter((r) => r.status === 'ok' && r.scores);
    const total = list.length;
    const f1 = ok.length === 0 ? 0 : ok.reduce((s, r) => s + (r.scores?.fieldF1 ?? 0), 0) / ok.length;
    const typeAcc = ok.length === 0 ? 0 : ok.reduce((s, r) => s + (r.scores?.typeAccuracy ?? 0), 0) / ok.length;
    const sectionAcc = ok.length === 0 ? 0 : ok.reduce((s, r) => s + (r.scores?.sectionAccuracy ?? 0), 0) / ok.length;
    const meanLatencyMs = total === 0 ? 0 : list.reduce((s, r) => s + r.metrics.latencyMs, 0) / total;
    const totalCost = list.reduce((s, r) => s + r.metrics.costUsd, 0);
    const successRate = total === 0 ? 0 : ok.length / total;
    out.push({ name, f1, typeAcc, sectionAcc, meanLatencyMs, totalCost, successRate });
  }
  return out.sort((a, b) => b.f1 - a.f1);
}

export function printTerminalReport(report: BenchmarkReport): void {
  const summary = summarizeByAdapter(report.rows);
  const table = new Table({
    head: ['Adapter', 'F1', 'Type Acc', 'Section Acc', 'Mean Latency', 'Total Cost', 'Success'],
    style: { head: ['cyan'] },
  });
  for (const s of summary) {
    table.push([
      s.name,
      s.f1.toFixed(3),
      s.typeAcc.toFixed(3),
      s.sectionAcc.toFixed(3),
      `${(s.meanLatencyMs / 1000).toFixed(1)}s`,
      `$${s.totalCost.toFixed(4)}`,
      `${(s.successRate * 100).toFixed(0)}%`,
    ]);
  }
  // eslint-disable-next-line no-console
  console.log(`\nBenchmark: ${report.rows.length} runs across ${report.metadata.adapterCount} adapters × ${report.metadata.fixtureCount} fixtures`);
  // eslint-disable-next-line no-console
  console.log(table.toString());
}
