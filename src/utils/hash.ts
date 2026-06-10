import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

export async function hashFile(path: string): Promise<string> {
  const buf = await readFile(path);
  return createHash('sha256').update(buf).digest('hex').slice(0, 16);
}
