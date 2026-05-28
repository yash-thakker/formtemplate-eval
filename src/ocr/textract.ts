import {
  TextractClient,
  AnalyzeDocumentCommand,
  type Block,
  type FeatureType,
  type Query,
} from '@aws-sdk/client-textract';
import { getEnv } from '../config.js';
import { rasterizePdf } from '../utils/pdf.js';
import { logger } from '../utils/logger.js';

let cachedClient: TextractClient | null = null;
function client(): TextractClient {
  if (cachedClient) return cachedClient;
  const env = getEnv();
  if (!env.AWS_ACCESS_KEY_ID || !env.AWS_SECRET_ACCESS_KEY) {
    throw new Error('AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY are not set');
  }
  cachedClient = new TextractClient({
    region: env.AWS_REGION,
    credentials: {
      accessKeyId: env.AWS_ACCESS_KEY_ID,
      secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
    },
  });
  return cachedClient;
}

export interface TextractAnalyzeResult {
  blocks: Block[];
  pages: number;
}

/**
 * Run AnalyzeDocument for a PDF.
 *
 * Textract's sync AnalyzeDocument only accepts single-page images, so for
 * multi-page PDFs we rasterize each page and call once per page, then
 * concatenate the Block lists (rewriting page numbers so downstream
 * consumers see consistent page indices).
 */
export async function analyzeDocument(
  pdfPath: string,
  features: FeatureType[],
  queries?: Query[],
): Promise<TextractAnalyzeResult> {
  const pages = await rasterizePdf(pdfPath);
  const c = client();
  const allBlocks: Block[] = [];
  for (let i = 0; i < pages.length; i++) {
    const response = await c.send(
      new AnalyzeDocumentCommand({
        Document: { Bytes: pages[i] },
        FeatureTypes: features,
        ...(queries ? { QueriesConfig: { Queries: queries } } : {}),
      }),
    );
    const pageBlocks = (response.Blocks ?? []).map((b) => ({ ...b, Page: i + 1 }));
    allBlocks.push(...pageBlocks);
    logger.debug({ page: i + 1, blocks: pageBlocks.length }, 'textract page complete');
  }
  return { blocks: allBlocks, pages: pages.length };
}
