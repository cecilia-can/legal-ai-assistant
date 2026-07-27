import { prisma } from "@/lib/db";

export type MessageRole = "user" | "assistant";

export type MessageRecord = {
  id: string;
  conversationId: string;
  role: string;
  content: string;
  createdAt: Date;
};

export type ListMessagesResult = {
  items: MessageRecord[];
  nextCursor: string | null;
};

export type CreateMessageInput = {
  role: MessageRole;
  content: string;
};

export class MessageServiceError extends Error {
  readonly code: "NOT_FOUND" | "BAD_REQUEST";

  constructor(message: string, code: "NOT_FOUND" | "BAD_REQUEST") {
    super(message);
    this.name = "MessageServiceError";
    this.code = code;
  }
}

type CursorPayload = {
  createdAt: string;
  id: string;
};

export function encodeMessageCursor(message: {
  createdAt: Date;
  id: string;
}): string {
  const payload: CursorPayload = {
    createdAt: message.createdAt.toISOString(),
    id: message.id,
  };

  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

export function decodeMessageCursor(cursor: string): CursorPayload {
  try {
    const json = Buffer.from(cursor, "base64url").toString("utf8");
    const payload = JSON.parse(json) as CursorPayload;

    if (
      typeof payload?.createdAt !== "string" ||
      typeof payload?.id !== "string" ||
      Number.isNaN(Date.parse(payload.createdAt))
    ) {
      throw new Error("invalid");
    }

    return payload;
  } catch {
    throw new MessageServiceError("cursor 无效。", "BAD_REQUEST");
  }
}

async function assertConversationExists(conversationId: string) {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { id: true },
  });

  if (!conversation) {
    throw new MessageServiceError("会话不存在。", "NOT_FOUND");
  }
}

/**
 * 分页列出会话消息。
 * - 无 cursor：取最近 limit 条，再按时间升序返回。
 * - 有 cursor：取该游标之前（更早）的至多 limit 条，升序返回。
 */
export async function listMessages(
  conversationId: string,
  options: { limit: number; cursor?: string | null },
): Promise<ListMessagesResult> {
  await assertConversationExists(conversationId);

  const limit = options.limit;
  const cursor = options.cursor?.trim() ? options.cursor.trim() : null;

  if (cursor) {
    const decoded = decodeMessageCursor(cursor);
    const cursorDate = new Date(decoded.createdAt);

    const olderDesc = await prisma.message.findMany({
      where: {
        conversationId,
        OR: [
          { createdAt: { lt: cursorDate } },
          { createdAt: cursorDate, id: { lt: decoded.id } },
        ],
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
    });

    const pageDesc = olderDesc.slice(0, limit);
    const items = [...pageDesc].reverse();
    const nextCursor =
      olderDesc.length > limit && items.length > 0
        ? encodeMessageCursor(items[0])
        : null;

    return { items, nextCursor };
  }

  const latestDesc = await prisma.message.findMany({
    where: { conversationId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
  });

  const pageDesc = latestDesc.slice(0, limit);
  const items = [...pageDesc].reverse();
  const nextCursor =
    latestDesc.length > limit && items.length > 0
      ? encodeMessageCursor(items[0])
      : null;

  return { items, nextCursor };
}

export async function createMessage(
  conversationId: string,
  input: CreateMessageInput,
): Promise<MessageRecord> {
  const [message] = await createMessages(conversationId, [input]);
  return message;
}

/** 同一事务内批量创建消息，避免只写入 user、assistant 丢失 */
export async function createMessages(
  conversationId: string,
  inputs: CreateMessageInput[],
): Promise<MessageRecord[]> {
  await assertConversationExists(conversationId);

  if (!inputs.length) {
    throw new MessageServiceError("messages 不能为空。", "BAD_REQUEST");
  }

  const normalized = inputs.map((input) => {
    const content = input.content.trim();
    if (!content) {
      throw new MessageServiceError("消息内容不能为空。", "BAD_REQUEST");
    }

    if (input.role !== "user" && input.role !== "assistant") {
      throw new MessageServiceError("role 无效。", "BAD_REQUEST");
    }

    return { role: input.role, content };
  });

  return prisma.$transaction(async (tx) => {
    const created: MessageRecord[] = [];

    for (const input of normalized) {
      const message = await tx.message.create({
        data: {
          conversationId,
          role: input.role,
          content: input.content,
        },
      });
      created.push(message);
    }

    await tx.conversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    });

    return created;
  });
}

export async function deleteMessage(
  conversationId: string,
  messageId: string,
): Promise<void> {
  await assertConversationExists(conversationId);

  const existing = await prisma.message.findUnique({
    where: { id: messageId },
    select: { id: true, conversationId: true },
  });

  if (!existing || existing.conversationId !== conversationId) {
    throw new MessageServiceError("消息不存在。", "NOT_FOUND");
  }

  await prisma.message.delete({ where: { id: messageId } });
}
