export type IngestionErrorCode =
  | "INVALID_INPUT"
  | "UNSUPPORTED_FORMAT"
  | "MANUAL_REVIEW"
  | "OCR_FAILED"
  | "PARSER_FAILED"
  | "STORAGE_FAILED"
  | "UNAUTHORIZED";

export class DocumentIngestionError extends Error {
  constructor(
    message: string,
    public readonly code: IngestionErrorCode,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "DocumentIngestionError";
  }
}

export function asIngestionError(error: unknown): DocumentIngestionError {
  if (error instanceof DocumentIngestionError) {
    return error;
  }

  return new DocumentIngestionError(
    error instanceof Error ? error.message : String(error),
    "PARSER_FAILED",
    error,
  );
}
