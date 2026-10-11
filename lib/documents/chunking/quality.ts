import type { ChunkCandidate, ChunkQualityIssue, SourceRange } from "./types";

function issue(type: ChunkQualityIssue["type"], severity: ChunkQualityIssue["severity"], message: string, source?: Partial<SourceRange>): ChunkQualityIssue { return { type, severity, message, source }; }
function looksGarbled(text: string) { const replacement = (text.match(/[�]/g) ?? []).length; const control = (text.match(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g) ?? []).length; return replacement + control > 0 || (text.length > 20 && /(?:[^\p{L}\p{N}\p{P}\p{Z}]){4,}/u.test(text)); }
export function checkChunkQuality(candidates: ChunkCandidate[]): ChunkQualityIssue[] {
  const issues: ChunkQualityIssue[] = []; const pageEdgeText = new Map<string, number[]>();
  for (const candidate of candidates) { if (!candidate.text.trim()) issues.push(issue("empty_content", "blocking", "切片内容为空。", candidate.source)); if (looksGarbled(candidate.text)) issues.push(issue("garbled_text", "blocking", "切片含有疑似乱码或控制字符。", candidate.source)); if (candidate.text.length > 20 && !/[。！？!?；;）)]\s*$/.test(candidate.text)) issues.push(issue("abnormal_truncation", "warning", "切片结尾未检测到常见句末边界，需人工复核。", candidate.source)); const page = candidate.source.pageFrom; if (page !== null && candidate.text.length <= 120) { const pages = pageEdgeText.get(candidate.text) ?? []; pages.push(page); pageEdgeText.set(candidate.text, pages); } }
  for (const [text, pages] of pageEdgeText) if (new Set(pages).size >= 3) issues.push(issue("repeated_header_footer", "warning", `文本“${text.slice(0, 40)}”在多个页面重复出现，疑似页眉或页脚。`, { pageFrom: Math.min(...pages), pageTo: Math.max(...pages) }));
  return issues;
}
export function hasBlockingQualityIssue(issues: ChunkQualityIssue[]) { return issues.some((entry) => entry.severity === "blocking"); }
