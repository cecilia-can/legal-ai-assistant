import { sha256Text } from "../ingestion/storage";
import type { NormalizedDocument } from "../ingestion/types";
import type { ChunkCandidate, ChunkingConfig, ChunkingStrategyName, DocumentCategoryStrategy, LegalDocumentKind, SourceRange, StructureLocator, StructureNode } from "./types";

/** Built-in, category-level strategies.  They describe common legal document
 * structures, rather than a particular supplier's Word template. */
export const DOCUMENT_CATEGORY_STRATEGIES: Record<ChunkingStrategyName, DocumentCategoryStrategy> = {
  statute: {
    name: "statute",
    categoryPatterns: [/法规|法律|条例|办法|司法解释/],
    contentPatterns: [/第[一二三四五六七八九十百千万零〇\d]+条/],
    chunkBoundaryKinds: ["article"],
  },
  case: {
    name: "case",
    categoryPatterns: [/案例|判决|裁定/],
    contentPatterns: [/基本案情|争议焦点|法院认为|本院认为|裁判理由|判决如下|裁判结果/],
    // Unknown but layout-recognized headings still form safe case boundaries.
    chunkBoundaryKinds: ["case_part", "heading"],
  },
  contract: {
    name: "contract",
    categoryPatterns: [/合同|协议/],
    contentPatterns: [/第[一二三四五六七八九十百千万零〇\d]+条|甲方|乙方/],
    chunkBoundaryKinds: ["clause", "heading"],
  },
  general: {
    name: "general",
    categoryPatterns: [],
    contentPatterns: [],
    chunkBoundaryKinds: ["heading"],
  },
};

const statuteMarkers: Array<[keyof Pick<StructureLocator, "chapter" | "section" | "article" | "paragraph" | "item">, RegExp]> = [
  ["chapter", /^第[一二三四五六七八九十百千万零〇\d]+章\s*(.*)$/], ["section", /^第[一二三四五六七八九十百千万零〇\d]+节\s*(.*)$/], ["article", /^第[一二三四五六七八九十百千万零〇\d]+条\s*(.*)$/], ["paragraph", /^第?[一二三四五六七八九十百千万零〇\d]+款\s*(.*)$/], ["item", /^[（(][一二三四五六七八九十百千万零〇\d]+[）)]\s*(.*)$/],
];
const caseParts: Array<[NonNullable<StructureLocator["casePart"]>, RegExp]> = [["keywords", /^关键词/], ["holding", /^(裁判要旨|裁判要点)/], ["facts", /^(事实|基本案情|经审理查明|原告诉称|被告辩称)/], ["issues", /^(争议焦点|争议问题|本案争点)/], ["court_reasoning", /^(法院认为|本院认为|裁判理由)/], ["judgment", /^(判决如下|裁定如下|判决结果|裁判结果)/], ["index", /^(关联索引|相关法条)/]];
const contractClause = /^(第[一二三四五六七八九十百千万零〇\d]+条|\d+(?:\.\d+)*[、.]?)\s*(.*)$/;
const heading = /^(第[一二三四五六七八九十\d]+[章节]|[一二三四五六七八九十]+[、.].{0,60}|.+[:：])$/;

function sourceRange(pageNumber: number | null, pageEnd: number | null, blockIndex: number, charFrom: number, charTo: number): SourceRange { return { pageFrom: pageNumber, pageTo: pageEnd ?? pageNumber, blockFrom: blockIndex, blockTo: blockIndex, charFrom, charTo }; }

export function classifyLegalDocument(category: string | null, text: string): LegalDocumentKind {
  const declaredCategory = (category ?? "").toLowerCase();
  if (/^通用$|^general$/.test(declaredCategory)) return "general";
  for (const strategy of Object.values(DOCUMENT_CATEGORY_STRATEGIES)) {
    if (strategy.categoryPatterns.some((pattern) => pattern.test(declaredCategory))) return strategy.name;
  }
  const source = text.slice(0, 2_000).toLowerCase();
  for (const name of ["statute", "case", "contract"] as const) {
    if (DOCUMENT_CATEGORY_STRATEGIES[name].contentPatterns.some((pattern) => pattern.test(source))) return name;
  }
  return "general";
}

function splitLines(text: string) {
  const lines: Array<{ text: string; from: number; to: number }> = []; let offset = 0;
  for (const rawLine of text.split(/\r?\n/)) { const trimmed = rawLine.trim(); const leading = rawLine.indexOf(trimmed); if (trimmed) lines.push({ text: trimmed, from: offset + Math.max(leading, 0), to: offset + Math.max(leading, 0) + trimmed.length }); offset += rawLine.length + 1; }
  return lines.length ? lines : text.trim() ? [{ text: text.trim(), from: 0, to: text.trim().length }] : [];
}

function updateLocator(kind: LegalDocumentKind, text: string, locator: StructureLocator, sourceBlockKind?: string): { kind: StructureNode["kind"]; locator: StructureLocator } {
  const next = { ...locator, headingPath: [...locator.headingPath] };
  if (kind === "statute") for (const [field, pattern] of statuteMarkers) if (pattern.test(text)) { next[field] = text; const level = statuteMarkers.findIndex(([candidate]) => candidate === field); next.headingPath = [...next.headingPath.slice(0, level), text]; return { kind: field, locator: next }; }
  if (kind === "case") { const match = caseParts.find(([, pattern]) => pattern.test(text)); if (match) { next.casePart = match[0]; next.headingPath = [text]; return { kind: "case_part", locator: next }; } }
  if (kind === "contract") {
    const match = text.match(contractClause);
    if (match) { next.clause = match[1]; next.headingPath = [text]; return { kind: "clause", locator: next }; }
    // Word headings may have automatic numbering that is absent from extracted
    // paragraph text. Preserve those headings as contract boundaries instead
    // of silently attaching their content to the preceding clause.
    if (sourceBlockKind === "heading" || (/合同|协议/.test(text) && text.length <= 80)) {
      next.clause = undefined;
      next.headingPath = [text];
      return { kind: "heading", locator: next };
    }
  }
  if (heading.test(text)) { next.headingPath = [text]; return { kind: "heading", locator: next }; }
  return { kind: "body", locator: next };
}

export function identifyStructure(normalized: NormalizedDocument, category: string | null): { strategy: ChunkingStrategyName; nodes: StructureNode[] } {
  const strategy = classifyLegalDocument(category, normalized.pages.map((page) => page.text).join("\n")); const nodes: StructureNode[] = []; let currentLocator: StructureLocator = { pageFrom: null, pageTo: null, blockFrom: null, blockTo: null, charFrom: 0, charTo: 0, headingPath: [] }; let nodeIndex = 0;
  normalized.pages.forEach((page) => { const blocks = page.blocks.length ? page.blocks : [{ kind: "text" as const, text: page.text, sourcePage: page.pageNumber }]; blocks.forEach((block, blockIndex) => splitLines(block.text).forEach((line) => { const source = sourceRange(block.sourcePage ?? page.pageNumber, block.sourcePageEnd ?? block.sourcePage ?? page.pageNumber, blockIndex, line.from, line.to); const classified = updateLocator(strategy, line.text, { ...currentLocator, ...source }, block.kind); currentLocator = { ...classified.locator, ...source }; nodes.push({ id: `n${nodeIndex++}`, kind: classified.kind, text: line.text, source, locator: { ...currentLocator }, blocks: [block] }); })); });
  return { strategy, nodes };
}

function splitLongText(text: string, maxLength: number) {
  if (text.length <= maxLength) return [text]; const sentences = text.match(/[^。！？!?；;]+[。！？!?；;]?/g) ?? [text]; const parts: string[] = []; let current = "";
  for (const sentence of sentences) { if (current && current.length + sentence.length > maxLength) { parts.push(current); current = ""; } if (sentence.length > maxLength) { for (let start = 0; start < sentence.length; start += maxLength) parts.push(sentence.slice(start, start + maxLength)); } else current += sentence; }
  if (current) parts.push(current); return parts;
}

function mergeSourceRange(first: SourceRange, last: SourceRange): SourceRange {
  return { pageFrom: first.pageFrom, pageTo: last.pageTo, blockFrom: first.blockFrom, blockTo: last.blockTo, charFrom: first.charFrom, charTo: last.charTo };
}

function resolveStrategyForNodes(nodes: StructureNode[], strategy?: ChunkingStrategyName): DocumentCategoryStrategy {
  if (strategy) return DOCUMENT_CATEGORY_STRATEGIES[strategy];
  if (nodes.some((node) => node.kind === "clause")) return DOCUMENT_CATEGORY_STRATEGIES.contract;
  if (nodes.some((node) => node.kind === "article")) return DOCUMENT_CATEGORY_STRATEGIES.statute;
  if (nodes.some((node) => node.kind === "case_part")) return DOCUMENT_CATEGORY_STRATEGIES.case;
  return DOCUMENT_CATEGORY_STRATEGIES.general;
}

/** Groups a structural unit before applying the length fallback. */
export function createChunkCandidates(nodes: StructureNode[], config: ChunkingConfig, strategy?: ChunkingStrategyName): ChunkCandidate[] {
  const definition = resolveStrategyForNodes(nodes, strategy);
  const groups: StructureNode[][] = [];
  for (const node of nodes) {
    const beginsUnit = definition.chunkBoundaryKinds.includes(node.kind);
    if (beginsUnit || !groups.length) groups.push([node]);
    else groups.at(-1)!.push(node);
  }

  const candidates: ChunkCandidate[] = [];
  for (const group of groups) {
    const first = group[0]; const last = group.at(-1)!;
    const source = mergeSourceRange(first.source, last.source);
    const unitText = group.map((node) => node.text).join("\n");
    const parts = splitLongText(unitText, config.maxChunkCharacters);
    parts.forEach((text, index) => {
      const locator: StructureLocator = {
        ...first.locator, ...source,
        parentNodeId: parts.length > 1 ? first.id : undefined,
        fragmentIndex: parts.length > 1 ? index + 1 : undefined,
        fragmentCount: parts.length > 1 ? parts.length : undefined,
      };
      candidates.push({ text, sectionPath: locator.headingPath.join(" > "), locator, source });
    });
  }
  return candidates;
}

export function toPersistableChunks(candidates: ChunkCandidate[]) { return candidates.map((candidate, ordinal) => ({ ordinal, text: candidate.text, sectionPath: candidate.sectionPath, locator: candidate.locator, pageFrom: candidate.source.pageFrom, pageTo: candidate.source.pageTo, contentHash: sha256Text(candidate.text) })); }
