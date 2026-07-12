## ADDED Requirements

### Requirement: Conversation data model
The system SHALL define a `Conversation` model in Prisma for storing chat sessions.

The `Conversation` model MUST include:

- `id`: unique string identifier generated with `cuid()`
- `title`: string title with default value `"New Chat"`
- `createdAt`: creation timestamp generated automatically
- `updatedAt`: update timestamp maintained automatically
- `messages`: relation to associated `Message` records

#### Scenario: Create conversation with defaults
- **WHEN** a new `Conversation` record is created without an explicit title
- **THEN** the database stores the record with an auto-generated `id`, a default `title` of `"New Chat"`, and generated timestamps

#### Scenario: Update conversation timestamp
- **WHEN** an existing `Conversation` record is updated
- **THEN** the `updatedAt` field is refreshed automatically

### Requirement: Message data model
The system SHALL define a `Message` model in Prisma for storing chat messages that belong to a conversation.

The `Message` model MUST include:

- `id`: unique string identifier generated with `cuid()`
- `conversationId`: foreign key referencing `Conversation.id`
- `role`: string role value representing the message author
- `content`: long text message body
- `createdAt`: creation timestamp generated automatically
- `conversation`: relation to the owning `Conversation`

#### Scenario: Create message for conversation
- **WHEN** a `Message` is created with a valid `conversationId`, `role`, and `content`
- **THEN** the message is persisted and can be queried through its conversation

#### Scenario: Store long message content
- **WHEN** a message contains long Markdown or legal-analysis text
- **THEN** the `content` field stores the full text without application-level truncation

### Requirement: Conversation-message relationship
The system SHALL model `Conversation` to `Message` as a one-to-many relationship.

Messages MUST be associated with exactly one conversation. Deleting a conversation MUST delete its associated messages.

#### Scenario: Query conversation messages
- **WHEN** the system loads a conversation with its messages
- **THEN** all messages associated with that conversation are available through the relation

#### Scenario: Delete conversation cascades messages
- **WHEN** a `Conversation` record is deleted
- **THEN** all `Message` records associated with that conversation are deleted by cascade

### Requirement: PostgreSQL datasource configuration
The system SHALL use PostgreSQL as the Prisma datasource for persistent chat data.

The datasource URL MUST be read from the `DATABASE_URL` environment variable through the existing Prisma configuration.

#### Scenario: Read configured database URL
- **WHEN** `DATABASE_URL` is set to a valid PostgreSQL connection string
- **THEN** Prisma uses that connection string for database operations and migrations

#### Scenario: Missing database URL
- **WHEN** `DATABASE_URL` is not set
- **THEN** Prisma operations fail with a configuration error instead of silently using another database

### Requirement: Prisma Client singleton
The system SHALL provide a shared Prisma Client instance from `lib/db.ts`.

The implementation MUST reuse the Prisma Client instance during development hot reloads and MUST export a `prisma` object for use by application modules.

#### Scenario: Import database client
- **WHEN** an application module imports `prisma` from `lib/db.ts`
- **THEN** it receives a usable Prisma Client instance

#### Scenario: Development hot reload reuses client
- **WHEN** Next.js development mode reloads modules after a code change
- **THEN** the existing Prisma Client instance is reused instead of creating an additional database client

### Requirement: Initial database migration
The system SHALL manage the initial database schema through Prisma Migrate.

The initial migration MUST create the `Conversation` and `Message` tables and their relationship constraints.

#### Scenario: Apply initial migration
- **WHEN** the developer runs `npx prisma migrate dev --name init` with a valid `DATABASE_URL`
- **THEN** Prisma creates the initial migration and applies the `Conversation` and `Message` schema to the database

#### Scenario: Generate Prisma Client
- **WHEN** the developer runs `npx prisma generate`
- **THEN** Prisma Client is generated at the configured output path and can be imported by `lib/db.ts`
