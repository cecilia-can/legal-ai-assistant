import { jsonError, jsonSuccess } from "@/lib/api/api-response";
import { serializeConversation } from "@/lib/api/conversation-response";
import { requireApiSession } from "@/lib/auth/require-api-session";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

async function findOwnedConversation(id: string, userId: string) {
  return prisma.conversation.findFirst({
    where: { id, userId },
  });
}

export async function PATCH(request: Request, context: RouteContext) {
  const session = await requireApiSession();
  if (session.error) {
    return session.error;
  }

  const { id } = await context.params;

  try {
    const body = (await request.json().catch(() => ({}))) as {
      title?: unknown;
    };

    if (typeof body.title !== "string" || !body.title.trim()) {
      return jsonError("标题不能为空。", 400);
    }

    const existing = await findOwnedConversation(id, session.userId);
    if (!existing) {
      return jsonError("会话不存在。", 404);
    }

    const conversation = await prisma.conversation.update({
      where: { id },
      data: { title: body.title.trim() },
    });

    return jsonSuccess(serializeConversation(conversation));
  } catch (error) {
    console.error(`PATCH /api/conversations/${id} failed:`, error);
    return jsonError("无法更新会话标题，请稍后重试。", 500);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const session = await requireApiSession();
  if (session.error) {
    return session.error;
  }

  const { id } = await context.params;

  try {
    const existing = await findOwnedConversation(id, session.userId);
    if (!existing) {
      return jsonError("会话不存在。", 404);
    }

    await prisma.conversation.delete({ where: { id } });

    return jsonSuccess(null);
  } catch (error) {
    console.error(`DELETE /api/conversations/${id} failed:`, error);
    return jsonError("无法删除会话，请稍后重试。", 500);
  }
}
