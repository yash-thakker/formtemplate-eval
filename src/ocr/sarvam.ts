import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { getEnv } from '../config.js';
import { logger } from '../utils/logger.js';

/**
 * Sarvam Document Intelligence (Document Digitisation) async job client.
 *
 * Flow:
 *   1. POST /document-ai/digitise → returns job_id + upload_url
 *   2. PUT the PDF bytes to upload_url
 *   3. POST /document-ai/digitise/{id}/start
 *   4. Poll GET /document-ai/digitise/{id} until status === 'completed'
 *   5. GET the result download URL and fetch the markdown content
 *
 * Endpoint paths reflect Sarvam's API surface at project start; if Sarvam
 * changes URL structure, update only this file. No official Node SDK exists.
 */

const SARVAM_BASE = 'https://api.sarvam.ai';
const POLL_INTERVAL_MS = 2_000;
const POLL_MAX_MS = 120_000;

export interface SarvamDigitiseResult {
  /** Markdown rendering of the document. */
  markdown: string;
  /** Number of pages processed (for cost calc). */
  pages: number;
}

interface CreateJobResponse {
  job_id: string;
  upload_url: string;
}

interface JobStatusResponse {
  job_id: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  error?: string;
  output_url?: string;
  page_count?: number;
}

async function jsonOrThrow(res: Response, label: string): Promise<unknown> {
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Sarvam ${label} failed: ${res.status} ${res.statusText} — ${body.slice(0, 300)}`);
  }
  return res.json();
}

export async function digitiseDocument(pdfPath: string, language?: string): Promise<SarvamDigitiseResult> {
  const env = getEnv();
  if (!env.SARVAM_API_KEY) throw new Error('SARVAM_API_KEY is not set');
  const headers = { 'api-subscription-key': env.SARVAM_API_KEY } as const;

  // 1. Create job
  const createBody = { file_name: basename(pdfPath), ...(language ? { language } : {}) };
  const createRes = await fetch(`${SARVAM_BASE}/document-ai/digitise`, {
    method: 'POST',
    headers: { ...headers, 'content-type': 'application/json' },
    body: JSON.stringify(createBody),
  });
  const { job_id, upload_url } = (await jsonOrThrow(createRes, 'create job')) as CreateJobResponse;
  logger.debug({ job_id }, 'sarvam job created');

  // 2. Upload PDF bytes
  const bytes = await readFile(pdfPath);
  const uploadRes = await fetch(upload_url, {
    method: 'PUT',
    headers: { 'content-type': 'application/pdf' },
    body: bytes,
  });
  if (!uploadRes.ok) {
    throw new Error(`Sarvam upload failed: ${uploadRes.status} ${uploadRes.statusText}`);
  }

  // 3. Start
  const startRes = await fetch(`${SARVAM_BASE}/document-ai/digitise/${job_id}/start`, {
    method: 'POST',
    headers,
  });
  await jsonOrThrow(startRes, 'start job');

  // 4. Poll
  const deadline = Date.now() + POLL_MAX_MS;
  let status: JobStatusResponse | null = null;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    const pollRes = await fetch(`${SARVAM_BASE}/document-ai/digitise/${job_id}`, { headers });
    status = (await jsonOrThrow(pollRes, 'poll job')) as JobStatusResponse;
    logger.debug({ job_id, status: status.status }, 'sarvam poll');
    if (status.status === 'completed' || status.status === 'failed') break;
  }

  if (!status) throw new Error('Sarvam: no status received before timeout');
  if (status.status === 'failed') throw new Error(`Sarvam job failed: ${status.error ?? 'unknown'}`);
  if (status.status !== 'completed') throw new Error(`Sarvam job did not complete within ${POLL_MAX_MS}ms`);
  if (!status.output_url) throw new Error('Sarvam: completed but no output_url');

  // 5. Fetch markdown
  const outRes = await fetch(status.output_url);
  if (!outRes.ok) throw new Error(`Sarvam output fetch failed: ${outRes.status}`);
  const markdown = await outRes.text();

  return { markdown, pages: status.page_count ?? 1 };
}
