import { NextResponse } from "next/server";

type JsonSuccessInit = {
  status?: number;
};

export function jsonSuccess<T>(data: T, init?: JsonSuccessInit) {
  return NextResponse.json(data, { status: init?.status ?? 200 });
}

export function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}
