import type { ExtractionAdapter } from '../types.js';
import { geminiFlashAdapter } from './gemini-flash.js';
import { geminiProAdapter } from './gemini-pro.js';
import { claudeSonnetAdapter } from './claude-sonnet.js';
import { gpt5Adapter } from './gpt5.js';
import { sarvamOnlyAdapter } from './sarvam-only.js';
import { sarvamPlusLlmAdapter } from './sarvam-plus-llm.js';

export const ALL_ADAPTERS: readonly ExtractionAdapter[] = [
  geminiFlashAdapter,
  geminiProAdapter,
  claudeSonnetAdapter,
  gpt5Adapter,
  sarvamOnlyAdapter,
  sarvamPlusLlmAdapter,
];

export function findAdapter(name: string): ExtractionAdapter | undefined {
  return ALL_ADAPTERS.find((a) => a.name === name);
}

export function selectAdapters(names?: string[]): ExtractionAdapter[] {
  if (!names || names.length === 0) return [...ALL_ADAPTERS];
  return names
    .map((n) => findAdapter(n))
    .filter((a): a is ExtractionAdapter => a !== undefined);
}
