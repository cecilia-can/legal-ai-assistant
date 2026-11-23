import type { ChatSource } from "@/types/chat";

/** Only server-produced, bounded source snapshots are exposed with chat messages. */
export function parseChatSources(value: unknown): ChatSource[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<number>();
  const sources: ChatSource[] = [];
  for (const item of value.slice(0, 20)) {
    if (!item || typeof item !== "object") continue;
    const source = item as Record<string, unknown>;
    if (!Number.isInteger(source.number) || (source.number as number) < 1 || (source.number as number) > 20 || seen.has(source.number as number)) continue;
    if (typeof source.chunkId !== "string" || typeof source.knowledgeBaseId !== "string" || typeof source.documentId !== "string" || typeof source.documentTitle !== "string" || typeof source.text !== "string") continue;
    if (source.text.length > 12_000 || source.documentTitle.length > 500) continue;
    const optionalText = (field: unknown) => field === null || typeof field === "string";
    const optionalPage = (field: unknown) => field === null || (Number.isInteger(field) && (field as number) > 0);
    if (!optionalText(source.sectionPath) || !optionalPage(source.pageFrom) || !optionalPage(source.pageTo)) continue;
    seen.add(source.number as number);
    sources.push(source as ChatSource);
  }
  return sources;
}
