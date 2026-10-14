import { getRetrievalConfig } from "./config";
import type { RetrievalResult } from "./retrieval";

export type RagContext = { content: string; sourceCount: number };

function citationLocation(result: RetrievalResult) {
  const pages = result.pageFrom ? `第 ${result.pageFrom}${result.pageTo && result.pageTo !== result.pageFrom ? `-${result.pageTo}` : ""} 页` : "页码未知";
  return `${result.documentTitle}｜${result.sectionPath ?? "未标注章节"}｜${pages}`;
}

export function buildRagContext(results: RetrievalResult[]): RagContext | null {
  if (!results.length) return null;
  const config = getRetrievalConfig();
  const blocks: string[] = [];
  let usedCharacters = 0;
  for (const [index, result] of results.entries()) {
    const available = config.maxContextCharacters - usedCharacters;
    if (available <= 0) break;
    const text = result.text.slice(0, Math.min(config.maxChunkCharacters, available));
    if (!text.trim()) continue;
    const source = `[来源${index + 1}] ${citationLocation(result)}`;
    const block = `${source}\n${text}`;
    blocks.push(block);
    usedCharacters += block.length;
  }
  if (!blocks.length) return null;
  return {
    sourceCount: blocks.length,
    content: `以下为仅供本次回答参考的已授权知识库资料。只能在资料能够支持时作答；引用时使用 [来源N]；资料不足时明确说明无法从知识库确认，绝不编造来源。\n\n${blocks.join("\n\n")}`,
  };
}
