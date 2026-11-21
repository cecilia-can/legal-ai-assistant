import { createHash, randomUUID } from "node:crypto";
import { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/db";
import { createEmbedding, createEmbeddings, toVectorLiteral } from "@/lib/rag/embeddings";
import { getEmbeddingConfig } from "@/lib/rag/config";
import type { MessageRecord } from "@/lib/services/messageService";
import { getConversationMemoryConfig, isConversationMemoryRecallEnabled } from "./config";

export type ConversationRecallResult = {
  chunkId: string;
  text: string;
  startMessageId: string;
  endMessageId: string;
  similarity: number;
};

function chunkMessages(messages: MessageRecord[], maxCharacters = 3_000) {
  const chunks: { messages: MessageRecord[]; text: string }[] = [];
  let current: MessageRecord[] = [];
  let text = "";
  for (const message of messages) {
    const line = `${message.role}: ${message.content}`;
    if (current.length && text.length + line.length + 2 > maxCharacters) {
      chunks.push({ messages: current, text });
      current = [];
      text = "";
    }
    current.push(message);
    text += `${text ? "\n\n" : ""}${line}`;
  }
  if (current.length) chunks.push({ messages: current, text });
  return chunks;
}

function contentHash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export async function indexConversationRecallMessages(input: {
  conversationId: string;
  messages: MessageRecord[];
}): Promise<void> {
  if (!isConversationMemoryRecallEnabled() || !input.messages.length) return;
  const config = getEmbeddingConfig();
  const chunks = chunkMessages(input.messages);
  const vectors = await createEmbeddings(chunks.map((chunk) => chunk.text));
  await Promise.all(chunks.map((chunk, index) => prisma.$executeRaw(Prisma.sql`
    INSERT INTO "ConversationRecallChunk" ("id", "conversationId", "startMessageId", "endMessageId", "text", "contentHash", "model", "dimensions", "vector", "createdAt", "updatedAt")
    VALUES (${randomUUID()}, ${input.conversationId}, ${chunk.messages[0]!.id}, ${chunk.messages.at(-1)!.id}, ${chunk.text}, ${contentHash(chunk.text)}, ${config.model}, ${config.dimensions}, ${toVectorLiteral(vectors[index]!)}::vector, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT ("conversationId", "startMessageId", "endMessageId", "model", "contentHash") DO UPDATE
      SET "text" = EXCLUDED."text", "vector" = EXCLUDED."vector", "updatedAt" = CURRENT_TIMESTAMP
  `)));
}

type RawRecallResult = Omit<ConversationRecallResult, "similarity"> & { similarity: number | string };

export async function retrieveConversationRecall(input: {
  conversationId: string;
  userId: string;
  query: string;
}): Promise<ConversationRecallResult[]> {
  if (!isConversationMemoryRecallEnabled()) return [];
  const owned = await prisma.conversation.findFirst({
    where: { id: input.conversationId, userId: input.userId },
    select: { id: true },
  });
  if (!owned) return [];
  const config = getEmbeddingConfig();
  const queryVector = toVectorLiteral(await createEmbedding(input.query));
  const limit = getConversationMemoryConfig().recallTopK;
  const rows = await prisma.$queryRaw<RawRecallResult[]>(Prisma.sql`
    SELECT
      chunk."id" AS "chunkId", chunk."text" AS "text",
      chunk."startMessageId" AS "startMessageId", chunk."endMessageId" AS "endMessageId",
      1 - (chunk."vector" <=> ${queryVector}::vector) AS "similarity"
    FROM "ConversationRecallChunk" chunk
    INNER JOIN "Conversation" conversation ON conversation."id" = chunk."conversationId"
    WHERE chunk."conversationId" = ${input.conversationId}
      AND conversation."userId" = ${input.userId}
      AND chunk."model" = ${config.model}
      AND chunk."dimensions" = ${config.dimensions}
      AND chunk."vector" IS NOT NULL
    ORDER BY chunk."vector" <=> ${queryVector}::vector ASC, chunk."id" ASC
    LIMIT ${limit}
  `);
  return rows.map((row) => ({ ...row, similarity: Number(row.similarity) }));
}

export function buildConversationRecallContext(results: ConversationRecallResult[]) {
  if (!results.length) return null;
  const maxCharacters = getConversationMemoryConfig().recallMaxCharacters;
  let used = 0;
  const blocks: string[] = [];
  for (const result of results) {
    const available = maxCharacters - used;
    if (available <= 0) break;
    const text = result.text.slice(0, available);
    blocks.push(`[会话历史 ${result.startMessageId} 至 ${result.endMessageId}]\n${text}`);
    used += text.length;
  }
  return blocks.length ? { content: blocks.join("\n\n"), sourceCount: blocks.length } : null;
}
