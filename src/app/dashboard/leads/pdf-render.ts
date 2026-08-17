'use client';

// Render a scanned PDF's pages to JPEG data URLs in the browser (reliable canvas)
// for the vision model. Used only for scanned uploads; native-text PDFs never
// reach here. The worker is served from /public so the bundler need not resolve it.
export async function renderPdfToImages(
  file: File,
  opts: { maxPages?: number; scale?: number } = {},
): Promise<string[]> {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjs.getDocument({ data }).promise;
  const pages = Math.min(pdf.numPages, opts.maxPages ?? 5);
  const scale = opts.scale ?? 1.4;
  const images: string[] = [];

  for (let i = 1; i <= pages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not get a canvas context.');
    await page.render({ canvas, canvasContext: ctx, viewport }).promise;
    images.push(canvas.toDataURL('image/jpeg', 0.85));
    canvas.width = 0;
    canvas.height = 0;
  }
  await pdf.cleanup();
  return images;
}
