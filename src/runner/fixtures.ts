import { readdir, readFile, stat } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FormTemplateSchema } from '../schema.js';
import { z } from 'zod';
import type { Fixture, FixtureMeta } from '../types.js';

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const FIXTURES_DIR = join(projectRoot, 'fixtures');

const MetaSchema = z.object({
  id: z.string(),
  name: z.string(),
  notes: z.string().optional(),
  queries: z
    .array(z.object({ alias: z.string(), text: z.string() }))
    .optional(),
  language: z.string().optional(),
});

async function isDir(p: string): Promise<boolean> {
  try {
    const s = await stat(p);
    return s.isDirectory();
  } catch {
    return false;
  }
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

export async function loadFixture(dir: string): Promise<Fixture | null> {
  const pdfPath = join(dir, 'input.pdf');
  const expectedPath = join(dir, 'expected.json');
  const metaPath = join(dir, 'meta.json');
  if (!(await fileExists(pdfPath)) || !(await fileExists(expectedPath))) return null;

  const meta: FixtureMeta = (await fileExists(metaPath))
    ? MetaSchema.parse(JSON.parse(await readFile(metaPath, 'utf8')))
    : { id: dir.split('/').pop() ?? 'unknown', name: 'Unknown' };

  const expected = FormTemplateSchema.parse(JSON.parse(await readFile(expectedPath, 'utf8')));
  return { meta, pdfPath, expected };
}

export async function discoverFixtures(): Promise<Fixture[]> {
  if (!(await isDir(FIXTURES_DIR))) return [];
  const entries = await readdir(FIXTURES_DIR, { withFileTypes: true });
  const fixtures: Fixture[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith('_') || entry.name.startsWith('.')) continue;
    const fixture = await loadFixture(join(FIXTURES_DIR, entry.name));
    if (fixture) fixtures.push(fixture);
  }
  return fixtures.sort((a, b) => a.meta.id.localeCompare(b.meta.id));
}

export function selectFixtures(fixtures: Fixture[], ids?: string[]): Fixture[] {
  if (!ids || ids.length === 0) return fixtures;
  const wanted = new Set(ids);
  return fixtures.filter((f) => wanted.has(f.meta.id));
}
