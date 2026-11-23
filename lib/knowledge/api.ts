import { jsonError, jsonSuccess } from "@/lib/api/api-response";
import { requireApiSession } from "@/lib/auth/require-api-session";
import { KnowledgeError } from "./contracts";
import { uploadLimit } from "./storage";

export async function knowledgeApi(request: Request, operation: (userId: string) => Promise<unknown>, status = 200) {
  const session = await requireApiSession();
  if (session.error) return session.error;
  try {
    if (!["GET", "HEAD"].includes(request.method)) {
      const origin = request.headers.get("origin");
      if (origin && origin !== new URL(request.url).origin) throw new KnowledgeError("请求来源不匹配。", 403);
    }
    const response = jsonSuccess(await operation(session.userId), { status });
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  } catch (error) {
    if (error instanceof KnowledgeError) return jsonError(error.message, error.status);
    console.error(JSON.stringify({ event: "knowledge_api_failed", errorType: error instanceof Error ? error.name : "unknown" }));
    return jsonError("知识库操作失败，请检查服务状态与数据库迁移后重试。", 500);
  }
}
export async function objectBody(request: Request, limit = 4096) {
  const text = await limitedBody(request, limit);
  let body: unknown;
  try { body = JSON.parse(text.toString("utf8")); } catch { throw new KnowledgeError("请求体须为有效 JSON。"); }
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new KnowledgeError("请求体须为 JSON 对象。");
  return body as Record<string, unknown>;
}
export async function limitedBody(request: Request, limit: number) {
  const length = request.headers.get("content-length");
  if (length && Number(length) > limit) throw new KnowledgeError("请求内容超过大小限制。", 413);
  if (!request.body) throw new KnowledgeError("请求内容为空。");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) { await reader.cancel(); throw new KnowledgeError("请求内容超过大小限制。", 413); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  return Buffer.concat(chunks, size);
}
export async function uploadedFile(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("multipart/form-data")) throw new KnowledgeError("请使用文件上传表单。");
  const body = await limitedBody(request, uploadLimit() + 64 * 1024);
  let form: FormData;
  try { form = await new Response(body, { headers: { "Content-Type": contentType } }).formData(); }
  catch { throw new KnowledgeError("上传表单无法解析。"); }
  const files = form.getAll("file");
  if (Array.from(form.keys()).some((key) => key !== "file") || files.length !== 1 || typeof files[0] === "string") throw new KnowledgeError("每次只能上传一个 file 文件。");
  return { name: files[0].name, buffer: Buffer.from(await files[0].arrayBuffer()) };
}
export type KnowledgeParams = { knowledgeBaseId: string; documentId: string };
export type KnowledgeContext = { params: Promise<KnowledgeParams> };
