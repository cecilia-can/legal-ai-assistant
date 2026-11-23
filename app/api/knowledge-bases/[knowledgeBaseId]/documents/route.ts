import { knowledgeApi, uploadedFile } from "@/lib/knowledge/api";
import { listDocuments, requireKnowledgeBase, uploadDocument } from "@/lib/knowledge/service";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
type Context = { params: Promise<{ knowledgeBaseId: string }> };
export function GET(request: Request, context: Context) {
  return knowledgeApi(request, async (userId) => listDocuments(userId, (await context.params).knowledgeBaseId, new URL(request.url).searchParams));
}
export function POST(request: Request, context: Context) {
  return knowledgeApi(request, async (userId) => {
    const { knowledgeBaseId } = await context.params;
    await requireKnowledgeBase(userId, knowledgeBaseId, true);
    return uploadDocument(userId, knowledgeBaseId, await uploadedFile(request));
  }, 202);
}
