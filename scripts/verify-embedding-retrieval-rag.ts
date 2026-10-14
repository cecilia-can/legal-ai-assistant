import assert from "node:assert/strict";

import { buildRagContext } from "../lib/rag/context";
import { toVectorLiteral } from "../lib/rag/vector";
import type { RetrievalResult } from "../lib/rag/retrieval";

function result(overrides: Partial<RetrievalResult> = {}): RetrievalResult {
  return {
    chunkId: "chunk-1",
    documentId: "document-1",
    knowledgeBaseId: "knowledge-base-1",
    documentTitle: "民法典示例",
    category: "法规",
    text: "第一条示例内容。",
    sectionPath: "第一编 / 第一章 / 第一条",
    locator: { article: "第一条" },
    pageFrom: 1,
    pageTo: 1,
    similarity: 0.9,
    ...overrides,
  };
}

function main() {
  assert.equal(toVectorLiteral([0.1, -0.2]), "[0.1,-0.2]");
  assert.throws(() => toVectorLiteral([]), /无效向量/);
  assert.throws(() => toVectorLiteral([Number.NaN]), /无效向量/);

  assert.equal(buildRagContext([]), null, "无命中不应构造或伪造来源");
  const context = buildRagContext([result(), result({ chunkId: "chunk-2", pageFrom: 3, pageTo: 4, text: "第二段资料。" })]);
  assert.ok(context);
  assert.equal(context.sourceCount, 2);
  assert.match(context.content, /\[来源1\].*第 1 页/s);
  assert.match(context.content, /\[来源2\].*第 3-4 页/s);
  assert.match(context.content, /资料不足时明确说明/);
  console.log("embedding retrieval RAG verification passed");
}

main();
