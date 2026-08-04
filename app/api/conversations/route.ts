import { jsonError, jsonSuccess } from "@/lib/api/api-response";
import { serializeConversation } from "@/lib/api/conversation-response";
import { DEFAULT_CONVERSATION_TITLE } from "@/lib/conversation-defaults";
import { requireApiSession } from "@/lib/auth/require-api-session";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await requireApiSession();
  if (session.error) {
    return session.error;
  }

  try {
    const conversations = await prisma.conversation.findMany({
      where: { userId: session.userId },
      orderBy: { updatedAt: "desc" },
    });

    return jsonSuccess(conversations.map(serializeConversation));
  } catch (error) {
    console.error("GET /api/conversations failed:", error);
    return jsonError("无法加载会话列表，请稍后重试。", 500);
  }
}

export async function POST(request: Request) {
  const session = await requireApiSession();
  if (session.error) {
    return session.error;
  }

  try {
    const body = (await request.json().catch(() => ({}))) as {
      title?: unknown;
    };

    const title =
      typeof body.title === "string" && body.title.trim()
        ? body.title.trim()
        : DEFAULT_CONVERSATION_TITLE;

    const conversation = await prisma.conversation.create({
      data: {
        title,
        userId: session.userId,
      },
    });

    return jsonSuccess(serializeConversation(conversation), { status: 201 });
  } catch (error) {
    console.error("POST /api/conversations failed:", error);
    return jsonError("无法创建会话，请稍后重试。", 500);
  }
}
