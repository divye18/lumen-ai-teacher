import { err, ok, type Result } from "@/lib/result";

import {
  EmptyDocumentError,
  TextExtractionError,
  UnsupportedDocumentTypeError,
} from "./errors";

/**
 * PDF text extraction.
 *
 * Uses `unpdf` (a serverless build of pdf.js) so extraction runs in the Node
 * runtime with no native bindings. Page-level text is preserved, which gives
 * real page numbers for citations.
 */

export const PDF_MIME_TYPE = "application/pdf";
const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46, 0x2d]; // "%PDF-"

export interface ExtractedPage {
  pageNumber: number;
  text: string;
}

export interface ExtractedPdf {
  pages: ExtractedPage[];
  totalPages: number;
  /** Total characters of extracted text across all pages. */
  textLength: number;
}

/**
 * Validate that `bytes` is actually a PDF by inspecting its magic number.
 * The client-supplied MIME type is never trusted on its own.
 */
export function assertPdfBytes(bytes: Uint8Array): Result<void> {
  if (bytes.byteLength === 0) {
    return err(new UnsupportedDocumentTypeError("empty file"));
  }
  // Allow a small header offset (BOM / leading whitespace) as real PDFs sometimes do.
  const windowEnd = Math.min(bytes.byteLength, 1024);
  for (let offset = 0; offset + PDF_MAGIC.length <= windowEnd; offset += 1) {
    let matched = true;
    for (let i = 0; i < PDF_MAGIC.length; i += 1) {
      if (bytes[offset + i] !== PDF_MAGIC[i]) {
        matched = false;
        break;
      }
    }
    if (matched) return ok(undefined);
  }
  return err(
    new UnsupportedDocumentTypeError("file does not start with a %PDF- header"),
  );
}

/** Optionally cross-check a declared MIME type; extraction still gates on bytes. */
export function isPdfMimeType(mimeType: string | null | undefined): boolean {
  if (!mimeType) return false;
  return mimeType.split(";")[0].trim().toLowerCase() === PDF_MIME_TYPE;
}

/**
 * Produce a safe, deterministic filename from untrusted client input.
 * Strips directory components, control characters, and disallowed symbols;
 * always ends in a single `.pdf`.
 */
export function sanitizePdfFilename(raw: string | null | undefined): string {
  const fallback = "document.pdf";
  if (!raw) return fallback;

  // Drop any directory portion (handles both separators and traversal).
  const base = raw.split(/[/\\]/).pop() ?? "";

  const name = base
    .normalize("NFC")
    .replace(/\p{Cc}/gu, "")
    .replace(/\.pdf$/i, "")
    .replace(/[^A-Za-z0-9._ -]/g, "_")
    .replace(/\s+/g, "_")
    .replace(/_{2,}/g, "_")
    .replace(/^[._-]+/, "")
    .replace(/[._-]+$/, "")
    .slice(0, 128)
    .trim();

  if (name.length === 0) return fallback;
  return `${name}.pdf`;
}

/** Extract per-page text from PDF bytes. */
export async function extractPdfText(
  bytes: Uint8Array,
): Promise<Result<ExtractedPdf>> {
  const magic = assertPdfBytes(bytes);
  if (!magic.ok) return magic;

  let pageTexts: string[];
  let totalPages: number;
  try {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const proxy = await getDocumentProxy(bytes);
    const result = await extractText(proxy, { mergePages: false });
    totalPages = result.totalPages;
    pageTexts = Array.isArray(result.text) ? result.text : [result.text];
  } catch (cause) {
    return err(
      new TextExtractionError(
        cause instanceof Error ? cause.message : "unknown parser error",
        { cause },
      ),
    );
  }

  const pages: ExtractedPage[] = pageTexts.map((text, i) => ({
    pageNumber: i + 1,
    text: typeof text === "string" ? text : "",
  }));

  const textLength = pages.reduce((sum, p) => sum + p.text.trim().length, 0);
  if (textLength === 0) {
    return err(
      new EmptyDocumentError(
        "No selectable text found. Scanned or image-only PDFs are not supported in this phase.",
      ),
    );
  }

  return ok({ pages, totalPages: totalPages || pages.length, textLength });
}
