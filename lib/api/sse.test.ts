import { describe, expect, it } from "vitest";
import { consumeSseStream, encodeSseEvent } from "@/lib/api/sse";

function readerFor(events: string[]): ReadableStreamDefaultReader<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const event of events) controller.enqueue(encoder.encode(event));
      controller.close();
    },
  }).getReader();
}

describe("consumeSseStream", () => {
  it("只有收到 done 时才标记为成功", async () => {
    const result = await consumeSseStream(
      readerFor([encodeSseEvent({ type: "token", text: "部分回复" })]),
      () => undefined,
    );

    expect(result).toEqual({ receivedDone: false, receivedCancelled: false });
  });

  it("识别取消终态", async () => {
    const result = await consumeSseStream(
      readerFor([encodeSseEvent({ type: "cancelled" })]),
      () => undefined,
    );

    expect(result).toEqual({ receivedDone: false, receivedCancelled: true });
  });

  it("只有 done 代表正常完成，error 不会被当作成功", async () => {
    const received: string[] = [];
    const result = await consumeSseStream(
      readerFor([
        encodeSseEvent({ type: "token", text: "部分回复" }),
        encodeSseEvent({
          type: "error",
          message: "上游超时",
          code: "UPSTREAM_TIMEOUT",
        }),
      ]),
      (event) => {
        received.push(event.type);
      },
    );

    expect(received).toEqual(["token", "error"]);
    expect(result).toEqual({ receivedDone: false, receivedCancelled: false });
  });

  it("done 代表正常完成", async () => {
    const result = await consumeSseStream(
      readerFor([encodeSseEvent({ type: "done" })]),
      () => undefined,
    );

    expect(result).toEqual({ receivedDone: true, receivedCancelled: false });
  });
});
