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
 * NOTE: numbers are best-effort as of project start. Confirm against the
 * provider's pricing page before publishing benchmark results.
 *   - Google: https://ai.google.dev/pricing
 *   - Anthropic: https://www.anthropic.com/pricing
 *   - OpenAI: https://openai.com/api/pricing
 *   - AWS Textract: https://aws.amazon.com/textract/pricing/
 *   - Sarvam: https://docs.sarvam.ai/api-reference-docs/document-ai
 */
export const PRICING = {
  'gemini-2.5-flash': { inputPerMillion: 0.3, outputPerMillion: 2.5 },
  'gemini-2.5-pro': { inputPerMillion: 1.25, outputPerMillion: 5.0 },
  'claude-sonnet-4-6': { inputPerMillion: 3.0, outputPerMillion: 15.0 },
  'gpt-5': { inputPerMillion: 2.5, outputPerMillion: 10.0 },
  'textract-forms': { perPage: 0.05 },
  'textract-queries': { perPage: 0.015 },
  'textract-tables': { perPage: 0.015 },
  'textract-signatures': { perPage: 0.0035 },
  'sarvam-doc-intel': { perPage: 0.018 },
} as const;

export type PricingKey = keyof typeof PRICING;

export function llmCost(
  modelKey: 'gemini-2.5-flash' | 'gemini-2.5-pro' | 'claude-sonnet-4-6' | 'gpt-5',
  inputTokens: number,
  outputTokens: number,
): number {
  const p = PRICING[modelKey];
  return (inputTokens / 1_000_000) * p.inputPerMillion + (outputTokens / 1_000_000) * p.outputPerMillion;
}

export function ocrCost(modelKey: 'textract-forms' | 'textract-queries' | 'textract-tables' | 'textract-signatures' | 'sarvam-doc-intel', pages: number): number {
  return PRICING[modelKey].perPage * pages;
}
