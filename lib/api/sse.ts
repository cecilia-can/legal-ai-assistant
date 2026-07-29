import {
  isChatStreamEvent,
  type ChatStreamEvent,
} from "@/types/chat";

/**
 * 将 ChatStreamEvent 编码为 SSE 标准帧字符串。
 * 输出格式：
 * data: {"type":"token","text":"..."}\n\n
 * 供服务端写入 ReadableStream。
 */
export function encodeSseEvent(event: ChatStreamEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

const SSE_RESPONSE_HEADERS = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
} as const;

/**
 * 返回固定文本的 SSE 响应（单 token + done），用于越狱拒答等不调模型的场景。
 */
export function createFixedTextSseResponse(text: string): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      controller.enqueue(encoder.encode(encodeSseEvent({ type: "token", text })));
      controller.enqueue(encoder.encode(encodeSseEvent({ type: "done" })));
      controller.close();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: SSE_RESPONSE_HEADERS,
  });
}

export function getSseResponseHeaders(): typeof SSE_RESPONSE_HEADERS {
  return SSE_RESPONSE_HEADERS;
}

/** parseSseChunk 的返回值：
 * 已解析出的事件列表 + 尚未构成完整帧的尾部文本。
 * 例如：
 * {
 *   events: [
 *     { type: "token", text: "Hello" },
 *     { type: "done" },
 *   ],
 *   remainder: "data: { type: 'token', text: ' world!' }\n\n",
 * }
 */
export type ParseSseChunkResult = {
  events: ChatStreamEvent[];
  remainder: string;
};

/**
 * 从累积文本中增量解析 SSE 帧。
 * 按 `\n\n` 分隔完整事件；
 * 末尾不完整的片段留在 remainder，等待下次 chunk 拼接后再解析。
 */
export function parseSseChunk(buffer: string): ParseSseChunkResult {
  const events: ChatStreamEvent[] = [];
  const normalized = buffer.replace(/\r\n/g, "\n");
  const parts = normalized.split("\n\n");
  const remainder = parts.pop() ?? "";

  for (const part of parts) {
    const event = parseSseFrame(part);
    if (event) {
      events.push(event);
    }
  }

  return { events, remainder };
}

/**
 * 解析单个 SSE 帧（不含结尾的 `\n\n`）为 ChatStreamEvent。
 * 提取所有 `data:` 行并合并为 JSON；
 * 忽略空行与注释行（`:` 开头）；
 * 解析失败返回 null。
 */
function parseSseFrame(frame: string): ChatStreamEvent | null {
  const lines = frame.split("\n");
  const dataLines: string[] = [];

  for (const line of lines) {
    if (!line || line.startsWith(":")) {
      continue;
    }

    if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).trimStart());
    }
  }

  if (dataLines.length === 0) {
    return null;
  }

  const payloadText = dataLines.join("\n");

  try {
    const payload: unknown = JSON.parse(payloadText);
    if (isChatStreamEvent(payload)) {
      return payload;
    }
  } catch {
    // ignore malformed JSON
  }

  return null;
}

/**
 * 从 fetch 响应体的 ReadableStream 中持续读取并解析 SSE 事件。
 * 每解析出一个完整事件即调用 onEvent；支持 AbortSignal 取消并关闭 reader。
 */
export async function consumeSseStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  onEvent: (event: ChatStreamEvent) => void | Promise<void>,
  options?: { signal?: AbortSignal },
): Promise<void> {
  const decoder = new TextDecoder();
  let remainder = "";

  while (true) {
    if (options?.signal?.aborted) {
      await reader.cancel();
      return;
    }

    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    remainder += decoder.decode(value, { stream: true });
    const parsed = parseSseChunk(remainder);
    remainder = parsed.remainder;

    for (const event of parsed.events) {
      if (options?.signal?.aborted) {
        await reader.cancel();
        return;
      }

      await onEvent(event);
    }
  }

  // 流结束时 flush decoder，并尝试解析缓冲区中剩余的不完整帧
  remainder += decoder.decode();
  if (remainder.trim()) {
    const parsed = parseSseChunk(`${remainder}\n\n`);
    for (const event of parsed.events) {
      await onEvent(event);
    }
  }
}
