#!/usr/bin/env node
import { Command } from 'commander';
import { join } from 'node:path';
import { ALL_ADAPTERS, selectAdapters } from './adapters/index.js';
import { discoverFixtures, loadFixture, selectFixtures, FIXTURES_DIR } from './runner/fixtures.js';
import { runBenchmark } from './runner/run-benchmark.js';
import { writeReportToDisk, findLatestReport, readReport } from './runner/write-report.js';
import { printTerminalReport } from './report/terminal.js';
import { renderMarkdownReport } from './report/markdown.js';
import { logger } from './utils/logger.js';
import { getEnv } from './config.js';
import { FormTemplateSchema } from './schema.js';

const program = new Command();
program.name('eval').description('Form-extraction benchmark/eval CLI').version('0.1.0');

function parseList(value: string): string[] {
  return value.split(',').map((s) => s.trim()).filter(Boolean);
}

program
  .command('list')
  .description('List discovered adapters and fixtures')
  .action(async () => {
    /* eslint-disable no-console */
    console.log('\nAdapters:');
    for (const a of ALL_ADAPTERS) {
      console.log(`  - ${a.name}  ${a.description}`);
    }
    const fixtures = await discoverFixtures();
    console.log(`\nFixtures (${fixtures.length}):`);
    if (fixtures.length === 0) {
      console.log(`  (none — drop input.pdf + expected.json + meta.json into ${FIXTURES_DIR}/<id>/)`);
    } else {
      for (const f of fixtures) {
        const qCount = f.expected.template.reduce((s, sec) => s + sec.questionFields.length, 0);
        console.log(`  - ${f.meta.id}  ${f.meta.name}  questions=${qCount} sections=${f.expected.template.length}`);
      }
    }
    /* eslint-enable no-console */
  });

program
  .command('run')
  .description('Run the benchmark (default: all adapters × all fixtures)')
  .option('--adapters <names>', 'Comma-separated adapter names', parseList)
  .option('--fixtures <ids>', 'Comma-separated fixture ids', parseList)
  .option('--no-cache', 'Disable cache reads (writes still happen)')
  .option('--concurrency <n>', 'Override concurrency', (v) => parseInt(v, 10))
  .action(async (opts: { adapters?: string[]; fixtures?: string[]; cache: boolean; concurrency?: number }) => {
    getEnv(); // validate env early
    const adapters = selectAdapters(opts.adapters);
    if (adapters.length === 0) {
      logger.error({ requested: opts.adapters }, 'No adapters matched');
      process.exit(1);
    }
    const allFixtures = await discoverFixtures();
    const fixtures = selectFixtures(allFixtures, opts.fixtures);
    if (fixtures.length === 0) {
      logger.error({ requested: opts.fixtures, available: allFixtures.length }, 'No fixtures matched');
      process.exit(1);
    }

    /* eslint-disable no-console */
    console.log(`\nRunning ${adapters.length} adapter(s) × ${fixtures.length} fixture(s)…`);
    const report = await runBenchmark(adapters, fixtures, {
      useCache: opts.cache,
      concurrency: opts.concurrency,
      retry: true,
      onRow: (row) => {
        const f1 = row.scores ? row.scores.fieldF1.toFixed(3) : '—';
        const marker = row.status === 'ok' ? '✓' : '✗';
        console.log(`  ${marker} ${row.adapterName} / ${row.fixtureId}  F1=${f1}  status=${row.status}${row.errorMessage ? `  err="${row.errorMessage.slice(0, 80)}"` : ''}`);
      },
    });

    const dir = await writeReportToDisk(report);
    console.log(`\nReport written to ${dir}`);
    printTerminalReport(report);
    /* eslint-enable no-console */
  });

program
  .command('validate-fixture')
  .description("Validate a fixture's expected.json against the schema")
  .requiredOption('--id <id>', 'Fixture id (directory name under fixtures/)')
  .action(async (opts: { id: string }) => {
    const dir = join(FIXTURES_DIR, opts.id);
    const fixture = await loadFixture(dir);
    /* eslint-disable no-console */
    if (!fixture) {
      console.error(`Fixture ${opts.id} not found or missing required files at ${dir}`);
      process.exit(1);
    }
    const parsed = FormTemplateSchema.safeParse(fixture.expected);
    if (!parsed.success) {
      console.error(`Schema invalid for fixture ${opts.id}:`);
      console.error(parsed.error.message);
      process.exit(1);
    }
    const qCount = fixture.expected.template.reduce((s, sec) => s + sec.questionFields.length, 0);
    console.log(`OK — fixture ${opts.id}: ${qCount} questions across ${fixture.expected.template.length} sections`);
    /* eslint-enable no-console */
  });

program
  .command('show-report')
  .description('Print the most recent benchmark report')
  .option('--dir <dir>', 'Specific report directory')
  .action(async (opts: { dir?: string }) => {
    const dir = opts.dir ?? (await findLatestReport());
    /* eslint-disable no-console */
    if (!dir) {
      console.error('No reports found.');
      process.exit(1);
    }
    const report = await readReport(dir);
    console.log(`Report: ${dir}`);
    printTerminalReport(report);
    /* eslint-enable no-console */
  });

program
  .command('compare')
  .description('Compare two report directories')
  .argument('<dirA>', 'First report directory')
  .argument('<dirB>', 'Second report directory')
  .action(async (dirA: string, dirB: string) => {
    const a = await readReport(dirA);
    const b = await readReport(dirB);
    /* eslint-disable no-console */
    console.log(`\nComparing:\n  A = ${dirA}\n  B = ${dirB}\n`);
    const byA = new Map<string, number>();
    const byB = new Map<string, number>();
    for (const r of a.rows) {
      if (!r.scores) continue;
      const cur = byA.get(r.adapterName) ?? 0;
      byA.set(r.adapterName, cur + r.scores.fieldF1);
    }
    for (const r of b.rows) {
      if (!r.scores) continue;
      const cur = byB.get(r.adapterName) ?? 0;
      byB.set(r.adapterName, cur + r.scores.fieldF1);
    }
    const names = new Set([...byA.keys(), ...byB.keys()]);
    console.log('Adapter             A mean F1     B mean F1     Δ');
    for (const name of names) {
      const ra = a.rows.filter((r) => r.adapterName === name && r.scores).length;
      const rb = b.rows.filter((r) => r.adapterName === name && r.scores).length;
      const fa = ra === 0 ? 0 : (byA.get(name) ?? 0) / ra;
      const fb = rb === 0 ? 0 : (byB.get(name) ?? 0) / rb;
      const d = fb - fa;
      const sign = d >= 0 ? '+' : '';
      console.log(`${name.padEnd(20)}${fa.toFixed(3).padEnd(14)}${fb.toFixed(3).padEnd(14)}${sign}${d.toFixed(3)}`);
    }
    /* eslint-enable no-console */
  });

program
  .command('render-markdown')
  .description('Print a report.md for the latest run (or --dir)')
  .option('--dir <dir>', 'Specific report directory')
  .action(async (opts: { dir?: string }) => {
    const dir = opts.dir ?? (await findLatestReport());
    /* eslint-disable no-console */
    if (!dir) {
      console.error('No reports found.');
      process.exit(1);
    }
    const report = await readReport(dir);
    console.log(renderMarkdownReport(report));
    /* eslint-enable no-console */
  });

program.parseAsync(process.argv).catch((err) => {
  logger.error({ err }, 'CLI crashed');
  process.exit(1);
});
