import type { NormalizedBlock, NormalizedDocument } from "../ingestion/types";

export const CHUNKING_STRATEGY_VERSION = "legal-structure-v2";
export const DEFAULT_MAX_CHUNK_CHARACTERS = 1_800;

export type LegalDocumentKind = "statute" | "case" | "contract" | "general";
export type ChunkingStrategyName = LegalDocumentKind;

/**
 * A strategy is deliberately data-driven: new document categories can be
 * added without turning the chunking entry point into a chain of templates.
 */
export interface DocumentCategoryStrategy {
  name: ChunkingStrategyName;
  categoryPatterns: RegExp[];
  contentPatterns: RegExp[];
  /** Node types that begin a retrieval unit for this category. */
  chunkBoundaryKinds: StructureNode["kind"][];
}
export type QualityIssueSeverity = "info" | "warning" | "blocking";
export type QualityIssueType =
  | "empty_content"
  | "garbled_text"
  | "repeated_header_footer"
  | "abnormal_truncation";

export interface SourceRange {
  pageFrom: number | null;
  pageTo: number | null;
  blockFrom: number | null;
  blockTo: number | null;
  charFrom: number;
  charTo: number;
}

export interface StructureLocator extends SourceRange {
  chapter?: string;
  section?: string;
  article?: string;
  paragraph?: string;
  item?: string;
  clause?: string;
  casePart?: "keywords" | "holding" | "facts" | "issues" | "court_reasoning" | "judgment" | "index";
  headingPath: string[];
  parentNodeId?: string;
  fragmentIndex?: number;
  fragmentCount?: number;
}

export interface StructureNode {
  id: string;
  kind: "chapter" | "section" | "article" | "paragraph" | "item" | "clause" | "case_part" | "heading" | "body";
  text: string;
  source: SourceRange;
  locator: StructureLocator;
  blocks: NormalizedBlock[];
}

export interface ChunkCandidate {
  text: string;
  sectionPath: string;
  locator: StructureLocator;
  source: SourceRange;
}

export interface ChunkingConfig {
  artifactRoot: string;
  maxChunkCharacters: number;
  strategyVersion: string;
}

export interface ChunkQualityIssue {
  type: QualityIssueType;
  severity: QualityIssueSeverity;
  message: string;
  source?: Partial<SourceRange>;
}

export interface LoadedChunkingDocument {
  document: {
    id: string;
    category: string | null;
    normalizedContentHash: string;
    normalizedUri: string;
  };
  normalized: NormalizedDocument;
  config: ChunkingConfig;
}

export interface PersistableChunk {
  ordinal: number;
  text: string;
  sectionPath: string;
  locator: StructureLocator;
  pageFrom: number | null;
  pageTo: number | null;
  contentHash: string;
}
