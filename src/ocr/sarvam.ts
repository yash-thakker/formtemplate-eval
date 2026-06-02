import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, basename } from 'node:path';
import AdmZip from 'adm-zip';
import { type SarvamAI, SarvamAIClient } from 'sarvamai';
import { getEnv } from '../config.js';
import { logger } from '../utils/logger.js';

export interface SarvamDigitiseResult {
  /** Markdown rendering of the document, extracted from the result ZIP. */
  markdown: string;
  /** Number of pages reported by the job's page metrics (for cost calc). */
  pages: number;
}

/**
 * Run Sarvam's Document Digitisation pipeline and return the markdown output.
 *
 * Uses the official `sarvamai` SDK's fluent job API:
 *   createJob → uploadFile → start → waitUntilComplete → downloadOutput
 *
 * The output is delivered as a ZIP archive containing a .md file plus a
 * page-level JSON sidecar. We extract just the .md and return it as a string.
 *
 * Job limits per current docs:
 *   - PDF: max 10 pages, 200 MB
 *   - Languages: BCP-47 codes (e.g. en-IN, hi-IN). Defaults to hi-IN if unset.
 */
export async function digitiseDocument(
  pdfPath: string,
  language?: string,
): Promise<SarvamDigitiseResult> {
  const env = getEnv();
  if (!env.SARVAM_API_KEY) throw new Error('SARVAM_API_KEY is not set');

  const client = new SarvamAIClient({ apiSubscriptionKey: env.SARVAM_API_KEY });

  // Default to English; pass an explicit BCP-47 code if provided.
  // SDK validates the value at runtime against its DocDigitizationSupportedLanguage union.
  const lang = (language ?? 'en-IN') as SarvamAI.DocDigitizationSupportedLanguage;

  const job = await client.documentIntelligence.createJob({
    language: lang,
    outputFormat: 'md',
  });
  logger.debug({ jobId: job.jobId }, 'sarvam: job created');

  await job.uploadFile(pdfPath);
  logger.debug({ jobId: job.jobId }, 'sarvam: file uploaded');

  await job.start();
  logger.debug({ jobId: job.jobId }, 'sarvam: job started');

  const status = await job.waitUntilComplete();
  logger.debug({ jobId: job.jobId, state: status.job_state }, 'sarvam: job done');
  if (status.job_state === 'Failed') {
    throw new Error(`Sarvam job failed for ${basename(pdfPath)}`);
  }

  // Download the result ZIP to a temp directory, then extract the .md entry.
  const workDir = await mkdtemp(join(tmpdir(), 'sarvam-'));
  const zipPath = join(workDir, 'output.zip');
  try {
    await job.downloadOutput(zipPath);
    const zipBytes = await readFile(zipPath);
    const zip = new AdmZip(zipBytes);
    const mdEntry = zip
      .getEntries()
      .find((e) => !e.isDirectory && e.entryName.toLowerCase().endsWith('.md'));
    if (!mdEntry) {
      throw new Error('Sarvam result ZIP did not contain a .md file');
    }
    const markdown = mdEntry.getData().toString('utf8');

    const pages = job.getPageMetrics().totalPages || 1;
    return { markdown, pages };
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}
