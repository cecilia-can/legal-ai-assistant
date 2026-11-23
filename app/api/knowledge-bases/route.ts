import { knowledgeApi, objectBody } from "@/lib/knowledge/api";
import { createKnowledgeBase, listKnowledgeBases } from "@/lib/knowledge/service";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export function GET(request: Request) { return knowledgeApi(request, listKnowledgeBases); }
export function POST(request: Request) { return knowledgeApi(request, async (userId) => createKnowledgeBase(userId, await objectBody(request)), 201); }
