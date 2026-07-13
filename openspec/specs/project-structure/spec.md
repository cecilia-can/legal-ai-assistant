## Purpose

Define the foundational project structure, shared chat types, environment template, and naming conventions for early ChatBot development.

## Requirements

### Requirement: Feature-oriented project directories
The system SHALL provide foundational directories for ChatBot development and later AI capabilities.

The project MUST include:

- `components/chat/` for chat-related UI components
- `components/layout/` for layout components
- `components/ui/` for reusable base UI components
- `lib/` for shared application libraries
- `lib/ai/` for AI client, prompts, and context utilities
- `lib/hooks/` for React hooks
- `lib/services/` for service-layer modules
- `types/` for shared TypeScript types

#### Scenario: Foundation directories exist
- **WHEN** a developer inspects the project root after Change 1.1 is implemented
- **THEN** all foundational directories are present and available for subsequent changes

#### Scenario: Chat UI files have a defined location
- **WHEN** Change 1.2 adds chat components
- **THEN** chat-specific components can be placed under `components/chat/`

#### Scenario: Service files have a defined location
- **WHEN** Change 1.5 adds message persistence services
- **THEN** service-layer files can be placed under `lib/services/`

### Requirement: Empty directory preservation
The system SHALL preserve intentionally empty foundational directories in version control.

Each foundational directory that has no source file yet MUST include a placeholder file such as `.gitkeep`.

#### Scenario: Clone repository preserves structure
- **WHEN** a developer clones the repository before later features are added
- **THEN** the foundational empty directories are still present

### Requirement: Shared chat types
The system SHALL define shared TypeScript chat types in `types/chat.ts`.

The file MUST define:

- `MessageRole`: union type containing `"user"`, `"assistant"`, and `"system"`
- `ChatMessage`: interface containing `id`, `role`, `content`, and `createdAt`
- `Conversation`: interface containing `id`, `title`, `createdAt`, and `updatedAt`

#### Scenario: Import chat message type
- **WHEN** an application module imports `ChatMessage` from `types/chat.ts`
- **THEN** it receives a type compatible with the initial message model

#### Scenario: Role type matches supported message roles
- **WHEN** code assigns `"user"`, `"assistant"`, or `"system"` to `MessageRole`
- **THEN** TypeScript accepts the value as a supported chat role

### Requirement: Environment variable example
The system SHALL provide a `.env.example` file documenting required local environment variables.

The `.env.example` file MUST include `DATABASE_URL` with a PostgreSQL connection string example and a short explanation of its purpose.

#### Scenario: Developer configures local environment
- **WHEN** a developer copies `.env.example` to `.env` and sets a valid PostgreSQL `DATABASE_URL`
- **THEN** Prisma can read the local database connection configuration

#### Scenario: Required variable is discoverable
- **WHEN** a developer opens `.env.example`
- **THEN** the required `DATABASE_URL` variable and its expected format are visible

### Requirement: Secret exclusion
The system SHALL keep local secret files out of version control.

The repository MUST ignore `.env` so database credentials are not committed.

#### Scenario: Local database credentials are not tracked
- **WHEN** a developer creates `.env` with a real `DATABASE_URL`
- **THEN** Git does not include `.env` in tracked changes

### Requirement: Naming conventions
The system SHALL follow the project naming convention of English code identifiers and Chinese documentation.

Source file names, TypeScript identifiers, and database model names MUST be English. Planning and design documentation SHOULD be written in Chinese unless a template requires otherwise.

#### Scenario: Source names use English
- **WHEN** a developer inspects `lib/db.ts`, `types/chat.ts`, or Prisma models
- **THEN** file names, exported identifiers, model names, and field names use English

#### Scenario: Planning documents use Chinese
- **WHEN** a developer reads project planning documents for this change
- **THEN** the explanatory content is written primarily in Chinese
