export type DocumentChunkingErrorCode =
  | "INVALID_INPUT"
  | "UNAUTHORIZED"
  | "UNSUPPORTED_NORMALIZED_DOCUMENT"
  | "ARTIFACT_UNAVAILABLE"
  | "QUALITY_BLOCKED";

export class DocumentChunkingError extends Error {
  constructor(
    message: string,
    public readonly code: DocumentChunkingErrorCode,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "DocumentChunkingError";
  }
}
