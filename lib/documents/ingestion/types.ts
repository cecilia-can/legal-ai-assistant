export const NORMALIZED_DOCUMENT_SCHEMA_VERSION = "document-normalized-v2";

export type DocumentSourceType = "pdf" | "docx" | "doc" | "html" | "txt";
export type ExtractionMethod = "native" | "ocr";
export type PdfPageClassification = "text" | "image_only" | "mixed";
export type DocumentProcessingStatus =
  | "pending"
  | "processing"
  | "ocr_processing"
  | "succeeded"
  | "failed"
  | "manual_review"
  | "ocr_failed";

export type NormalizedBlockKind =
  | "heading"
  | "paragraph"
  | "list-item"
  | "table"
  | "text";

export interface NormalizedBlock {
  kind: NormalizedBlockKind;
  text: string;
  locator?: string;
  sourcePage?: number | null;
  sectionPath?: string[];
  articleNumber?: string;
  bbox?: [number, number, number, number] | null;
  confidence?: number | null;
}

export interface NormalizedPage {
  pageNumber: number | null;
  text: string;
  blocks: NormalizedBlock[];
}

export interface NormalizedDocument {
  schemaVersion: typeof NORMALIZED_DOCUMENT_SCHEMA_VERSION;
  sourceType: DocumentSourceType;
  extractionMethod: ExtractionMethod;
  pages: NormalizedPage[];
  metadata: {
    title?: string;
    originalFilename?: string;
    sourceUri?: string;
    sourceIdentifier?: string;
    pdfPageClassification?: PdfPageClassification;
    ocrEngine?: string;
    ocrVersion?: string;
    ocrLanguages?: string;
    ocrConfidence?: number | null;
  };
}

export interface ParserOutput {
  normalized: NormalizedDocument;
  pdfPageClassification?: PdfPageClassification;
  imageOnlyPageNumbers?: number[];
}

export interface IngestionConfig {
  sourceRoot?: string;
  artifactRoot: string;
  ocrCommand: string;
  tesseractCommand: string;
  officeCommand: string;
  ocrLanguages: string;
  ocrTimeoutMs: number;
  pdfTextCoverageThreshold: number;
}

export interface IngestDocumentInput {
  knowledgeBaseId: string;
  filePath: string;
  userId?: string;
  sourceIdentifier?: string;
  sourceUri?: string;
  title?: string;
  category?: string;
  forceReprocess?: boolean;
  config?: Partial<IngestionConfig>;
}

export interface IngestDocumentResult {
  created: boolean;
  documentId: string;
  status: DocumentProcessingStatus | "duplicate";
  extractionMethod?: ExtractionMethod;
  normalizedUri?: string;
  imageOnlyPageNumbers?: number[];
}
