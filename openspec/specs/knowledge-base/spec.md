## Purpose

定义法律知识库的数据边界、文档来源追踪、文档切片和 Embedding 存储能力，为多格式导入、向量检索和 RAG 回答提供稳定基础。

## Requirements

### Requirement: Knowledge base ownership boundary
The system MUST represent a knowledge base as the ownership and visibility boundary for documents.

A knowledge base MUST include:

- `id`: unique identifier
- `name`: human-readable name
- `scope`: system or user scope
- `ownerId`: nullable for system knowledge bases and required for user-owned knowledge bases

#### Scenario: Create a system knowledge base
- **WHEN** an administrator creates a system knowledge base
- **THEN** the knowledge base is stored with system scope and without a regular user owner

#### Scenario: Create a user knowledge base
- **WHEN** an authenticated user creates a private knowledge base
- **THEN** the knowledge base is stored with user scope and is bound to that user's ID

#### Scenario: Prevent cross-scope document ownership
- **WHEN** a document is created for a knowledge base
- **THEN** the document MUST reference exactly one knowledge base and MUST NOT rely on a client-supplied owner ID as the only authorization check

### Requirement: Document data model
The system MUST persist document metadata independently from document content processing.

A document MUST include fields for:

- its knowledge base relation
- original filename and stable source identifier
- source type and category
- content hash for deduplication
- processing status and error information
- parser or normalization version
- creation and update timestamps

#### Scenario: Register a document before parsing
- **WHEN** a document is imported
- **THEN** the system can create a document record with a pending processing status before parsing begins

#### Scenario: Detect an unchanged document
- **WHEN** a document with the same stable source identifier and content hash is imported again
- **THEN** the system can identify it as unchanged without creating an unrelated duplicate document

#### Scenario: Record processing failure
- **WHEN** parsing or normalization fails
- **THEN** the document retains a failure status and an actionable error message without losing its source metadata

### Requirement: Document chunk data model
The system MUST persist document chunks as first-class records associated with a document.

A document chunk MUST include:

- its parent document relation
- chunk ordinal within the document
- text content stored without application-level truncation
- section or locator metadata sufficient for later citation
- creation timestamp and chunking strategy version

#### Scenario: Preserve chunk order
- **WHEN** multiple chunks are created for the same document
- **THEN** each chunk has a unique ordinal within that document and can be returned in source order

#### Scenario: Preserve source provenance
- **WHEN** a chunk is stored
- **THEN** it can retain page, section, article, clause, or other source locator metadata for later citation

#### Scenario: Re-chunk a document
- **WHEN** a document is processed with a new chunking strategy version
- **THEN** the system can distinguish the new chunk set from the previous strategy without confusing chunk order or source provenance

### Requirement: Embedding metadata and vector storage
The system MUST persist embeddings as records associated with document chunks rather than whole documents.

An embedding MUST include:

- its document chunk relation
- embedding model identifier
- vector dimensions
- source content hash
- vector value compatible with PostgreSQL pgvector
- creation timestamp

The combination of chunk, model, and content version MUST prevent duplicate embedding records for the same content version.

#### Scenario: Store an embedding for a chunk
- **WHEN** an embedding is generated for a document chunk
- **THEN** the embedding is stored against that chunk with its model and dimension metadata

#### Scenario: Re-embed changed content
- **WHEN** the chunk content hash changes or a different model is selected
- **THEN** the system can create a new embedding without silently treating it as the previous model or content version

#### Scenario: Reject inconsistent vector metadata
- **WHEN** a vector is written with a dimension that does not match the recorded dimensions
- **THEN** the write MUST fail rather than storing an ambiguous vector record

### Requirement: PostgreSQL pgvector extension
The system MUST enable the PostgreSQL `vector` extension through a versioned migration.

#### Scenario: Apply vector extension migration
- **WHEN** the migration is applied to a PostgreSQL database without the extension
- **THEN** the migration creates the `vector` extension and the knowledge base tables without requiring a manual SQL step

#### Scenario: Reapply migration safely
- **WHEN** the migration is applied to a database where the `vector` extension already exists
- **THEN** the migration remains idempotent for extension creation and does not fail because of a duplicate extension

#### Scenario: Use an unsupported database image
- **WHEN** the migration runs against PostgreSQL without pgvector support
- **THEN** the migration fails with a clear database error instead of silently storing vectors in an unrelated type

### Requirement: Migration safety for existing tenant data
The system MUST add the knowledge base foundation without changing existing User, Conversation, or Message records.

#### Scenario: Apply migration to an existing Phase 1 database
- **WHEN** the migration is applied to a database containing authenticated users and conversations
- **THEN** those records remain readable and their ownership relationships remain unchanged

#### Scenario: Generate the Prisma client
- **WHEN** the developer runs `npx prisma generate`
- **THEN** the generated client exposes the new relational models while preserving the existing client import path
