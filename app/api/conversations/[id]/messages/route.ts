import { jsonError, jsonSuccess } from "@/lib/api/api-response";
import { serializeMessage } from "@/lib/api/message-response";
import {
  MessageServiceError,
  createMessage,
  createMessages,
  listMessages,
  type CreateMessageInput,
} from "@/lib/services/messageService";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

function parseLimit(raw: string | null): number | Response {
  if (raw === null || raw === "") {
    return DEFAULT_LIMIT;
  }

  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > MAX_LIMIT) {
    return jsonError(`limit 必须是 1-${MAX_LIMIT} 的整数。`, 400);
  }

  return value;
}

function serviceErrorResponse(error: unknown, fallback: string) {
  if (error instanceof MessageServiceError) {
    const status = error.code === "NOT_FOUND" ? 404 : 400;
    return jsonError(error.message, status);
  }

  console.error(fallback, error);
  return jsonError(fallback, 500);
}

function parseCreateInput(value: unknown): CreateMessageInput | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const record = value as { role?: unknown; content?: unknown };
  if (record.role !== "user" && record.role !== "assistant") {
    return null;
  }

  if (typeof record.content !== "string" || !record.content.trim()) {
    return null;
  }

  return { role: record.role, content: record.content };
}

export async function GET(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const { searchParams } = new URL(request.url);
  const limitOrError = parseLimit(searchParams.get("limit"));

  if (limitOrError instanceof Response) {
    return limitOrError;
  }

  try {
    const result = await listMessages(id, {
      limit: limitOrError,
      cursor: searchParams.get("cursor"),
    });

    return jsonSuccess({
      items: result.items.map(serializeMessage),
      nextCursor: result.nextCursor,
    });
  } catch (error) {
    return serviceErrorResponse(error, "无法加载消息，请稍后重试。");
  }
}

export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;

  try {
    const body = (await request.json().catch(() => null)) as {
      role?: unknown;
      content?: unknown;
      messages?: unknown;
    } | null;

    if (!body || typeof body !== "object") {
      return jsonError("请求体必须是 JSON。", 400);
    }

    if (Array.isArray(body.messages)) {
      if (body.messages.length === 0) {
        return jsonError("messages 不能为空。", 400);
      }

      const inputs: CreateMessageInput[] = [];
      for (const item of body.messages) {
        const parsed = parseCreateInput(item);
        if (!parsed) {
          return jsonError(
            "messages 每项必须含 role（user|assistant）与非空 content。",
            400,
          );
        }
        inputs.push(parsed);
      }

      const created = await createMessages(id, inputs);
      return jsonSuccess(
        { items: created.map(serializeMessage) },
        { status: 201 },
      );
    }

    const single = parseCreateInput(body);
    if (!single) {
      return jsonError("role 必须是 user 或 assistant，且 content 非空。", 400);
    }

    const message = await createMessage(id, single);
    return jsonSuccess(serializeMessage(message), { status: 201 });
  } catch (error) {
    return serviceErrorResponse(error, "无法保存消息，请稍后重试。");
  }
}
