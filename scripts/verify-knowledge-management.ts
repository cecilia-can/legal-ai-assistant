import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { rm, stat } from "node:fs/promises";
import path from "node:path";
import { Prisma } from "../app/generated/prisma/client";
import { prisma } from "../lib/db";
import { KnowledgeError, indexModel } from "../lib/knowledge/contracts";
import { claimTask, processTask, withLease } from "../lib/knowledge/worker";
import { createKnowledgeBase, deleteDocument, documentDetail, documentSummary, enqueueDocumentTask, listDocuments, listKnowledgeBases, normalizedPreview, chunksPreview, requireDocument, requireKnowledgeBase, uploadDocument } from "../lib/knowledge/service";
import { controlledFile } from "../lib/knowledge/storage";

// All records and files created here belong to this random run. Never select or
// claim other users' jobs; no database reset and no model network calls.
const runId = randomUUID();
const root = path.resolve("data", "knowledge-verification", runId);
process.env.DOCUMENT_UPLOAD_ROOT = path.join(root, "originals");
process.env.DOCUMENT_ARTIFACT_ROOT = path.join(root, "artifacts");
const originalKey = process.env.EMBEDDING_API_KEY;
const users: string[] = [], knowledgeBases: string[] = [];
let checks = 0;
function passed(label: string) { checks++; console.log(`通过：${label}`); }
async function denied(operation: Promise<unknown>, status: number) {
  await assert.rejects(operation, (error: unknown) => error instanceof KnowledgeError && error.status === status);
}
async function work(documentId: string) {
  const task = await claimTask(documentId); assert.ok(task); await processTask(task);
  return prisma.documentProcessingTask.findUniqueOrThrow({ where: { id: task.id } });
}
async function main() {
  const legacy = await prisma.document.count({ where: { originalFileUri: null } });
  console.log(`历史文档可读取：${legacy} 份无受控原件的文档（只读统计）。`);
  for (const suffix of ["owner", "other"]) {
    const user = await prisma.user.create({ data: { email: `knowledge-${runId}-${suffix}@example.invalid`, name: "知识库验收临时用户" } }); users.push(user.id);
  }
  const [owner, other] = users;
  const kb = await createKnowledgeBase(owner, { name: "知识库隔离验收" }); knowledgeBases.push(kb.id);
  const otherKb = await createKnowledgeBase(other, { name: "另一个用户的资料" }); knowledgeBases.push(otherKb.id);
  const system = await prisma.knowledgeBase.create({ data: { name: `验收系统库 ${runId}`, scope: "system" } }); knowledgeBases.push(system.id);
  const legacyDoc = await prisma.document.create({ data: { knowledgeBaseId: system.id, originalFilename: "legacy.txt", sourceIdentifier: "legacy-fixture", sourceType: "txt", contentHash: runId, status: "succeeded" } });
  assert.equal((await documentDetail(owner, system.id, legacyDoc.id)).hasOriginal, false);
  await denied(requireKnowledgeBase(other, kb.id), 404);
  await denied(requireKnowledgeBase(owner, system.id, true), 403);
  await denied(createKnowledgeBase(owner, { name: "伪造", ownerId: other }), 400);
  const list = await listKnowledgeBases(owner);
  assert.ok(list.some((item) => item.id === system.id && !item.writable)); assert.ok(!list.some((item) => item.id === otherKb.id));
  passed("双用户隔离、系统库只读、禁止客户端伪造归属");

  const body = Buffer.from("第一章 测试资料\n\n第一条 本文档仅用于软件验收，测试规则的颜色为蓝色。\n\n第二条 本文档第二项测试规则的编号为七号，不构成真实法律依据。\n");
  const uploads = await Promise.all([uploadDocument(owner, kb.id, { name: "验收.txt", buffer: body }), uploadDocument(owner, kb.id, { name: "验收.txt", buffer: body })]);
  assert.equal(uploads.filter((item) => !item.duplicate).length, 1);
  const id = uploads[0].documentId; assert.equal(uploads[1].documentId, id);
  const version2 = await uploadDocument(owner, kb.id, { name: "验收.txt", buffer: Buffer.concat([body, Buffer.from("第三条 新版本测试资料。")]) });
  assert.equal((await documentSummary(version2.documentId)).documentVersion, "v2");
  await denied(requireDocument(owner, otherKb.id, id), 404);
  await denied(requireDocument(other, kb.id, id), 404);
  const same = await enqueueDocumentTask(owner, kb.id, id, "parse");
  assert.equal(same.id, (await prisma.documentProcessingTask.findFirstOrThrow({ where: { documentId: id } })).id);
  await denied(enqueueDocumentTask(owner, kb.id, id, "chunk"), 409);
  await denied(deleteDocument(owner, kb.id, id), 409);
  passed("并发上传去重、新版本识别、文档归属及活动任务互斥");

  assert.equal((await work(id)).status, "succeeded");
  const preview = await normalizedPreview(owner, kb.id, id, new URLSearchParams("pageSize=1"));
  assert.ok(preview.items[0].text.includes("蓝色"), "解析正文应包含测试词蓝色");
  const filtered = await listDocuments(owner, kb.id, new URLSearchParams("sourceType=txt&status=succeeded&documentVersion=v1&pageSize=1"));
  assert.equal(filtered.total, 1); assert.equal(filtered.items[0].id, id);
  await enqueueDocumentTask(owner, kb.id, id, "chunk");
  assert.equal((await work(id)).status, "succeeded");
  const chunks = await chunksPreview(owner, kb.id, id, new URLSearchParams("pageSize=1"));
  assert.ok(chunks.total >= 1, "结构切片应至少生成一段正文"); assert.equal(chunks.items.length, 1);
  passed("真实 TXT 解析、正文分页、组合过滤与结构切片");

  const doc = await prisma.document.findUniqueOrThrow({ where: { id } });
  const allChunks = await prisma.documentChunk.findMany({ where: { documentId: id, chunkSet: { status: "active" } }, orderBy: { ordinal: "asc" } });
  if (allChunks.length === 1) {
    const first = allChunks[0];
    allChunks.push(await prisma.documentChunk.create({ data: { documentId: id, chunkSetId: first.chunkSetId, ordinal: first.ordinal + 1,
      text: "额外索引覆盖测试切片。", contentHash: "synthetic-coverage-test", chunkStrategyVersion: first.chunkStrategyVersion } }));
  }
  allChunks.push(await prisma.documentChunk.create({ data: { documentId: id, chunkSetId: allChunks[0].chunkSetId, ordinal: allChunks.length + 1,
    text: "独立的部分失败恢复测试切片。", contentHash: "synthetic-recovery-test", chunkStrategyVersion: allChunks[0].chunkStrategyVersion } }));
  const model = indexModel();
  const vector = `[${Array.from({ length: model.dimensions }, (_, i) => i === 0 ? 1 : 0).join(",")}]`;
  for (let i = 0; i < Math.min(2, allChunks.length); i++) {
    const chunk = allChunks[i];
    await prisma.$executeRaw(Prisma.sql`INSERT INTO "Embedding" ("id", "chunkId", "model", "dimensions", "contentHash", "vector", "createdAt")
      VALUES (${randomUUID()}, ${chunk.id}, ${model.model}, ${model.dimensions}, ${chunk.contentHash}, ${i === 0 ? vector : null}::vector, CURRENT_TIMESTAMP)`);
  }
  const staleChunk = allChunks[1];
  await prisma.$executeRaw(Prisma.sql`INSERT INTO "Embedding" ("id", "chunkId", "model", "dimensions", "contentHash", "vector", "createdAt")
    VALUES (${randomUUID()}, ${staleChunk.id}, ${model.model + "-historical-fixture"}, ${model.dimensions}, ${staleChunk.contentHash}, ${vector}::vector, CURRENT_TIMESTAMP)`);
  await prisma.$executeRaw(Prisma.sql`INSERT INTO "Embedding" ("id", "chunkId", "model", "dimensions", "contentHash", "vector", "createdAt")
    VALUES (${randomUUID()}, ${staleChunk.id}, ${model.model}, ${model.dimensions}, ${"stale-content-fixture"}, ${vector}::vector, CURRENT_TIMESTAMP)`);
  const summary = await documentSummary(id); assert.equal(summary.indexedCount, 1);
  passed("索引覆盖只统计当前模型、内容哈希匹配且非空的向量（人工测试向量）");

  delete process.env.EMBEDDING_API_KEY;
  await enqueueDocumentTask(owner, kb.id, id, "embed");
  assert.equal((await work(id)).status, "failed");
  assert.equal((await documentSummary(id)).indexedCount, 1);
  process.env.EMBEDDING_API_KEY = originalKey ?? "";
  passed("缺失模型凭证明确失败且保留已有索引；未调用真实模型");

  // Exercise real batching, SQL writes and recovery against a local fake HTTP
  // provider. These results never represent real semantic embedding quality.
  const envKeys = ["EMBEDDING_API_KEY", "EMBEDDING_BASE_URL", "EMBEDDING_BATCH_SIZE", "EMBEDDING_MAX_RETRIES"];
  const savedEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
  let calls = 0, failAfterFirst = true;
  const fakeProvider = createServer(async (request, response) => {
    const body: Buffer[] = []; for await (const part of request) body.push(Buffer.from(part));
    const input = JSON.parse(Buffer.concat(body).toString("utf8"));
    calls++;
    response.setHeader("Content-Type", "application/json");
    if (failAfterFirst && calls > 1) { response.statusCode = 400; response.end(JSON.stringify({ error: { message: "synthetic batch failure" } })); }
    else response.end(JSON.stringify({ data: input.input.map((_: string, index: number) => ({ index, embedding: JSON.parse(vector) })) }));
  });
  await new Promise<void>((resolve) => fakeProvider.listen(0, "127.0.0.1", resolve));
  try {
    const address = fakeProvider.address(); assert.ok(address && typeof address === "object");
    process.env.EMBEDDING_API_KEY = "local-fixture-only";
    process.env.EMBEDDING_BASE_URL = `http://127.0.0.1:${address.port}/v1`;
    process.env.EMBEDDING_BATCH_SIZE = "1"; process.env.EMBEDDING_MAX_RETRIES = "1";
    await enqueueDocumentTask(owner, kb.id, id, "embed");
    assert.equal((await work(id)).status, "failed");
    const partial = await prisma.embeddingTask.findFirstOrThrow({ where: { documentId: id }, orderBy: { createdAt: "desc" } });
    assert.equal(partial.status, "partial"); assert.equal(partial.completedChunks, 1); assert.ok(partial.failedChunks >= 1);
    const previousCount = (await documentSummary(id)).indexedCount; assert.equal(previousCount, 2);
    failAfterFirst = false; const previousCalls = calls;
    await enqueueDocumentTask(owner, kb.id, id, "embed");
    assert.equal((await work(id)).status, "succeeded");
    const complete = await documentSummary(id); assert.equal(complete.indexedCount, complete.chunkCount);
    assert.equal(calls - previousCalls, complete.chunkCount - previousCount);
    passed("本地模型替身验证批次部分失败、保留成功向量及仅补齐缺失项");
  } finally {
    await new Promise<void>((resolve) => fakeProvider.close(() => resolve()));
    for (const key of envKeys) { if (savedEnv[key] === undefined) delete process.env[key]; else process.env[key] = savedEnv[key]; }
  }

  await enqueueDocumentTask(owner, kb.id, id, "parse");
  await prisma.document.update({ where: { id }, data: { originalFileUri: "unavailable-fixture.txt" } });
  assert.equal((await work(id)).status, "failed");
  const preserved = await prisma.document.findUniqueOrThrow({ where: { id } });
  assert.equal(preserved.normalizedUri, doc.normalizedUri); assert.equal(preserved.status, "succeeded");
  assert.equal((await documentSummary(id)).indexedCount, allChunks.length);
  const repaired = await uploadDocument(owner, kb.id, { name: "验收.txt", buffer: body });
  assert.equal(repaired.duplicate, true);
  const restored = await prisma.document.findUniqueOrThrow({ where: { id } });
  assert.ok(restored.originalFileUri);
  await controlledFile(process.env.DOCUMENT_UPLOAD_ROOT!, restored.originalFileUri);
  passed("重解析失败保留可用正文、切片和向量");

  await enqueueDocumentTask(owner, kb.id, id, "chunk");
  const stale = await claimTask(id); assert.ok(stale);
  await prisma.documentProcessingTask.update({ where: { id: stale.id }, data: { leaseExpiresAt: new Date(Date.now() - 1000) } });
  await denied(withLease(stale, async (db) => { await db.document.update({ where: { id }, data: { title: "不应发布" } }); }), 409);
  const recovered = await claimTask(id); assert.ok(recovered); assert.notEqual(recovered.leaseToken, stale.leaseToken);
  await processTask(recovered);
  assert.equal((await documentDetail(owner, kb.id, id)).tasks[0].status, "succeeded");
  assert.notEqual((await documentSummary(id)).title, "不应发布");
  passed("过期租约拒绝提交、任务恢复及重复切片复用");

  const originalFile = await controlledFile(process.env.DOCUMENT_UPLOAD_ROOT!, doc.originalFileUri!);
  await deleteDocument(owner, kb.id, id);
  assert.equal(await prisma.document.count({ where: { id } }), 0);
  assert.equal(await prisma.documentChunk.count({ where: { documentId: id } }), 0);
  assert.equal(await prisma.documentProcessingTask.count({ where: { documentId: id } }), 0);
  assert.ok((await stat(originalFile)).isFile());
  assert.equal(await prisma.document.count({ where: { id: version2.documentId } }), 1);
  const version3 = await uploadDocument(owner, kb.id, { name: "验收.txt", buffer: Buffer.concat([body, Buffer.from("第三版本补充资料。")]) });
  assert.equal((await documentSummary(version3.documentId)).documentVersion, "v3");
  passed("删除清除关联数据、保留文件且不影响其他文档");
  console.log(`知识库管理数据库验收通过：${checks} 组；真实 Embedding 服务未验证。`);
}
main().catch((error) => { console.error(error instanceof KnowledgeError ? error.message : error instanceof Error ? error.name + ": " + error.message.replace(/postgres(?:ql)?:\/\/\S+/g, "[redacted]") : "验收失败"); process.exitCode = 1; }).finally(async () => {
  try {
    await prisma.knowledgeBase.deleteMany({ where: { id: { in: knowledgeBases } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    // Only this run's generated fixture directory is removed.
    const expectedParent = path.resolve("data", "knowledge-verification");
    if (path.dirname(root) === expectedParent && path.basename(root) === runId) await rm(root, { recursive: true, force: true });
  } finally { await prisma.$disconnect(); }
});
