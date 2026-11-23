import { knowledgeApi, type KnowledgeContext } from "@/lib/knowledge/api";
import { deleteDocument, documentDetail } from "@/lib/knowledge/service";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export function GET(request: Request, context: KnowledgeContext) {
  return knowledgeApi(request, async (userId) => { const p = await context.params; return documentDetail(userId, p.knowledgeBaseId, p.documentId); });
}
export function DELETE(request: Request, context: KnowledgeContext) {
  return knowledgeApi(request, async (userId) => { const p = await context.params; return deleteDocument(userId, p.knowledgeBaseId, p.documentId); });
}
