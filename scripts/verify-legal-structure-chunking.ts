import assert from "node:assert/strict";

import { DOCUMENT_CATEGORY_STRATEGIES, assertChunkingEligibility, assertSupportedNormalizedDocument, checkChunkQuality, createChunkCandidates, identifyStructure, resolveNormalizedArtifactPath } from "../lib/documents/chunking";
import { NORMALIZED_DOCUMENT_SCHEMA_VERSION, type NormalizedDocument } from "../lib/documents/ingestion/types";

function doc(text: string, pageNumber = 1): NormalizedDocument { return { schemaVersion: NORMALIZED_DOCUMENT_SCHEMA_VERSION, sourceType: "txt", extractionMethod: "native", pages: [{ pageNumber, text, blocks: [{ kind: "paragraph", text, sourcePage: pageNumber }] }], metadata: {} }; }

const statute = identifyStructure(doc("第一章 总则\n第一条 为了规范行为。\n（一）具体事项。"), "法规");
assert.equal(statute.strategy, "statute");
assert.ok(statute.nodes.some((node) => node.locator.article?.startsWith("第一条")));
const caseDocument = identifyStructure(doc("事实\n双方存在合同关系。\n法院认为\n应当承担责任。"), "案例");
assert.ok(caseDocument.nodes.some((node) => node.locator.casePart === "facts"));
assert.ok(caseDocument.nodes.some((node) => node.locator.casePart === "court_reasoning"));
const contract = identifyStructure(doc("第一条 付款\n甲方应付款。"), "合同");
assert.ok(contract.nodes.some((node) => node.locator.clause === "第一条"));
assert.deepEqual(Object.keys(DOCUMENT_CATEGORY_STRATEGIES).sort(), ["case", "contract", "general", "statute"]);
const groupedContract = createChunkCandidates(contract.nodes, { artifactRoot: ".", strategyVersion: "test", maxChunkCharacters: 500 }, contract.strategy);
assert.equal(groupedContract.length, 1);
assert.match(groupedContract[0].text, /第一条 付款/);
assert.match(groupedContract[0].text, /甲方应付款/);
const general = identifyStructure(doc("普通标题：\n一般正文。"), null);
assert.equal(general.strategy, "general");
const longChunks = createChunkCandidates(identifyStructure(doc("第一条 " + "甲".repeat(31) + "。乙".repeat(31) + "。"), "法规").nodes, { artifactRoot: ".", strategyVersion: "test", maxChunkCharacters: 30 });
assert.ok(longChunks.every((chunk) => chunk.text.length <= 30));
const repeated = [1, 2, 3].flatMap((page) => createChunkCandidates(identifyStructure(doc("页眉\n正文。", page), null).nodes, { artifactRoot: ".", strategyVersion: "test", maxChunkCharacters: 100 }));
assert.ok(checkChunkQuality(repeated).some((entry) => entry.type === "repeated_header_footer"));
assert.throws(() => resolveNormalizedArtifactPath("../escape.json", { artifactRoot: "data/artifacts", strategyVersion: "test", maxChunkCharacters: 1 }));
assert.throws(() => assertSupportedNormalizedDocument({ schemaVersion: "old", pages: [] }));
assert.doesNotThrow(() => assertChunkingEligibility({ status: "succeeded", normalizedUri: "documents/a/normalized.json", normalizedContentHash: "hash", knowledgeBase: { scope: "user", ownerId: "user-a" } }, "user-a"));
assert.throws(() => assertChunkingEligibility({ status: "succeeded", normalizedUri: null, normalizedContentHash: "hash", knowledgeBase: { scope: "user", ownerId: "user-a" } }, "user-a"));
assert.throws(() => assertChunkingEligibility({ status: "succeeded", normalizedUri: "x", normalizedContentHash: "hash", knowledgeBase: { scope: "user", ownerId: "user-a" } }, "user-b"));
console.log("legal structure chunking verification passed");
