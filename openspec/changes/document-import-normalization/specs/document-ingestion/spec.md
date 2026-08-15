## ADDED Requirements

### Requirement: Multi-format document extraction

The system MUST import PDF, DOCX, DOC, HTML and TXT files into a versioned normalized document format.

#### Scenario: Extract a text-native PDF

- **WHEN** a PDF page contains a readable text layer
- **THEN** the system extracts its text without invoking OCR and preserves the page number in the normalized output

#### Scenario: Extract a DOCX document

- **WHEN** a DOCX file is imported
- **THEN** the system preserves paragraphs, headings and tables as normalized blocks, or records an actionable failure if the document cannot be parsed

#### Scenario: Handle an unsupported DOC conversion environment

- **WHEN** a DOC file requires conversion but no supported converter is available
- **THEN** the system records `manual_review` with the missing dependency and does not mark the document as successfully normalized

### Requirement: Scanned PDF detection and OCR

The system MUST detect image-only PDF pages and MUST invoke a configured local OCR adapter for pages without a usable text layer.

#### Scenario: Detect a pure image PDF

- **WHEN** a PDF has no usable text layer or its extracted text coverage is below the configured threshold
- **THEN** the system classifies the affected pages as `image_only` and starts OCR processing without modifying the original PDF

#### Scenario: OCR a Chinese scanned PDF

- **WHEN** the local OCR adapter and the configured Chinese language data are available
- **THEN** the system generates a searchable derived PDF or equivalent OCR result, extracts page-level text, and records `extractionMethod: ocr`

#### Scenario: OCR dependency is unavailable

- **WHEN** OCR is required but OCRmyPDF, Tesseract, a language pack, or a required renderer is unavailable
- **THEN** the system records `ocr_failed` with an actionable dependency error and retains the original file

#### Scenario: OCR times out or returns invalid output

- **WHEN** the OCR process exceeds its configured timeout or produces an unreadable output artifact
- **THEN** the system terminates or rejects the process, records the failure stage, and MUST NOT mark the document as succeeded

### Requirement: Normalized document artifact

The system MUST produce a versioned normalized artifact containing page, text and provenance information for downstream structural chunking.

#### Scenario: Store normalized pages

- **WHEN** extraction or OCR completes successfully
- **THEN** the normalized artifact contains a stable schema version, page numbers, page text and available block location or confidence metadata

#### Scenario: Preserve source provenance

- **WHEN** a paragraph, table or OCR block is normalized
- **THEN** its page or source locator is retained whenever the source format provides one

#### Scenario: Link the artifact to the Document record

- **WHEN** a normalized artifact is written
- **THEN** the Document record stores its stable artifact URI, normalized content hash, extraction method and parser/normalizer version

### Requirement: Immutable originals and derived outputs

The system MUST preserve original source files as read-only inputs and MUST write OCR and normalized outputs separately.

#### Scenario: Process an original file

- **WHEN** an import task reads a source file
- **THEN** the source file remains byte-for-byte unchanged and its original content hash remains traceable from the Document record

#### Scenario: Reprocess a document

- **WHEN** a document is reprocessed with a new parser or OCR version
- **THEN** the system writes a new derived artifact or version without silently overwriting the original source

### Requirement: Deduplication and processing lifecycle

The system MUST use a stable source identifier and content hash to avoid unrelated duplicate imports and MUST expose actionable processing states.

#### Scenario: Import the same file twice

- **WHEN** the same knowledge base receives the same source identifier and content hash twice
- **THEN** the system identifies the existing document or creates no unrelated duplicate record

#### Scenario: Import changed source content

- **WHEN** the source identifier is unchanged but the content hash differs
- **THEN** the system records the content as a new version or a new processing revision according to the configured version policy

#### Scenario: Record successful processing

- **WHEN** all required extraction, OCR and artifact validation steps succeed
- **THEN** the Document status becomes `succeeded` and includes the extraction method and artifact metadata

#### Scenario: Record processing failure

- **WHEN** any required processing step fails
- **THEN** the Document status becomes `failed`, `ocr_failed` or `manual_review` as appropriate and retains an actionable error message

### Requirement: Tenant-safe document import

The system MUST associate an imported document with an existing KnowledgeBase and MUST NOT trust a client-supplied owner as the only authorization boundary.

#### Scenario: Import into a permitted knowledge base

- **WHEN** an authenticated user starts an import for a knowledge base they can access
- **THEN** the Document is created under that KnowledgeBase and records the uploader identity when available

#### Scenario: Reject an unauthorized import

- **WHEN** a user starts an import for a knowledge base they cannot access
- **THEN** the system rejects the import before reading or persisting document content
