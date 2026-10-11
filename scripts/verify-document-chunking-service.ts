import assert from "node:assert/strict";

import { createChunkingService } from "../lib/documents/chunking/service-core";
import { checkChunkQuality } from "../lib/documents/chunking/quality";
import type {
  ChunkCandidate,
  LoadedChunkingDocument,
  SourceRange,
  StructureLocator,
} from "../lib/documents/chunking/types";
import {
  NORMALIZED_DOCUMENT_SCHEMA_VERSION,
  type NormalizedDocument,
} from "../lib/documents/ingestion/types";

type StoredChunkSet = {
  id: string;
  documentId: string;
  normalizedContentHash: string;
  strategyVersion: string;
  status: string;
  qualityIssues: unknown;
  activatedAt: Date | null;
};

type StoredChunk = { chunkSetId: string; ordinal: number; text: string };

function source(pageFrom = 1): SourceRange {
  return { pageFrom, pageTo: pageFrom, blockFrom: 0, blockTo: 0, charFrom: 0, charTo: 0 };
}

function locator(pageFrom = 1): StructureLocator {
  return { ...source(pageFrom), headingPath: [] };
}

function normalized(text: string): NormalizedDocument {
  return {
    schemaVersion: NORMALIZED_DOCUMENT_SCHEMA_VERSION,
    sourceType: "txt",
    extractionMethod: "native",
    metadata: {},
    pages: [{ pageNumber: 1, text, blocks: [{ kind: "paragraph", text, sourcePage: 1 }] }],
  };
}

function loaded(strategyVersion: string, text = "第一条 付款义务。甲方应按期付款。") : LoadedChunkingDocument {
  return {
    document: {
      id: "document-1",
      category: "合同",
      normalizedContentHash: "normalized-hash-1",
      normalizedUri: "documents/document-1/normalized.json",
    },
    normalized: normalized(text),
    config: { artifactRoot: ".", strategyVersion, maxChunkCharacters: 500 },
  };
}

function createMemoryDatabase() {
  let chunkSets: StoredChunkSet[] = [];
  let chunks: StoredChunk[] = [];
  let nextId = 1;
  let failChunkWrite = false;

  const transaction = () => ({
    documentChunkSet: {
      findUnique: async ({ where }: { where: { documentId_normalizedContentHash_strategyVersion: Pick<StoredChunkSet, "documentId" | "normalizedContentHash" | "strategyVersion"> } }) => {
        const key = where.documentId_normalizedContentHash_strategyVersion;
        const found = chunkSets.find((set) => set.documentId === key.documentId && set.normalizedContentHash === key.normalizedContentHash && set.strategyVersion === key.strategyVersion);
        return found ? { id: found.id, status: found.status } : null;
      },
      create: async ({ data }: { data: Omit<StoredChunkSet, "id" | "status" | "activatedAt"> }) => {
        const set: StoredChunkSet = { id: `set-${nextId++}`, status: "pending", activatedAt: null, ...data };
        chunkSets.push(set);
        return set;
      },
      update: async ({ where, data }: { where: { id: string }; data: Partial<StoredChunkSet> }) => {
        const set = chunkSets.find((entry) => entry.id === where.id);
        if (!set) throw new Error("chunk set missing");
        Object.assign(set, data);
        return set;
      },
      updateMany: async ({ where, data }: { where: { documentId: string; status: string; id: { not: string } }; data: Partial<StoredChunkSet> }) => {
        const matching = chunkSets.filter((set) => set.documentId === where.documentId && set.status === where.status && set.id !== where.id.not);
        matching.forEach((set) => Object.assign(set, data));
        return { count: matching.length };
      },
    },
    documentChunk: {
      deleteMany: async ({ where }: { where: { chunkSetId: string } }) => {
        chunks = chunks.filter((chunk) => chunk.chunkSetId !== where.chunkSetId);
        return { count: 0 };
      },
      createMany: async ({ data }: { data: StoredChunk[] }) => {
        if (failChunkWrite) throw new Error("simulated chunk write failure");
        chunks.push(...data);
        return { count: data.length };
      },
    },
  });

  return {
    setFailChunkWrite(value: boolean) { failChunkWrite = value; },
    snapshot: () => ({ chunkSets: structuredClone(chunkSets), chunks: structuredClone(chunks) }),
    runInTransaction: async <T>(operation: (tx: ReturnType<typeof transaction>) => Promise<T>) => {
      const before = structuredClone({ chunkSets, chunks, nextId });
      try {
        return await operation(transaction());
      } catch (error) {
        chunkSets = before.chunkSets;
        chunks = before.chunks;
        nextId = before.nextId;
        throw error;
      }
    },
  };
}

function makeService(database: ReturnType<typeof createMemoryDatabase>, document: LoadedChunkingDocument) {
  return createChunkingService({
    loadDocument: async () => document,
    sha256: (value) => value,
    runInTransaction: (operation) => database.runInTransaction(operation as never),
  });
}

async function main() {
  const database = createMemoryDatabase();
  const firstRun = makeService(database, loaded("service-test-v1"));
  const first = await firstRun({ documentId: "document-1", userId: "user-1" });
  assert.equal(first.created, true);
  assert.equal(first.active, true);
  assert.equal(database.snapshot().chunkSets.length, 1);

  const retried = await firstRun({ documentId: "document-1", userId: "user-1" });
  assert.equal(retried.created, false, "相同内容和策略应幂等复用活动切片集");
  assert.equal(database.snapshot().chunks.length, first.chunkCount, "幂等重试不得重复写入切片");

  const reslice = await makeService(database, loaded("service-test-v2"))({ documentId: "document-1", userId: "user-1" });
  assert.equal(reslice.active, true);
  assert.deepEqual(database.snapshot().chunkSets.map((set) => set.status).sort(), ["active", "superseded"], "新策略成功后才替换旧活动集");

  database.setFailChunkWrite(true);
  await assert.rejects(
    () => makeService(database, loaded("service-test-v3"))({ documentId: "document-1", userId: "user-1" }),
    /simulated chunk write failure/,
  );
  const afterFailure = database.snapshot();
  assert.equal(afterFailure.chunkSets.length, 2, "写入失败时不得保留半成品切片集");
  assert.equal(afterFailure.chunkSets.filter((set) => set.status === "active").length, 1, "写入失败不得影响原活动集");
  database.setFailChunkWrite(false);

  const blockedDatabase = createMemoryDatabase();
  const blocked = await makeService(blockedDatabase, loaded("quality-blocked", "文本含有�替换字符。"))({ documentId: "document-1", userId: "user-1" });
  assert.equal(blocked.active, false, "乱码属于阻断性质量问题");
  assert.equal(blockedDatabase.snapshot().chunkSets[0]?.status, "blocked");
  assert.ok(blocked.issues.some((issue) => issue.type === "garbled_text"));

  const warningDatabase = createMemoryDatabase();
  const warning = await makeService(warningDatabase, loaded("quality-warning", "这是一段长度足够但没有句末标点的正文内容需要人工复核"))({ documentId: "document-1", userId: "user-1" });
  assert.equal(warning.active, true, "警告不应阻止激活");
  assert.ok(warning.issues.some((issue) => issue.type === "abnormal_truncation"));
  assert.ok(Array.isArray(warningDatabase.snapshot().chunkSets[0]?.qualityIssues), "质量警告应被持久化");

  const qualityCandidates: ChunkCandidate[] = [
    { text: "", sectionPath: "", locator: locator(1), source: source(1) },
    { text: "文本含有�替换字符。", sectionPath: "", locator: locator(1), source: source(1) },
    ...[1, 2, 3].map((page) => ({ text: "重复页眉", sectionPath: "", locator: locator(page), source: source(page) })),
    { text: "这是一段长度足够但没有句末标点的正文内容需要人工复核", sectionPath: "", locator: locator(4), source: source(4) },
  ];
  const allIssues = checkChunkQuality(qualityCandidates);
  for (const type of ["empty_content", "garbled_text", "repeated_header_footer", "abnormal_truncation"] as const) {
    assert.ok(allIssues.some((issue) => issue.type === type), `应检测到 ${type}`);
  }

  console.log("document chunking service verification passed");
}

void main();
