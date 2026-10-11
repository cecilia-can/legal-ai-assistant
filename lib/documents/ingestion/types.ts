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

export type NormalizedSemanticRole =
  | "case_keywords"
  | "case_holding"
  | "case_facts"
  | "case_issues"
  | "case_judgment"
  | "case_reasoning"
  | "case_index";

export interface NormalizedBlock {
  kind: NormalizedBlockKind;
  text: string;
  locator?: string;
  sourcePage?: number | null;
  /** End page when a source paragraph crosses a rendered PDF page boundary. */
  sourcePageEnd?: number | null;
  sectionPath?: string[];
  articleNumber?: string;
  /** Source paragraph semantics, retained independently of chunking heuristics. */
  paragraphType?: "heading" | "body" | "list-item" | "table" | "text";
  /** Word outline level / heading level, when the source provides one. */
  headingLevel?: number;
  /** Word automatic-numbering metadata, when the paragraph uses a list definition. */
  listLevel?: number;
  listId?: string;
  listNumber?: string;
  numberingText?: string;
  /** Optional domain enrichment; generic heading detection does not depend on it. */
  semanticRole?: NormalizedSemanticRole;
  /** Layout-derived confidence that this block is a heading. */
  headingConfidence?: number;
  /** True when this block continues a paragraph that began on the preceding PDF page. */
  continuesPreviousParagraph?: boolean;
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
    /** Business category persisted on Document and used for chunking strategy selection. */
    category?: string;
    categoryConfidence?: number;
    categorySignals?: string[];
    suggestedCategory?: string;
    needsCategoryReview?: boolean;
    categorySource?: "explicit" | "inferred";
    originalFilename?: string;
    sourceUri?: string;
    sourceIdentifier?: string;
    pdfPageClassification?: PdfPageClassification;
    /** A PDF rendered from Word is the authoritative page-location source. */
    renderedPdfUri?: string;
    pageLocationSource?: "pdf-render" | "native" | "unavailable";
    pageLocationWarning?: string;
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
  documentRenderTimeoutMs: number;
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
