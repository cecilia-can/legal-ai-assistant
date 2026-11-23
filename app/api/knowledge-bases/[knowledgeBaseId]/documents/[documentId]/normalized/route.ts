import { knowledgeApi, objectBody, type KnowledgeContext } from "@/lib/knowledge/api";
import { normalizedPreview } from "@/lib/knowledge/service";
import { editOcrPage } from "@/lib/knowledge/review";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export function GET(request: Request, context: KnowledgeContext) {
  return knowledgeApi(request, async (userId) => { const p = await context.params; return normalizedPreview(userId, p.knowledgeBaseId, p.documentId, new URL(request.url).searchParams); });
}
export function PATCH(request: Request, context: KnowledgeContext) {
  return knowledgeApi(request, async (userId) => { const p = await context.params; return editOcrPage(userId, p.knowledgeBaseId, p.documentId, await objectBody(request, 128 * 1024)); });
}
