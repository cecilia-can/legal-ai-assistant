import { knowledgeApi, objectBody, type KnowledgeContext } from "@/lib/knowledge/api";
import { confirmOcrReview } from "@/lib/knowledge/review";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function POST(request: Request, context: KnowledgeContext) {
  return knowledgeApi(request, async (userId) => { const p = await context.params; return confirmOcrReview(userId, p.knowledgeBaseId, p.documentId, await objectBody(request)); });
}
