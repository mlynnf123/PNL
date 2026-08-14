import { extractText, getDocumentProxy } from 'unpdf';

// Server-side PDF text extraction (unpdf → pdfjs, no native binaries, deploys on
// Vercel). Native-text carrier estimates (most Xactimate exports) go through the
// text model. A PDF with little/no extractable text is a scan — its pages are
// rendered to images client-side and sent to the vision model instead.
export async function extractPdfText(
  bytes: Uint8Array,
): Promise<{ text: string; pages: number; hasText: boolean }> {
  const pdf = await getDocumentProxy(bytes);
  const { text, totalPages } = await extractText(pdf, { mergePages: true });
  const chars = text.replace(/\s/g, '').length;
  // Below this, treat the document as scanned/image-only (needs OCR/vision).
  return { text, pages: totalPages, hasText: chars > 400 };
}
