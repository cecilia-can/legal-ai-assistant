import "server-only";

import { prisma } from "@/lib/db";

export class KnowledgeBaseAccessError extends Error {
  constructor() {
    super("知识库不存在或无权访问。");
    this.name = "KnowledgeBaseAccessError";
  }
}

/** System knowledge bases are readable by authenticated users; private bases by their owner only. */
export async function assertKnowledgeBaseAccess(userId: string, knowledgeBaseId: string) {
  const knowledgeBase = await prisma.knowledgeBase.findFirst({
    where: { id: knowledgeBaseId, OR: [{ scope: "system" }, { ownerId: userId }] },
    select: { id: true },
  });
  if (!knowledgeBase) throw new KnowledgeBaseAccessError();
  return knowledgeBase;
}

export function knowledgeBaseScopeDescription(userId: string) {
  return { userId, scopes: ["system", "owned"] as const };
}
