import { readFile } from 'node:fs/promises';

export interface PdfInfo {
  pageCount: number;
  hasExtractableText: boolean;
  textChars: number;
}

/**
 * Inspect a PDF using pdfjs-dist to decide whether the document is a vector
 * PDF with extractable text or a scanned image (OCR required).
 */
export async function inspectPdf(pdfPath: string): Promise<PdfInfo> {
  const data = new Uint8Array(await readFile(pdfPath));
  // Dynamic import avoids loading pdfjs at module init time.
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const loadingTask = pdfjs.getDocument({ data, isEvalSupported: false, useSystemFonts: true });
  const doc = await loadingTask.promise;
  let totalChars = 0;
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    for (const item of content.items as Array<{ str?: string }>) {
      if (typeof item.str === 'string') totalChars += item.str.length;
    }
  }
  await doc.cleanup();
  return {
    pageCount: doc.numPages,
    textChars: totalChars,
    hasExtractableText: totalChars > 50,
  };
}

/**
 * Rasterize a PDF to PNG buffers, one per page.
 * Used when an adapter needs page images (e.g., Textract image input,
 * or visual context for a vision LLM).
 */
export async function rasterizePdf(pdfPath: string): Promise<Buffer[]> {
  const { pdfToPng } = await import('pdf-to-png-converter');
  const pages = await pdfToPng(pdfPath, {
    viewportScale: 2.0,
    outputFolder: undefined,
    disableFontFace: true,
  });
  return pages
    .map((p) => p.content)
    .filter((b): b is Buffer => Buffer.isBuffer(b));
}
