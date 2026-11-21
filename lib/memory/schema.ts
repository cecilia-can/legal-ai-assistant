import { z } from "zod";

const sourceMessageId = z.string().min(1).max(191);

export const memoryFactSchema = z.object({
  statement: z.string().min(1).max(2_000),
  status: z.enum(["user_stated", "document_supported", "uncertain"]),
  sourceMessageIds: z.array(sourceMessageId).min(1).max(20),
});

export const conversationMemoryContentSchema = z.object({
  summary: z.string().min(1).max(8_000),
  topics: z.array(z.string().min(1).max(240)).max(20),
  conclusions: z.array(z.string().min(1).max(1_000)).max(20),
  openQuestions: z.array(z.string().min(1).max(1_000)).max(20),
  case: z
    .object({
      parties: z.array(z.object({ role: z.string().min(1).max(120), name: z.string().min(1).max(240).optional() })).max(20),
      timeline: z.array(z.object({ date: z.string().min(1).max(120).optional(), event: z.string().min(1).max(1_000), sourceMessageIds: z.array(sourceMessageId).min(1).max(20) })).max(50),
      facts: z.array(memoryFactSchema).max(50),
      evidence: z.array(z.object({ item: z.string().min(1).max(1_000), status: z.enum(["provided", "mentioned", "needed"]), sourceMessageIds: z.array(sourceMessageId).min(1).max(20) })).max(50),
      issues: z.array(z.string().min(1).max(1_000)).max(20),
    })
    .optional(),
});

export type ConversationMemoryContent = z.infer<typeof conversationMemoryContentSchema>;

export function getMemorySourceMessageIds(content: ConversationMemoryContent): string[] {
  const sourceIds = new Set<string>();
  for (const fact of content.case?.facts ?? []) {
    fact.sourceMessageIds.forEach((id) => sourceIds.add(id));
  }
  for (const item of content.case?.timeline ?? []) {
    item.sourceMessageIds.forEach((id) => sourceIds.add(id));
  }
  for (const item of content.case?.evidence ?? []) {
    item.sourceMessageIds.forEach((id) => sourceIds.add(id));
  }
  return [...sourceIds];
}
