import { readFile, stat } from "node:fs/promises";
import { jsonError } from "@/lib/api/api-response";
import { requireApiSession } from "@/lib/auth/require-api-session";
import { KnowledgeError } from "@/lib/knowledge/contracts";
import { requireDocument } from "@/lib/knowledge/service";
import { controlledFile, uploadRoot } from "@/lib/knowledge/storage";
import type { KnowledgeContext } from "@/lib/knowledge/api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_request: Request, context: KnowledgeContext) {
  const session = await requireApiSession();
  if (session.error) return session.error;
  try {
    const { knowledgeBaseId, documentId } = await context.params;
    const doc = await requireDocument(session.userId, knowledgeBaseId, documentId);
    if (doc.sourceType !== "pdf" || !doc.originalFileUri) throw new KnowledgeError("该文档没有可预览的 PDF 原件。", 422);
    const file = await controlledFile(uploadRoot(), doc.originalFileUri);
    if ((await stat(file)).size > 30 * 1024 * 1024) throw new KnowledgeError("PDF 原件过大，无法在线预览。", 413);
    return new Response(await readFile(file), { headers: {
      "Content-Type": "application/pdf", "Content-Disposition": "inline; filename=original.pdf",
      "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
    } });
  } catch (error) {
    if (error instanceof KnowledgeError) return jsonError(error.message, error.status);
    return jsonError("PDF 原件读取失败。", 500);
  }
}
