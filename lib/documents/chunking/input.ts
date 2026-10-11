import path from "node:path";

import { prisma } from "@/lib/db";
import { getIngestionConfig } from "../ingestion/config";
import { readNormalizedArtifact } from "../ingestion/storage";
import {
  NORMALIZED_DOCUMENT_SCHEMA_VERSION,
  type NormalizedDocument,
} from "../ingestion/types";
import { DocumentChunkingError } from "./errors";
import {
  CHUNKING_STRATEGY_VERSION,
  DEFAULT_MAX_CHUNK_CHARACTERS,
  type ChunkingConfig,
  type LoadedChunkingDocument,
} from "./types";

export function getChunkingConfig(
  overrides: Partial<ChunkingConfig> = {},
): ChunkingConfig {
  return {
    artifactRoot: path.resolve(
      overrides.artifactRoot ?? getIngestionConfig().artifactRoot,
    ),
    maxChunkCharacters:
      overrides.maxChunkCharacters ?? DEFAULT_MAX_CHUNK_CHARACTERS,
    strategyVersion: overrides.strategyVersion ?? CHUNKING_STRATEGY_VERSION,
  };
}

export function resolveNormalizedArtifactPath(
  normalizedUri: string,
  config: ChunkingConfig,
) {
  const artifactRoot = path.resolve(config.artifactRoot);
  const absolutePath = path.resolve(artifactRoot, normalizedUri);
  const relative = path.relative(artifactRoot, absolutePath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new DocumentChunkingError(
      "规范化文档路径超出派生产物目录。",
      "INVALID_INPUT",
    );
  }
  return absolutePath;
}

export function assertSupportedNormalizedDocument(
  value: unknown,
): asserts value is NormalizedDocument {
  const normalized = value as Partial<NormalizedDocument> | null;
  if (
    !normalized ||
    normalized.schemaVersion !== NORMALIZED_DOCUMENT_SCHEMA_VERSION ||
    !Array.isArray(normalized.pages) ||
    !normalized.pages.every(
      (page) =>
        page &&
        (page.pageNumber === null || typeof page.pageNumber === "number") &&
        typeof page.text === "string" &&
        Array.isArray(page.blocks),
    )
  ) {
    throw new DocumentChunkingError(
      `不支持或损坏的规范化文档；仅支持 ${NORMALIZED_DOCUMENT_SCHEMA_VERSION}。`,
      "UNSUPPORTED_NORMALIZED_DOCUMENT",
    );
  }
}

export function assertChunkingEligibility(document: {
  status: string;
  normalizedUri: string | null;
  normalizedContentHash: string | null;
  knowledgeBase: { scope: string; ownerId: string | null };
}, userId: string) {
  if (!userId || (document.knowledgeBase.scope !== "system" && document.knowledgeBase.ownerId !== userId)) throw new DocumentChunkingError("无权切片该文档。", "UNAUTHORIZED");
  if (document.status !== "succeeded") throw new DocumentChunkingError("仅可切片已成功规范化的文档。", "INVALID_INPUT");
  if (!document.normalizedUri || !document.normalizedContentHash) throw new DocumentChunkingError("文档缺少规范化产物或内容哈希。", "ARTIFACT_UNAVAILABLE");
}

export async function loadChunkingDocument(input: {
  documentId: string;
  userId: string;
  config?: Partial<ChunkingConfig>;
}): Promise<LoadedChunkingDocument> {
  if (!input.documentId || !input.userId) {
    throw new DocumentChunkingError(
      "切片任务必须提供文档 ID 和已验证用户身份。",
      "UNAUTHORIZED",
    );
  }

  const document = await prisma.document.findUnique({
    where: { id: input.documentId },
    select: {
      id: true,
      category: true,
      status: true,
      normalizedUri: true,
      normalizedContentHash: true,
      knowledgeBase: { select: { scope: true, ownerId: true } },
    },
  });
  if (!document) {
    throw new DocumentChunkingError("文档不存在或无权访问。", "UNAUTHORIZED");
  }
  assertChunkingEligibility(document, input.userId);
  // The eligibility helper validates these at runtime; retain a local guard so
  // TypeScript can safely narrow Prisma's nullable database fields.
  if (!document.normalizedUri || !document.normalizedContentHash) {
    throw new DocumentChunkingError(
      "文档缺少规范化产物或内容哈希。",
      "ARTIFACT_UNAVAILABLE",
    );
  }

  const config = getChunkingConfig(input.config);
  const artifactPath = resolveNormalizedArtifactPath(document.normalizedUri, config);
  let normalized: NormalizedDocument;
  try {
    normalized = await readNormalizedArtifact(artifactPath);
  } catch (cause) {
    throw new DocumentChunkingError(
      "无法读取规范化文档产物。",
      "ARTIFACT_UNAVAILABLE",
      cause,
    );
  }
  assertSupportedNormalizedDocument(normalized);

  return {
    document: {
      id: document.id,
      category: document.category,
      normalizedContentHash: document.normalizedContentHash,
      normalizedUri: document.normalizedUri,
    },
    normalized,
    config,
  };
}
