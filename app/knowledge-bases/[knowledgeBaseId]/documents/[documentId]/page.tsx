import { KnowledgeDocumentDetail } from "@/components/knowledge/KnowledgeDocumentDetail";
export default async function KnowledgeDocumentPage({ params }: { params: Promise<{ knowledgeBaseId: string; documentId: string }> }) {
  return <KnowledgeDocumentDetail {...await params} />;
}
