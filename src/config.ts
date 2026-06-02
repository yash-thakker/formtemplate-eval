import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';

loadDotenv();

const envSchema = z.object({
  GOOGLE_GENERATIVE_AI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  AWS_REGION: z.string().default('us-east-1'),
  SARVAM_API_KEY: z.string().optional(),
  EVAL_CONCURRENCY: z.coerce.number().int().positive().default(3),
  EVAL_TIMEOUT_MS: z.coerce.number().int().positive().default(90_000),
  EVAL_CACHE_ENABLED: z
    .union([z.literal('true'), z.literal('false'), z.boolean()])
    .transform((v) => v === true || v === 'true')
    .default('true'),
  LOG_LEVEL: z.string().default('info'),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;
export function getEnv(): Env {
  if (cached) return cached;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment:\n${issues}`);
  }
  cached = parsed.data;
  return cached;
}

/**
 * Provider pricing — USD per million tokens for LLMs, USD per page for OCR.
 *
 * Numbers below were verified against current provider docs (2026). Re-confirm
 * before publishing benchmark numbers — pricing pages drift.
 *   - Google: https://ai.google.dev/pricing
 *   - Anthropic: https://www.anthropic.com/pricing
 *   - OpenAI: https://openai.com/api/pricing
 *   - AWS Textract: https://aws.amazon.com/textract/pricing/
 *   - Sarvam: https://docs.sarvam.ai/api-reference-docs/pricing
 *
 * Notes:
 *   - Gemini 2.5 Pro has a tiered rate (≤200K tokens vs >200K). The flat
 *     numbers below approximate the ≤200K tier; large prompts will undercount.
 *   - Textract SIGNATURES is free when combined with FORMS / TABLES / QUERIES.
 *     `textract-only` (FORMS+TABLES+LAYOUT+SIGNATURES) cost calc sums only
 *     FORMS+TABLES+LAYOUT for that reason.
 *   - Sarvam pricing is ₹0.5/page; ~$0.006/page at ₹83/USD. Currency drifts;
 *     re-check before publishing.
 */
export const PRICING = {
  'gemini-2.5-flash': { inputPerMillion: 0.3, outputPerMillion: 2.5 },
  'gemini-2.5-pro': { inputPerMillion: 1.25, outputPerMillion: 10.0 },
  'claude-sonnet-4-6': { inputPerMillion: 3.0, outputPerMillion: 15.0 },
  'gpt-5': { inputPerMillion: 1.25, outputPerMillion: 10.0 },
  'textract-forms': { perPage: 0.05 },
  'textract-queries': { perPage: 0.015 },
  'textract-tables': { perPage: 0.015 },
  'textract-layout': { perPage: 0.004 },
  'textract-signatures': { perPage: 0.0025 },
  'sarvam-doc-intel': { perPage: 0.006 },
} as const;

export type PricingKey = keyof typeof PRICING;
type LLMKey = 'gemini-2.5-flash' | 'gemini-2.5-pro' | 'claude-sonnet-4-6' | 'gpt-5';
type OcrKey =
  | 'textract-forms'
  | 'textract-queries'
  | 'textract-tables'
  | 'textract-layout'
  | 'textract-signatures'
  | 'sarvam-doc-intel';

export function llmCost(modelKey: LLMKey, inputTokens: number, outputTokens: number): number {
  const p = PRICING[modelKey];
  return (inputTokens / 1_000_000) * p.inputPerMillion + (outputTokens / 1_000_000) * p.outputPerMillion;
}

export function ocrCost(modelKey: OcrKey, pages: number): number {
  return PRICING[modelKey].perPage * pages;
}
