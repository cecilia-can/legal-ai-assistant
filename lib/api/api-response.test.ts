import { describe, expect, it } from "vitest";

import {
  API_SUCCESS_CODE,
  parseApiResponse,
} from "@/lib/api/api-response";

describe("parseApiResponse", () => {
  it("解析符合约定的 JSON 响应", async () => {
    const response = new Response(
      JSON.stringify({
        code: API_SUCCESS_CODE,
        message: "success",
        data: { id: "message-1" },
      }),
      { headers: { "content-type": "application/json; charset=utf-8" } },
    );

    await expect(parseApiResponse<{ id: string }>(response)).resolves.toMatchObject({
      code: API_SUCCESS_CODE,
      data: { id: "message-1" },
    });
  });

  it("非 JSON 响应显示状态与内容类型，而不是 JSON 解析异常", async () => {
    const response = new Response("<!doctype html><html></html>", {
      status: 404,
      statusText: "Not Found",
      headers: { "content-type": "text/html; charset=utf-8" },
    });

    await expect(parseApiResponse(response)).rejects.toThrow(
      "接口返回了非 JSON 响应（HTTP 404 Not Found，text/html; charset=utf-8）",
    );
  });

  it("无效 JSON 会给出友好错误", async () => {
    const response = new Response("{invalid json", {
      headers: { "content-type": "application/json" },
    });

    await expect(parseApiResponse(response)).rejects.toThrow(
      "接口返回的 JSON 无法解析",
    );
  });
});
