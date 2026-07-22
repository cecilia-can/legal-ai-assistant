import { jsonError, jsonSuccess } from "@/lib/api/api-response";
import { serializeConversation } from "@/lib/api/conversation-response";
import { DEFAULT_CONVERSATION_TITLE } from "@/lib/conversation-defaults";
import { prisma } from "@/lib/db";

// 获取会话列表
export async function GET() {
  // 从数据库中获取会话列表，并按更新时间降序排序
  try {
    const conversations = await prisma.conversation.findMany({
      orderBy: { updatedAt: "desc" },
    });

    return jsonSuccess(conversations.map(serializeConversation));
  } catch (error) {
    console.error("GET /api/conversations failed:", error);
    return jsonError("无法加载会话列表，请稍后重试。", 500);
  }
}

// 创建会话
export async function POST(request: Request) {
  try {
    // 解析请求体，如果解析失败，则返回空对象
    // as 是 TypeScript 的 类型断言：告诉编译器「把这个值当成某种类型来看」
    // 将 unknown 类型断言为 { title?: unknown } 类型
    const body = (await request.json().catch(() => ({}))) as {
      title?: unknown;
    };

    const title =
      typeof body.title === "string" && body.title.trim()
        ? body.title.trim()
        : DEFAULT_CONVERSATION_TITLE;

    const conversation = await prisma.conversation.create({
      data: { title },
    });

    return jsonSuccess(serializeConversation(conversation), { status: 201 });
  } catch (error) {
    console.error("POST /api/conversations failed:", error);
    return jsonError("无法创建会话，请稍后重试。", 500);
  }
}
