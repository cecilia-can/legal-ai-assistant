import { NextResponse } from "next/server";

export const API_SUCCESS_CODE = 0;
export const API_SUCCESS_MESSAGE = "success";

export type ApiResponse<T> = {
  code: number;
  message: string;
  data: T | null;
};

type JsonSuccessInit = {
  status?: number;
};

export function jsonSuccess<T>(data: T, init?: JsonSuccessInit) {
  const body: ApiResponse<T> = {
    code: API_SUCCESS_CODE,
    message: API_SUCCESS_MESSAGE,
    data,
  };

  return NextResponse.json(body, { status: init?.status ?? 200 });
}

export function jsonError(message: string, status: number) {
  const body: ApiResponse<null> = {
    code: status,
    message,
    data: null,
  };

  return NextResponse.json(body, { status });
}

export function isApiResponse<T = unknown>(
  value: unknown,
): value is ApiResponse<T> {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const record = value as Record<string, unknown>;

  return (
    typeof record.code === "number" &&
    typeof record.message === "string" &&
    "data" in record
  );
}

export function readApiMessage(payload: unknown, fallback: string): string {
  if (isApiResponse(payload) && payload.message.trim()) {
    return payload.message;
  }

  return fallback;
}

export async function parseApiResponse<T>(
  response: Response,
): Promise<ApiResponse<T>> {
  const contentType = response.headers.get("content-type") ?? "未知类型";

  if (!contentType.toLowerCase().includes("application/json")) {
    const status = response.status
      ? `HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ""}`
      : "未知状态";
    throw new Error(
      `接口返回了非 JSON 响应（${status}，${contentType}）。请重试；若持续出现，请检查服务端日志。`,
    );
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error(
      "接口返回的 JSON 无法解析。请重试；若持续出现，请检查服务端日志。",
    );
  }

  if (!isApiResponse<T>(payload)) {
    throw new Error(
      "接口返回的 JSON 格式不符合约定。请重试；若持续出现，请检查服务端日志。",
    );
  }

  return payload;
}