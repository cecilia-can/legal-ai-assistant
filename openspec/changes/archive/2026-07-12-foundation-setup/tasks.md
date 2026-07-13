## 1. Database Schema

- [x] 1.1 Update `prisma/schema.prisma` with the `Conversation` model.
- [x] 1.2 Update `prisma/schema.prisma` with the `Message` model.
- [x] 1.3 Configure the one-to-many `Conversation` to `Message` relation with cascade delete.
- [x] 1.4 Keep the existing Prisma 7 datasource pattern where `DATABASE_URL` is read through `prisma.config.ts`.

## 2. Environment Configuration

- [x] 2.1 Create `.env.example` with a documented PostgreSQL `DATABASE_URL` example.
- [x] 2.2 Confirm `.env` is ignored by Git so local database credentials are not committed.

## 3. Prisma Client Access

- [x] 3.1 Create `lib/db.ts`.
- [x] 3.2 Import `PrismaClient` from the configured generated client path.
- [x] 3.3 Export a shared `prisma` instance from `lib/db.ts`.
- [x] 3.4 Add development hot-reload protection using `globalThis`.

## 4. Project Structure

- [x] 4.1 Create `components/chat/`.
- [x] 4.2 Create `components/layout/`.
- [x] 4.3 Create `components/ui/`.
- [x] 4.4 Create `lib/ai/`.
- [x] 4.5 Create `lib/hooks/`.
- [x] 4.6 Create `lib/services/`.
- [x] 4.7 Create `types/`.
- [x] 4.8 Add `.gitkeep` files to intentionally empty directories.

## 5. Shared Types

- [x] 5.1 Create `types/chat.ts`.
- [x] 5.2 Define `MessageRole` as `"user" | "assistant" | "system"`.
- [x] 5.3 Define `ChatMessage` with `id`, `role`, `content`, and `createdAt`.
- [x] 5.4 Define `Conversation` with `id`, `title`, `createdAt`, and `updatedAt`.

## 6. Migration and Verification

- [x] 6.1 Configure local `.env` with a valid PostgreSQL `DATABASE_URL`.
- [x] 6.2 Run `npx prisma migrate dev --name init`.
- [x] 6.3 Run `npx prisma generate`.
- [x] 6.4 Verify `lib/db.ts` can import the generated Prisma Client.
- [x] 6.5 Run project linting to confirm the foundation changes do not introduce TypeScript or ESLint issues.
