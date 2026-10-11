import { sha256Text } from "../ingestion/storage";
import { DocumentChunkingError } from "./errors";
import { checkChunkQuality, hasBlockingQualityIssue } from "./quality";
import { createChunkCandidates, identifyStructure, toPersistableChunks } from "./structure";
import type { ChunkingConfig, LoadedChunkingDocument, PersistableChunk } from "./types";

type ChunkSetKey = { documentId: string; normalizedContentHash: string; strategyVersion: string };

export interface ChunkingTransaction {
  documentChunkSet: {
    findUnique(args: { where: { documentId_normalizedContentHash_strategyVersion: ChunkSetKey }; select?: unknown }): Promise<{ id: string; status: string } | null>;
    create(args: { data: Record<string, unknown> }): Promise<{ id: string }>;
    update(args: { where: { id: string }; data: Record<string, unknown> }): Promise<{ id: string }>;
    updateMany(args: { where: Record<string, unknown>; data: Record<string, unknown> }): Promise<unknown>;
  };
  documentChunk: {
    deleteMany(args: { where: { chunkSetId: string } }): Promise<unknown>;
    createMany(args: { data: Record<string, unknown>[] }): Promise<unknown>;
  };
}

type ChunkingInput = { documentId: string; userId: string; config?: Partial<ChunkingConfig> };

export interface ChunkingServiceDependencies {
  loadDocument(input: ChunkingInput): Promise<LoadedChunkingDocument>;
  sha256: typeof sha256Text;
  runInTransaction<T>(operation: (transaction: ChunkingTransaction) => Promise<T>): Promise<T>;
}

export function createChunkingService(dependencies: ChunkingServiceDependencies) {
  return async function chunkDocument(input: ChunkingInput) {
    const loaded = await dependencies.loadDocument(input);
    const { strategy, nodes } = identifyStructure(loaded.normalized, loaded.document.category);
    const candidates = createChunkCandidates(nodes, loaded.config, strategy);
    const issues = checkChunkQuality(candidates);
    const serializedIssues = JSON.parse(JSON.stringify(issues));
    const chunks = toPersistableChunks(candidates);
    if (!chunks.length) throw new DocumentChunkingError("规范化文档不含可切片正文。", "QUALITY_BLOCKED");
    const result = await dependencies.runInTransaction(async (tx) => {
      const existing = await tx.documentChunkSet.findUnique({ where: { documentId_normalizedContentHash_strategyVersion: { documentId: loaded.document.id, normalizedContentHash: loaded.document.normalizedContentHash, strategyVersion: loaded.config.strategyVersion } }, select: { id: true, status: true } });
      if (existing?.status === "active") return { chunkSetId: existing.id, created: false, active: true };
      const chunkSet = existing
        ? await tx.documentChunkSet.update({ where: { id: existing.id }, data: { status: "pending", qualityIssues: serializedIssues } })
        : await tx.documentChunkSet.create({ data: { documentId: loaded.document.id, normalizedContentHash: loaded.document.normalizedContentHash, strategyVersion: loaded.config.strategyVersion, qualityIssues: serializedIssues } });
      await tx.documentChunk.deleteMany({ where: { chunkSetId: chunkSet.id } });
      await tx.documentChunk.createMany({ data: chunks.map((chunk: PersistableChunk) => ({ ...chunk, locator: JSON.parse(JSON.stringify(chunk.locator)), documentId: loaded.document.id, chunkSetId: chunkSet.id, chunkStrategyVersion: loaded.config.strategyVersion })) });
      if (hasBlockingQualityIssue(issues)) {
        await tx.documentChunkSet.update({ where: { id: chunkSet.id }, data: { status: "blocked" } });
        return { chunkSetId: chunkSet.id, created: true, active: false };
      }
      await tx.documentChunkSet.updateMany({ where: { documentId: loaded.document.id, status: "active", id: { not: chunkSet.id } }, data: { status: "superseded", activatedAt: null } });
      await tx.documentChunkSet.update({ where: { id: chunkSet.id }, data: { status: "active", activatedAt: new Date() } });
      return { chunkSetId: chunkSet.id, created: true, active: true };
    });
    return { ...result, strategy, chunkCount: chunks.length, issues, chunkContentHash: dependencies.sha256(chunks.map((chunk) => chunk.contentHash).join("|")) };
  };
}
