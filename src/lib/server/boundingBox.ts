// ============================================================
// DocuSentinel AI — Bounding Box & Evidence Locator Service
// Extracts and normalizes 2D bounding boxes for document evidence
// using pdfjs-dist with deterministic layout estimation fallback.
// ============================================================

import type { BoundingBox } from '../types';

export interface PassageLocationResult {
  found: boolean;
  page: number | null;
  startIndex: number;
  endIndex: number;
  matchedText: string;
}

/**
 * Normalizes text by removing non-alphanumeric chars, collapsing whitespace,
 * and converting to lowercase for fuzzy passage matching.
 */
function normalizeForSearch(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Locates a given source passage across page text streams.
 * Returns the 1-based page number, character offsets, and whether it was found.
 */
export function locatePassageInPages(
  passage: string | null | undefined,
  pageTexts: string[] = []
): PassageLocationResult {
  if (!passage || passage.trim().length === 0 || pageTexts.length === 0) {
    return {
      found: false,
      page: null,
      startIndex: -1,
      endIndex: -1,
      matchedText: '',
    };
  }

  const cleanPassage = passage.trim();
  const lowerPassage = cleanPassage.toLowerCase();
  const normalizedPassage = normalizeForSearch(cleanPassage);

  // 1. Exact match on individual pages
  for (let i = 0; i < pageTexts.length; i++) {
    const pageText = pageTexts[i] || '';
    const idx = pageText.indexOf(cleanPassage);
    if (idx !== -1) {
      return {
        found: true,
        page: i + 1,
        startIndex: idx,
        endIndex: idx + cleanPassage.length,
        matchedText: pageText.slice(idx, idx + cleanPassage.length),
      };
    }
  }

  // 2. Case-insensitive match on individual pages
  for (let i = 0; i < pageTexts.length; i++) {
    const pageText = pageTexts[i] || '';
    const lowerPage = pageText.toLowerCase();
    const idx = lowerPage.indexOf(lowerPassage);
    if (idx !== -1) {
      return {
        found: true,
        page: i + 1,
        startIndex: idx,
        endIndex: idx + lowerPassage.length,
        matchedText: pageText.slice(idx, idx + lowerPassage.length),
      };
    }
  }

  // 3. Normalized whitespace & punctuation match
  if (normalizedPassage.length >= 4) {
    for (let i = 0; i < pageTexts.length; i++) {
      const pageText = pageTexts[i] || '';
      const normPage = normalizeForSearch(pageText);
      const idx = normPage.indexOf(normalizedPassage);
      if (idx !== -1) {
        return {
          found: true,
          page: i + 1,
          startIndex: Math.max(0, Math.floor((idx / Math.max(1, normPage.length)) * pageText.length)),
          endIndex: Math.min(pageText.length, Math.floor(((idx + normalizedPassage.length) / Math.max(1, normPage.length)) * pageText.length)),
          matchedText: cleanPassage,
        };
      }
    }
  }

  // Not found in any page text
  return {
    found: false,
    page: null,
    startIndex: -1,
    endIndex: -1,
    matchedText: '',
  };
}

/**
 * Deterministically estimates normalized [0, 1] bounding box coordinates based on
 * line and column offset within a page's text stream.
 */
export function estimateBoundingBoxFromText(
  page: number,
  pageText: string,
  startIndex: number,
  passageLength: number
): BoundingBox {
  const safePage = Math.max(1, page);
  const textBefore = pageText.slice(0, Math.max(0, startIndex));
  const linesBefore = textBefore.split('\n');
  const lineIndex = Math.max(0, linesBefore.length - 1);
  const colIndex = linesBefore[linesBefore.length - 1].length;

  const allLines = pageText.split('\n');
  const totalLines = Math.max(allLines.length, 32);

  // Normalized coordinate ranges with comfortable document margins (top/left ~0.08)
  const normY = Math.min(0.92, Math.max(0.06, 0.08 + (lineIndex / totalLines) * 0.82));
  const normX = Math.min(0.85, Math.max(0.08, 0.08 + Math.min(colIndex / 80, 0.75)));
  const normWidth = Math.min(0.88, Math.max(0.12, (Math.min(passageLength, 60) / 75) * 0.75));
  const normHeight = Math.min(0.12, Math.max(0.024, (1.2 / totalLines) * 0.85));

  return {
    page: safePage,
    x: Number(normX.toFixed(4)),
    y: Number(normY.toFixed(4)),
    width: Number(normWidth.toFixed(4)),
    height: Number(normHeight.toFixed(4)),
  };
}

/**
 * Normalizes model-provided bounding boxes (e.g., [ymin, xmin, ymax, xmax] in 0..1000 or 0..1).
 */
export function normalizeModelCoordinates(
  rawBox: unknown,
  page = 1
): BoundingBox | null {
  if (!rawBox) return null;

  // Array format: [ymin, xmin, ymax, xmax] or [xmin, ymin, width, height]
  if (Array.isArray(rawBox) && rawBox.length === 4) {
    const nums = rawBox.map((n) => Number(n));
    if (nums.some(isNaN)) return null;

    // Check if coordinates are in 0..1000 range (standard Gemini/NIM bounding box format)
    const is1000Scale = nums.some((n) => n > 1.5);
    const scale = is1000Scale ? 1000 : 1;

    let [y1, x1, y2, x2] = nums.map((n) => n / scale);
    if (x2 < x1) [x1, x2] = [x2, x1];
    if (y2 < y1) [y1, y2] = [y2, y1];

    return {
      page: Math.max(1, page),
      x: Number(Math.max(0, Math.min(1, x1)).toFixed(4)),
      y: Number(Math.max(0, Math.min(1, y1)).toFixed(4)),
      width: Number(Math.max(0.02, Math.min(1 - x1, x2 - x1)).toFixed(4)),
      height: Number(Math.max(0.02, Math.min(1 - y1, y2 - y1)).toFixed(4)),
    };
  }

  // Object format: { x, y, width, height, page? }
  if (typeof rawBox === 'object' && rawBox !== null) {
    const b = rawBox as Record<string, unknown>;
    const x = Number(b.x);
    const y = Number(b.y);
    const w = Number(b.width || b.w);
    const h = Number(b.height || b.h);

    if (!isNaN(x) && !isNaN(y) && !isNaN(w) && !isNaN(h)) {
      const scale = (x > 1.5 || y > 1.5 || w > 1.5 || h > 1.5) ? 1000 : 1;
      return {
        page: typeof b.page === 'number' && b.page > 0 ? b.page : Math.max(1, page),
        x: Number(Math.max(0, Math.min(1, x / scale)).toFixed(4)),
        y: Number(Math.max(0, Math.min(1, y / scale)).toFixed(4)),
        width: Number(Math.max(0.02, Math.min(1, w / scale)).toFixed(4)),
        height: Number(Math.max(0.02, Math.min(1, h / scale)).toFixed(4)),
      };
    }
  }

  return null;
}

/**
 * Main public entrypoint: extracts or computes normalized bounding box for a field passage.
 * Tries pdfjs-dist on binary PDFs first; falls back gracefully to layout text offset estimation.
 */
export async function extractBoundingBoxForText(
  buffer: Buffer | null | undefined,
  mimeType: string,
  passage: string | null | undefined,
  reportedPage: number | null | undefined,
  pageTexts: string[] = []
): Promise<BoundingBox | null> {
  if (!passage || passage.trim().length === 0) {
    return null;
  }

  const cleanPassage = passage.trim();

  // 1. Locate which page and offset this passage is on
  const loc = locatePassageInPages(cleanPassage, pageTexts);
  const targetPage = loc.found && loc.page !== null ? loc.page : (reportedPage || null);

  if (!targetPage) {
    // If not found in text stream and no valid page, cannot ground coordinates
    return null;
  }

  // 2. For binary PDFs, attempt pdfjs-dist structured token extraction
  if (mimeType === 'application/pdf' && buffer && buffer.length > 500) {
    try {
      // Dynamic import to avoid SSR issues
      const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
      const doc = await getDocument({
        data: new Uint8Array(buffer),
        isEvalSupported: false,
        disableFontFace: true,
      }).promise;

      const pageIndex = Math.min(Math.max(1, targetPage), doc.numPages);
      const page = await doc.getPage(pageIndex);
      const content = await page.getTextContent();
      const viewport = page.getViewport({ scale: 1.0 });

      const cleanLower = cleanPassage.toLowerCase();

      // Search through page text items
      for (const item of content.items as Array<{ str?: string; transform?: number[]; width?: number; height?: number }>) {
        if (!item.str || !item.transform) continue;

        if (item.str.toLowerCase().includes(cleanLower) || cleanLower.includes(item.str.toLowerCase().trim())) {
          const [scaleX, , , scaleY, tx, ty] = item.transform;
          const itemWidth = typeof item.width === 'number' && item.width > 0 ? item.width : Math.abs(scaleX) * (item.str.length * 6);
          const itemHeight = typeof item.height === 'number' && item.height > 0 ? item.height : Math.abs(scaleY);

          // PDF coordinate system has (0,0) at bottom-left; HTML/Canvas has (0,0) at top-left
          const normX = Math.max(0, Math.min(1, tx / viewport.width));
          const normY = Math.max(0, Math.min(1, (viewport.height - ty - itemHeight) / viewport.height));
          const normW = Math.max(0.03, Math.min(1 - normX, itemWidth / viewport.width));
          const normH = Math.max(0.02, Math.min(1 - normY, itemHeight / viewport.height));

          return {
            page: pageIndex,
            x: Number(normX.toFixed(4)),
            y: Number(normY.toFixed(4)),
            width: Number(normW.toFixed(4)),
            height: Number(normH.toFixed(4)),
          };
        }
      }
    } catch {
      // PDF structural parse failed or threw — continue to layout fallback
    }
  }

  // 3. Deterministic layout coordinate estimation fallback
  const pageIdx = targetPage - 1;
  const pageText = pageTexts[pageIdx] || (pageTexts.length > 0 ? pageTexts[0] : cleanPassage);
  const startIdx = loc.found && loc.startIndex >= 0 ? loc.startIndex : pageText.indexOf(cleanPassage);

  return estimateBoundingBoxFromText(
    targetPage,
    pageText,
    startIdx >= 0 ? startIdx : 0,
    cleanPassage.length
  );
}
