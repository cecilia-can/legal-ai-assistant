import { getRetrievalConfig } from "./config";
import type { RetrievalResult } from "./retrieval";
import type { ChatSource } from "@/types/chat";

export type RagContext = { content: string; sourceCount: number; sources: ChatSource[] };

function citationLocation(result: RetrievalResult) {
  const pages = result.pageFrom ? `第 ${result.pageFrom}${result.pageTo && result.pageTo !== result.pageFrom ? `-${result.pageTo}` : ""} 页` : "页码未知";
  return `${result.documentTitle}｜${result.sectionPath ?? "未标注章节"}｜${pages}`;
}

export function buildRagContext(results: RetrievalResult[]): RagContext | null {
  if (!results.length) return null;
  const config = getRetrievalConfig();
  const blocks: string[] = [];
  const sources: ChatSource[] = [];
  let usedCharacters = 0;
  for (const result of results) {
    const available = config.maxContextCharacters - usedCharacters;
    if (available <= 0) break;
    const number = sources.length + 1;
    const source = `[来源${number}] ${citationLocation(result)}`;
    const text = result.text.slice(0, Math.max(0, Math.min(config.maxChunkCharacters, available - source.length - 1)));
    if (!text.trim()) continue;
    const block = `${source}\n${text}`;
    blocks.push(block);
    sources.push({ number, chunkId: result.chunkId, knowledgeBaseId: result.knowledgeBaseId, documentId: result.documentId, documentTitle: result.documentTitle, sectionPath: result.sectionPath, pageFrom: result.pageFrom, pageTo: result.pageTo, text });
    usedCharacters += block.length;
  }
  if (!blocks.length) return null;
  return {
    sourceCount: blocks.length,
    sources,
    content: `以下为仅供本次回答参考的已授权知识库资料。只能在资料能够支持时作答；引用时使用 [来源N]；资料不足时明确说明无法从知识库确认，绝不编造来源。\n\n${blocks.join("\n\n")}`,
  };
}
