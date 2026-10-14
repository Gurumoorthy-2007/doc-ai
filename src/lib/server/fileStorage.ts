import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

// Max file size: configurable via MAX_FILE_SIZE_MB env var, defaulting to 50MB
export const MAX_FILE_SIZE_MB = Number(process.env.MAX_FILE_SIZE_MB) || 50;
export const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

export interface ValidatedFile {
  buffer: Buffer;
  fileName: string;
  mimeType: string;
  size: number;
  hash: string;
  pageCount: number;
  extractedText: string;
  pageTexts: string[];
}

// Magic bytes definitions
const MAGIC_BYTES = {
  pdf: [0x25, 0x50, 0x44, 0x46], // %PDF
  png: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  jpeg: [0xff, 0xd8, 0xff],
  tiff_le: [0x49, 0x49, 0x2a, 0x00],
  tiff_be: [0x4d, 0x4d, 0x00, 0x2a],
};

function checkMagicBytes(buffer: Buffer, expected: number[]): boolean {
  if (buffer.length < expected.length) return false;
  for (let i = 0; i < expected.length; i++) {
    if (buffer[i] !== expected[i]) return false;
  }
  return true;
}

export function detectMimeType(buffer: Buffer, fileName: string): string | null {
  const ext = path.extname(fileName).toLowerCase();

  if (checkMagicBytes(buffer, MAGIC_BYTES.pdf)) {
    if (ext === '.pdf') return 'application/pdf';
  }
  if (checkMagicBytes(buffer, MAGIC_BYTES.png)) {
    if (ext === '.png') return 'image/png';
  }
  if (checkMagicBytes(buffer, MAGIC_BYTES.jpeg)) {
    if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  }
  if (checkMagicBytes(buffer, MAGIC_BYTES.tiff_le) || checkMagicBytes(buffer, MAGIC_BYTES.tiff_be)) {
    if (ext === '.tif' || ext === '.tiff') return 'image/tiff';
  }

  return null;
}

const STORAGE_DIR = path.join(process.cwd(), '.data', 'storage');

async function ensureStorageDir(): Promise<string> {
  await fs.mkdir(STORAGE_DIR, { recursive: true });
  return STORAGE_DIR;
}

export function calculateFileHash(buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/**
 * Validate file on the server: size, extension, MIME, and magic bytes.
 */
export async function validateAndInspectFile(
  buffer: Buffer,
  originalFileName: string,
  _declaredMimeType?: string
): Promise<ValidatedFile> {
  void _declaredMimeType;
  // 1. Sanitize file name
  const sanitizedFileName = path.basename(originalFileName).replace(/[^a-zA-Z0-9._\-]/g, '_');

  // 2. Size check
  if (buffer.length === 0) {
    throw new Error(`File "${sanitizedFileName}" is empty.`);
  }
  if (buffer.length > MAX_FILE_SIZE_BYTES) {
    throw new Error(
      `File "${sanitizedFileName}" exceeds maximum allowed size of ${MAX_FILE_SIZE_MB}MB (received ${(buffer.length / (1024 * 1024)).toFixed(1)}MB).`
    );
  }

  // 3. Extension check
  const ext = path.extname(sanitizedFileName).toLowerCase();
  const allowedExtensions = ['.pdf', '.png', '.jpg', '.jpeg', '.tiff', '.tif'];
  if (!allowedExtensions.includes(ext)) {
    throw new Error(
      `Unsupported file format "${ext}". Supported formats are PDF, PNG, JPG, JPEG, and TIFF.`
    );
  }

  // 4. Magic bytes & MIME validation
  const detectedMime = detectMimeType(buffer, sanitizedFileName);
  if (!detectedMime) {
    throw new Error(
      `File "${sanitizedFileName}" has invalid content headers. The file contents do not match its declared extension.`
    );
  }

  // 5. SHA-256 hash
  const hash = calculateFileHash(buffer);

  // 6. Text and page extraction
  let pageCount = 1;
  let extractedText = '';
  const pageTexts: string[] = [];

  if (detectedMime === 'application/pdf') {
    try {
      // Dynamic require of pdf-parse
      const rawPdfParse = require('pdf-parse');
      if (typeof rawPdfParse === 'function') {
        const pdfData = await rawPdfParse(buffer);
        pageCount = Math.max(1, pdfData.numpages || 1);
        extractedText = pdfData.text ? pdfData.text.trim() : '';
      } else if (rawPdfParse?.PDFParse) {
        const parser = new rawPdfParse.PDFParse({ data: buffer });
        await parser.load();
        const textResult = await parser.getText();
        extractedText = typeof textResult === 'string' ? textResult.trim() : (textResult?.text || '');
        pageCount = parser.doc?.numPages || 1;
      }

      if (extractedText.includes('\f')) {
        const pages = extractedText.split('\f').filter((p: string) => p.trim().length > 0);
        pageTexts.push(...pages);
      } else if (extractedText.length > 0) {
        pageTexts.push(extractedText);
      } else {
        pageTexts.push('');
      }
    } catch {
      // If specialized pdf structural parser fails (e.g. minimal or stream-based pdf), extract text stream
      const rawAscii = buffer.toString('latin1');
      const strings = rawAscii.match(/[\x20-\x7E\t\n\r]{4,}/g) || [];
      extractedText = strings.join(' ').trim();
      pageCount = 1;
      pageTexts.push(extractedText);
    }
  } else {
    // Images: page count is 1. Text is extracted via OCR in AI extraction
    pageCount = 1;
    extractedText = '';
    pageTexts.push('');
  }

  return {
    buffer,
    fileName: sanitizedFileName,
    mimeType: detectedMime,
    size: buffer.length,
    hash,
    pageCount,
    extractedText,
    pageTexts,
  };
}

/**
 * Save file buffer to local private storage
 */
export async function saveFileToStorage(
  buffer: Buffer,
  fileHash: string,
  fileName: string
): Promise<string> {
  const dir = await ensureStorageDir();
  const safeName = `${fileHash}_${fileName}`;
  const filePath = path.join(dir, safeName);
  await fs.writeFile(filePath, buffer);
  return filePath;
}

/**
 * Read stored file from local private storage with path traversal protection
 */
export async function getFileFromStorage(filePath: string): Promise<Buffer | null> {
  try {
    const resolvedPath = path.resolve(filePath);
    const resolvedStorageDir = path.resolve(STORAGE_DIR);

    // Verify resolved path stays strictly within the authorized storage directory
    if (!resolvedPath.startsWith(resolvedStorageDir)) {
      console.warn(`[Security Alert] Unauthorized path traversal attempt prevented: ${filePath}`);
      return null;
    }

    return await fs.readFile(resolvedPath);
  } catch {
    return null;
  }
}

/**
 * Safely delete a file from storage with path traversal protection
 */
export async function deleteFileFromStorage(filePath: string): Promise<boolean> {
  try {
    const resolvedPath = path.resolve(filePath);
    const resolvedStorageDir = path.resolve(STORAGE_DIR);

    if (!resolvedPath.startsWith(resolvedStorageDir)) {
      console.warn(`[Security Alert] Unauthorized path traversal attempt in delete prevented: ${filePath}`);
      return false;
    }

    await fs.unlink(resolvedPath);
    return true;
  } catch {
    return false;
  }
}
