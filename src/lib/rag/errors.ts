import { LumenError } from "@/lib/errors";

export { EmbeddingProviderError } from "@/lib/ai/errors";

/** The uploaded file is not a type this phase supports (PDF only). */
export class UnsupportedDocumentTypeError extends LumenError {
  constructor(detail: string) {
    super("UNSUPPORTED_DOCUMENT_TYPE", `Unsupported document type: ${detail}`, {
      recoverable: true,
    });
    this.name = "UnsupportedDocumentTypeError";
  }
}

/** The uploaded file exceeds the configured size limit. */
export class DocumentTooLargeError extends LumenError {
  constructor(sizeBytes: number, limitBytes: number) {
    super(
      "DOCUMENT_TOO_LARGE",
      `Document is ${sizeBytes} bytes; the limit is ${limitBytes} bytes.`,
      { recoverable: true },
    );
    this.name = "DocumentTooLargeError";
  }
}

/** Extraction produced no usable text (blank, scanned-image-only, or corrupt). */
export class EmptyDocumentError extends LumenError {
  constructor(message = "The document contains no extractable text.") {
    super("EMPTY_DOCUMENT", message, { recoverable: true });
    this.name = "EmptyDocumentError";
  }
}

/** The PDF parser failed to read the file. */
export class TextExtractionError extends LumenError {
  constructor(message: string, options: { cause?: unknown } = {}) {
    super("TEXT_EXTRACTION_FAILED", `Text extraction failed: ${message}`, {
      recoverable: true,
      cause: options.cause,
    });
    this.name = "TextExtractionError";
  }
}

/** Semantic retrieval failed (embedding, RPC, or validation of results). */
export class RetrievalError extends LumenError {
  constructor(message: string, options: { cause?: unknown } = {}) {
    super("RETRIEVAL_ERROR", `Retrieval failed: ${message}`, {
      recoverable: true,
      cause: options.cause,
    });
    this.name = "RetrievalError";
  }
}
