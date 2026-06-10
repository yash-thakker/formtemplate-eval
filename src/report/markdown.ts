import type { BenchmarkReport, BenchmarkRow } from '../types.js';
import { summarizeByAdapter } from './terminal.js';

function fmtPct(n: number): string {
  return (n * 100).toFixed(1) + '%';
}
function fmt3(n: number): string {
  return n.toFixed(3);
}
function fmtUsd(n: number): string {
  return '$' + n.toFixed(4);
}
function fmtMs(n: number): string {
  return (n / 1000).toFixed(2) + 's';
}

export function renderMarkdownReport(report: BenchmarkReport): string {
  const out: string[] = [];

  // 1. Run metadata
  out.push('# Form Extraction Eval — Benchmark Report');
  out.push('');
  out.push('## Run metadata');
  out.push('');
  out.push(`- **Timestamp:** ${report.metadata.timestamp}`);
  out.push(`- **Git commit:** ${report.metadata.gitCommit ?? '(not a git repo)'}`);
  out.push(`- **Node version:** ${report.metadata.nodeVersion}`);
  out.push(`- **Adapters:** ${report.metadata.adapterCount}`);
  out.push(`- **Fixtures:** ${report.metadata.fixtureCount}`);
  out.push(`- **Cache enabled:** ${report.metadata.cacheEnabled}`);
  out.push('');

  // 2. Summary table
  out.push('## Summary by adapter');
  out.push('');
  out.push('| Adapter | F1 | Type Acc | Section Acc | Mean Latency | Total Cost | Success Rate |');
  out.push('| --- | --- | --- | --- | --- | --- | --- |');
  for (const s of summarizeByAdapter(report.rows)) {
    out.push(
      `| ${s.name} | ${fmt3(s.f1)} | ${fmt3(s.typeAcc)} | ${fmt3(s.sectionAcc)} | ${fmtMs(s.meanLatencyMs)} | ${fmtUsd(s.totalCost)} | ${fmtPct(s.successRate)} |`,
    );
  }
  out.push('');

  // 3. Per-fixture detail table
  out.push('## Per-fixture detail');
  out.push('');
  out.push('| Fixture | Adapter | Status | F1 | Recall | Precision | Type | Section | Label sim | Required | Latency | Cost |');
  out.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
  const sorted = [...report.rows].sort((a, b) => a.fixtureId.localeCompare(b.fixtureId) || a.adapterName.localeCompare(b.adapterName));
  for (const r of sorted) {
    const s = r.scores;
    out.push(
      `| ${r.fixtureId} | ${r.adapterName} | ${r.status} | ${s ? fmt3(s.fieldF1) : '—'} | ${s ? fmt3(s.fieldRecall) : '—'} | ${s ? fmt3(s.fieldPrecision) : '—'} | ${s ? fmt3(s.typeAccuracy) : '—'} | ${s ? fmt3(s.sectionAccuracy) : '—'} | ${s ? fmt3(s.labelSimilarity) : '—'} | ${s ? fmt3(s.requiredAccuracy) : '—'} | ${fmtMs(r.metrics.latencyMs)} | ${fmtUsd(r.metrics.costUsd)} |`,
    );
  }
  out.push('');

  // 4. Failure analysis: worst 3 fixtures per adapter
  out.push('## Failure analysis');
  out.push('');
  const byAdapter = new Map<string, BenchmarkRow[]>();
  for (const r of report.rows) {
    const arr = byAdapter.get(r.adapterName) ?? [];
    arr.push(r);
    byAdapter.set(r.adapterName, arr);
  }
  for (const [adapterName, rows] of byAdapter) {
    const sorted = [...rows].sort((a, b) => {
      const af1 = a.scores?.fieldF1 ?? -1;
      const bf1 = b.scores?.fieldF1 ?? -1;
      return af1 - bf1;
    });
    out.push(`### ${adapterName}`);
    out.push('');
    const worst = sorted.slice(0, 3);
    for (const r of worst) {
      out.push(`**Fixture \`${r.fixtureId}\`** — F1 ${r.scores ? fmt3(r.scores.fieldF1) : '—'} (status: ${r.status})`);
      if (r.errorMessage) {
        out.push('');
        out.push('Error:');
        out.push('');
        out.push('```');
        out.push(r.errorMessage);
        out.push('```');
      }
      if (r.scores) {
        if (r.scores.unmatched.expectedMissing.length) {
          out.push('');
          out.push('Missing questions (in expected, not extracted):');
          for (const qs of r.scores.unmatched.expectedMissing) {
            out.push(`- "${qs.question.questionValue}" (${'fieldType' in qs.question ? qs.question.fieldType : 'label'}) in section "${qs.section.sectionHeading}"`);
          }
        }
        if (r.scores.unmatched.extractedExtra.length) {
          out.push('');
          out.push('Extra questions (extracted but not in expected):');
          for (const qs of r.scores.unmatched.extractedExtra) {
            out.push(`- "${qs.question.questionValue}" (${'fieldType' in qs.question ? qs.question.fieldType : 'label'}) in section "${qs.section.sectionHeading}"`);
          }
        }
      }
      out.push('');
    }
  }

  // 5. Cost breakdown
  out.push('## Cost breakdown');
  out.push('');
  out.push('| Adapter | Total Cost | Runs |');
  out.push('| --- | --- | --- |');
  for (const s of summarizeByAdapter(report.rows)) {
    const count = report.rows.filter((r) => r.adapterName === s.name).length;
    out.push(`| ${s.name} | ${fmtUsd(s.totalCost)} | ${count} |`);
  }
  const totalCost = report.rows.reduce((acc, r) => acc + r.metrics.costUsd, 0);
  out.push(`| **TOTAL** | **${fmtUsd(totalCost)}** | ${report.rows.length} |`);
  out.push('');

  return out.join('\n');
}
