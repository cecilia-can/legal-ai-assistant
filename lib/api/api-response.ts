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
  const payload: unknown = await response.json();

  if (!isApiResponse<T>(payload)) {
    throw new Error("响应格式无效。");
  }

  return payload;
}
