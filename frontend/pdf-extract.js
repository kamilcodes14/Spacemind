// PDF parsing adapter is injected so extraction limits and cancellation can be tested.
export async function extractPaperPDF(
  file,
  { getDocument, parserVersion, signal, onProgress = () => {} },
) {
  const check = () => {
    if (signal?.aborted)
      throw new DOMException('PDF reading cancelled.', 'AbortError');
  };
  check();
  if (file.size > 20 * 1024 * 1024)
    throw Error('Choose a PDF smaller than 20 MB.');
  onProgress({ stage: 'reading', page: 0, total: 0 });
  const bytes = new Uint8Array(await file.arrayBuffer());
  check();
  if (new TextDecoder().decode(bytes.slice(0, 5)) !== '%PDF-')
    throw Error('Choose a valid PDF.');
  const checksum = [
    ...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)),
  ]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  check();
  const task = getDocument({
    data: bytes,
    isEvalSupported: false,
    enableXfa: false,
    cMapUrl: '/assets/cmaps/',
    cMapPacked: true,
    standardFontDataUrl: '/assets/standard_fonts/',
    wasmUrl: '/assets/wasm/',
  });
  const cancel = () => {
    void task.destroy().catch(() => {});
  };
  signal?.addEventListener('abort', cancel, { once: true });
  try {
    const pdf = await task.promise;
    check();
    if (pdf.numPages > 100) throw Error('Upload at most 100 pages at a time.');
    const pages = [],
      sparse = [];
    let size = 0;
    for (let n = 1; n <= pdf.numPages; n++) {
      check();
      const page = await pdf.getPage(n);
      try {
        const content = await page.getTextContent();
        check();
        let lastY = null,
          line = '';
        for (const item of content.items) {
          if (!('str' in item)) continue;
          const y = Math.round(item.transform[5]);
          if (lastY !== null && Math.abs(y - lastY) > 3) line += '\n';
          line += item.str + ' ';
          if (item.hasEOL) line += '\n';
          lastY = y;
        }
        const text = line.replace(/\u0000/g, '');
        if (text.length > 50000)
          throw Error(
            `Page ${n} exceeds the text limit. Split the PDF; no text was silently truncated or saved.`,
          );
        size += new TextEncoder().encode(text).length;
        if (size > 500000)
          throw Error(
            'This PDF has too much extracted text. Split it into smaller papers; nothing was saved.',
          );
        pages.push({ page: n, text });
        if (text.trim().length < 40) sparse.push(n);
        onProgress({ stage: 'extracting', page: n, total: pdf.numPages });
      } finally {
        page.cleanup();
      }
    }
    if (pages.every((p) => p.text.trim().length < 40))
      throw Error(
        'No usable text was found. Scanned PDFs need OCR before upload.',
      );
    const warnings = [
      'Text extraction may lose equation symbols, column order and table alignment. Check against the original PDF.',
    ];
    if (sparse.length)
      warnings.push(
        `Little or no text on pages ${sparse.join(', ')}; these may be blank or scanned. OCR was not performed.`,
      );
    return {
      title: file.name.replace(/\.pdf$/i, '').slice(0, 500),
      metadata: {
        origin: 'uploaded_pdf',
        filename: file.name,
        page_count: pdf.numPages,
        content_sha256: checksum,
        byte_length: file.size,
        extracted_at: new Date().toISOString(),
        parser: 'pdfjs-dist',
        parser_version: parserVersion,
        extraction: 'PDF text only; no OCR',
        extraction_warnings: warnings,
        sparse_pages: sparse,
      },
      pages,
    };
  } catch (error) {
    check();
    if (error.name === 'PasswordException')
      throw Error('This PDF is password protected. Upload an unlocked copy.');
    throw error;
  } finally {
    signal?.removeEventListener('abort', cancel);
    await task.destroy();
  }
}
