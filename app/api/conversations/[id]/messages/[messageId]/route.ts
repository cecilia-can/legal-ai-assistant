import { jsonError, jsonSuccess } from "@/lib/api/api-response";
import {
  MessageServiceError,
  deleteMessage,
} from "@/lib/services/messageService";

type RouteContext = {
  params: Promise<{ id: string; messageId: string }>;
};

export async function DELETE(_request: Request, context: RouteContext) {
  const { id, messageId } = await context.params;

  try {
    await deleteMessage(id, messageId);
    return jsonSuccess(null);
  } catch (error) {
    if (error instanceof MessageServiceError) {
      const status = error.code === "NOT_FOUND" ? 404 : 400;
      return jsonError(error.message, status);
    }

    console.error(
      `DELETE /api/conversations/${id}/messages/${messageId} failed:`,
      error,
    );
    return jsonError("无法删除消息，请稍后重试。", 500);
  }
}