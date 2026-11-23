import { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/db";
import { MessageServiceError } from "@/lib/services/messageService";
import type { ChatSource } from "@/types/chat";

export const CHAT_RUN_STATUSES = [
  "generating",
  "completed",
  "cancelled",
  "failed",
] as const;

export type ChatRunStatus = (typeof CHAT_RUN_STATUSES)[number];

export type ChatRunFailureReason =
  | "UPSTREAM_ERROR"
  | "UPSTREAM_TIMEOUT"
  | "STREAM_INTERRUPTED";

export class ChatRunServiceError extends Error {
  readonly code: "CONFLICT" | "NOT_FOUND";

  constructor(message: string, code: "CONFLICT" | "NOT_FOUND") {
    super(message);
    this.name = "ChatRunServiceError";
    this.code = code;
  }
}

async function assertConversationOwnership(conversationId: string, userId: string) {
  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, userId },
    select: { id: true },
  });

  if (!conversation) {
    throw new MessageServiceError("会话不存在。", "NOT_FOUND");
  }
}

export type CreateChatRunResult =
  | { kind: "created"; run: Awaited<ReturnType<typeof createChatRunRecord>> }
  | { kind: "existing"; run: Awaited<ReturnType<typeof createChatRunRecord>> };

async function createChatRunRecord(tx: Prisma.TransactionClient, input: {
  conversationId: string;
  content: string;
  clientRequestId: string;
}) {
  const userMessage = await tx.message.create({
    data: {
      conversationId: input.conversationId,
      role: "user",
      content: input.content,
    },
  });
  const assistantMessage = await tx.message.create({
    data: {
      conversationId: input.conversationId,
      role: "assistant",
      content: "",
    },
  });
  const run = await tx.chatRun.create({
    data: {
      conversationId: input.conversationId,
      userMessageId: userMessage.id,
      assistantMessageId: assistantMessage.id,
      clientRequestId: input.clientRequestId,
      status: "generating",
    },
    include: { userMessage: true, assistantMessage: true },
  });

  await tx.conversation.update({
    where: { id: input.conversationId },
    data: { updatedAt: new Date() },
  });

  return run;
}

export async function createOrGetChatRun(input: {
  conversationId: string;
  userId: string;
  content: string;
  clientRequestId: string;
}): Promise<CreateChatRunResult> {
  await assertConversationOwnership(input.conversationId, input.userId);

  const existing = await prisma.chatRun.findUnique({
    where: {
      conversationId_clientRequestId: {
        conversationId: input.conversationId,
        clientRequestId: input.clientRequestId,
      },
    },
    include: { userMessage: true, assistantMessage: true },
  });
  if (existing) {
    return { kind: "existing", run: existing };
  }

  try {
    const run = await prisma.$transaction(async (tx) => {
      const active = await tx.chatRun.findFirst({
        where: { conversationId: input.conversationId, status: "generating" },
        select: { id: true },
      });
      if (active) {
        throw new ChatRunServiceError("该会话正在生成回复。", "CONFLICT");
      }

      return createChatRunRecord(tx, input);
    });
    return { kind: "created", run };
  } catch (error) {
    if (error instanceof ChatRunServiceError) {
      throw error;
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const duplicate = await prisma.chatRun.findUnique({
        where: {
          conversationId_clientRequestId: {
            conversationId: input.conversationId,
            clientRequestId: input.clientRequestId,
          },
        },
        include: { userMessage: true, assistantMessage: true },
      });
      if (duplicate) {
        return { kind: "existing", run: duplicate };
      }
      throw new ChatRunServiceError("该会话正在生成回复。", "CONFLICT");
    }

    throw error;
  }
}

export async function completeChatRun(input: {
  runId: string;
  content: string;
  sources?: ChatSource[];
}): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const run = await tx.chatRun.findUnique({
      where: { id: input.runId },
      select: { assistantMessageId: true },
    });
    if (!run) {
      throw new ChatRunServiceError("生成任务不存在。", "NOT_FOUND");
    }
    await tx.message.update({
      where: { id: run.assistantMessageId },
      data: { content: input.content, ...(input.sources?.length ? { sources: input.sources as unknown as Prisma.InputJsonValue } : {}) },
    });
    await tx.chatRun.update({
      where: { id: input.runId },
      data: { status: "completed", failureReason: null, completedAt: new Date() },
    });
  });
}

export async function finishChatRun(input: {
  runId: string;
  status: "cancelled" | "failed";
  content: string;
  failureReason?: ChatRunFailureReason;
}): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const run = await tx.chatRun.findUnique({
      where: { id: input.runId },
      select: { assistantMessageId: true },
    });
    if (!run) {
      throw new ChatRunServiceError("生成任务不存在。", "NOT_FOUND");
    }
    await tx.message.update({
      where: { id: run.assistantMessageId },
      data: { content: input.content },
    });
    await tx.chatRun.update({
      where: { id: input.runId },
      data: {
        status: input.status,
        failureReason: input.failureReason ?? null,
        completedAt: new Date(),
      },
    });
  });
}
