import path from "node:path";

import type { NormalizedDocument } from "./types";

export type InferredDocumentCategory = "法规" | "案例" | "合同" | "通用";
export type CategoryClassificationSource = "explicit" | "inferred";

export interface DocumentCategoryClassification {
  category: InferredDocumentCategory | string;
  suggestedCategory?: Exclude<InferredDocumentCategory, "通用">;
  confidence: number;
  signals: string[];
  needsReview: boolean;
  source: CategoryClassificationSource;
}

type CandidateCategory = Exclude<InferredDocumentCategory, "通用">;

const CATEGORY_LABELS: Record<CandidateCategory, string> = {
  法规: "法规",
  案例: "案例",
  合同: "合同",
};

function countMatches(value: string, pattern: RegExp) {
  return value.match(pattern)?.length ?? 0;
}

function addSignal(scores: Map<CandidateCategory, number>, signals: string[], category: CandidateCategory, points: number, reason: string) {
  scores.set(category, (scores.get(category) ?? 0) + points);
  signals.push(`${CATEGORY_LABELS[category]}：${reason}（+${points}）`);
}

/**
 * Deterministic classification for batch imports. It is deliberately
 * conservative: ambiguous documents remain 通用 and request review.
 */
export function classifyDocumentCategory(input: {
  normalized: NormalizedDocument;
  filePath: string;
  explicitCategory?: string;
}): DocumentCategoryClassification {
  if (input.explicitCategory?.trim()) {
    return {
      category: input.explicitCategory.trim(),
      confidence: 1,
      signals: ["用户通过 --category 显式指定"],
      needsReview: false,
      source: "explicit",
    };
  }

  const filename = path.basename(input.filePath).toLowerCase();
  const directory = path.dirname(input.filePath).toLowerCase();
  const text = input.normalized.pages.map((page) => page.text).join("\n").slice(0, 16_000);
  const scores = new Map<CandidateCategory, number>([["法规", 0], ["案例", 0], ["合同", 0]]);
  const signals: string[] = [];

  if (/指导案例|人民法院案例库|典型案例|判决书|裁定书|案例/.test(filename) || /[\\/]case[\\/]/i.test(directory)) {
    addSignal(scores, signals, "案例", 4, "文件名或目录包含案例特征");
  }
  const caseHeadings = countMatches(text, /(?:基本案情|裁判要旨|裁判要点|裁判理由|裁判结果|关联索引|争议焦点)/g);
  if (caseHeadings) addSignal(scores, signals, "案例", Math.min(6, caseHeadings * 2), `命中 ${caseHeadings} 个案例栏目`);
  if (/人民法院案例库|指导案例/.test(text)) addSignal(scores, signals, "案例", 3, "正文包含案例库或指导案例标识");

  if (/法律|条例|办法|规定|司法解释|实施细则/.test(filename) || /[\\/]statute[\\/]/i.test(directory)) {
    addSignal(scores, signals, "法规", 3, "文件名或目录包含法规特征");
  }
  const articles = countMatches(text, /第[一二三四五六七八九十百千万零〇\d]+条/g);
  if (articles >= 2) addSignal(scores, signals, "法规", Math.min(6, articles), `命中 ${articles} 个条文编号`);
  const chapters = countMatches(text, /第[一二三四五六七八九十百千万零〇\d]+章/g);
  if (chapters) addSignal(scores, signals, "法规", Math.min(3, chapters), `命中 ${chapters} 个章节编号`);

  if (/合同|协议|模板/.test(filename) || /[\\/]contract[\\/]/i.test(directory)) {
    addSignal(scores, signals, "合同", 3, "文件名或目录包含合同特征");
  }
  const parties = Number(/甲方/.test(text)) + Number(/乙方/.test(text));
  if (parties >= 2) addSignal(scores, signals, "合同", 2, "正文同时包含甲方和乙方");
  const clauses = countMatches(text, /第[一二三四五六七八九十百千万零〇\d]+条/g);
  if (clauses >= 2) addSignal(scores, signals, "合同", Math.min(3, clauses), `命中 ${clauses} 个合同条款编号`);

  const ranked = [...scores.entries()].sort((left, right) => right[1] - left[1]);
  const [winner, runnerUp] = ranked;
  const winnerScore = winner?.[1] ?? 0;
  const margin = winnerScore - (runnerUp?.[1] ?? 0);
  const highConfidence = winnerScore >= 5 && (margin >= 2 || winnerScore >= 8);
  const confidence = Math.min(0.95, winnerScore === 0 ? 0 : 0.35 + winnerScore * 0.07 + Math.min(0.18, margin * 0.04));

  if (!winner || winnerScore === 0) {
    return { category: "通用", confidence: 0, signals: ["未命中足够的类别特征"], needsReview: true, source: "inferred" };
  }
  if (!highConfidence) {
    return {
      category: "通用",
      suggestedCategory: winner[0],
      confidence,
      signals,
      needsReview: true,
      source: "inferred",
    };
  }
  return { category: winner[0], confidence, signals, needsReview: false, source: "inferred" };
}
