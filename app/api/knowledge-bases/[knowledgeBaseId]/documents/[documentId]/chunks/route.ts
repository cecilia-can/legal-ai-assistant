import { knowledgeApi, type KnowledgeContext } from "@/lib/knowledge/api";
import { chunksPreview } from "@/lib/knowledge/service";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export function GET(request: Request, context: KnowledgeContext) {
  return knowledgeApi(request, async (userId) => { const p = await context.params; return chunksPreview(userId, p.knowledgeBaseId, p.documentId, new URL(request.url).searchParams); });
}
