import { KnowledgeDocumentList } from "@/components/knowledge/KnowledgeDocumentList";
export default async function KnowledgeBasePage({ params }: { params: Promise<{ knowledgeBaseId: string }> }) {
  return <KnowledgeDocumentList knowledgeBaseId={(await params).knowledgeBaseId} />;
}
