import { knowledgeApi, objectBody, type KnowledgeContext } from "@/lib/knowledge/api";
import { KnowledgeError, parseAction } from "@/lib/knowledge/contracts";
import { documentDetail, enqueueDocumentTask } from "@/lib/knowledge/service";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export function GET(request: Request, context: KnowledgeContext) {
  return knowledgeApi(request, async (userId) => { const p = await context.params; return (await documentDetail(userId, p.knowledgeBaseId, p.documentId)).tasks; });
}
export function POST(request: Request, context: KnowledgeContext) {
  return knowledgeApi(request, async (userId) => {
    const p = await context.params;
    const body = await objectBody(request);
    if (Object.keys(body).some((key) => key !== "action")) throw new KnowledgeError("处理任务只接受 action 参数。");
    return enqueueDocumentTask(userId, p.knowledgeBaseId, p.documentId, parseAction(body.action));
  }, 202);
}
