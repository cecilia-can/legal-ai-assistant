import { readFile } from "node:fs/promises";
import path from "node:path";

import { prisma } from "@/lib/db";

import { asIngestionError, DocumentIngestionError } from "./errors";
import { getIngestionConfig } from "./config";
import { runOcr } from "./ocr";
import { parseDocumentFile, parsePdfDocument, sourceTypeFromPath } from "./parsers";
import {
  assertReadableFile,
  sha256File,
  writeNormalizedArtifact,
} from "./storage";
import type {
  DocumentProcessingStatus,
  IngestDocumentInput,
  IngestDocumentResult,
  IngestionConfig,
  NormalizedDocument,
} from "./types";

function defaultSourceIdentifier(filePath: string, config: IngestionConfig) {
  const resolved = path.resolve(filePath);
  const relative = config.sourceRoot
    ? path.relative(path.resolve(config.sourceRoot), resolved)
    : path.relative(process.cwd(), resolved) || path.basename(resolved);
  return relative.replaceAll(path.sep, "/");
}

function statusForError(error: DocumentIngestionError): DocumentProcessingStatus {
  switch (error.code) {
    case "OCR_FAILED":
      return "ocr_failed";
    case "MANUAL_REVIEW":
      return "manual_review";
    default:
      return "failed";
  }
}

function documentMetadata(
  normalized: NormalizedDocument,
  input: IngestDocumentInput,
  sourceIdentifier: string,
) {
  return {
    ...normalized.metadata,
    originalFilename: path.basename(input.filePath),
    sourceIdentifier,
    sourceUri: input.sourceUri ?? normalized.metadata.sourceUri ?? sourceIdentifier,
  };
}

export async function ingestDocument(
  input: IngestDocumentInput,
): Promise<IngestDocumentResult> {
  const config = getIngestionConfig(input.config);
  const knowledgeBase = await prisma.knowledgeBase.findUnique({
    where: { id: input.knowledgeBaseId },
    select: { id: true, scope: true, ownerId: true },
  });

  if (!knowledgeBase) {
    throw new DocumentIngestionError("KnowledgeBase 不存在。", "UNAUTHORIZED");
  }
  if (!input.userId) {
    throw new DocumentIngestionError("导入文档必须先通过用户身份校验。", "UNAUTHORIZED");
  }
  if (knowledgeBase.scope !== "system" && knowledgeBase.ownerId !== input.userId) {
    throw new DocumentIngestionError("无权向该 KnowledgeBase 导入文档。", "UNAUTHORIZED");
  }

  const filePath = await assertReadableFile(input.filePath, config);
  const contentHash = await sha256File(filePath);
  const sourceIdentifier =
    input.sourceIdentifier ?? defaultSourceIdentifier(filePath, config);
  const sourceType = sourceTypeFromPath(filePath);
  const previousVersionCount = await prisma.document.count({
    where: {
      knowledgeBaseId: input.knowledgeBaseId,
      sourceIdentifier,
    },
  });

  const existing = await prisma.document.findUnique({
    where: {
      knowledgeBaseId_sourceIdentifier_contentHash: {
        knowledgeBaseId: input.knowledgeBaseId,
        sourceIdentifier,
        contentHash,
      },
    },
    select: { id: true, status: true, extractionMethod: true, normalizedUri: true },
  });
  const isRetryable =
    existing?.status === "failed" ||
    existing?.status === "ocr_failed" ||
    existing?.status === "manual_review" ||
    (input.forceReprocess === true && existing?.status === "succeeded");
  if (existing && !isRetryable) {
    return {
      created: false,
      documentId: existing.id,
      status: "duplicate",
      extractionMethod: (existing.extractionMethod ?? undefined) as
        | "native"
        | "ocr"
        | undefined,
      normalizedUri: existing.normalizedUri ?? undefined,
    };
  }

  const document = isRetryable
    ? await prisma.document.update({
        where: { id: existing.id },
        data: { status: "pending", errorMessage: null },
        select: { id: true },
      })
    : await prisma.document.create({
        data: {
          knowledgeBaseId: input.knowledgeBaseId,
          uploadedByUserId: input.userId,
          originalFilename: path.basename(filePath),
          title: input.title,
          sourceIdentifier,
          sourceUri: input.sourceUri ?? sourceIdentifier,
          sourceType,
          category: input.category,
          contentHash,
          documentVersion: `v${previousVersionCount + 1}`,
          status: "pending",
        },
        select: { id: true },
      });

  try {
    await prisma.document.update({
      where: { id: document.id },
      data: { status: "processing", errorMessage: null },
    });

    const metadata = {
      title: input.title,
      sourceUri: input.sourceUri ?? sourceIdentifier,
      sourceIdentifier,
    };
    let parsed = await parseDocumentFile(filePath, config, metadata);
    let normalized = parsed.normalized;
    let ocrUri: string | undefined;
    let ocrMetadata: {
      engine?: string;
      version?: string;
      languages?: string;
      confidence?: number | null;
    } = {};

    if (
      sourceType === "pdf" &&
      (parsed.imageOnlyPageNumbers?.length ?? 0) > 0
    ) {
      await prisma.document.update({
        where: { id: document.id },
        data: { status: "ocr_processing", errorMessage: null },
      });

      const ocr = await runOcr(filePath, document.id, config, {
        skipExistingText: parsed.pdfPageClassification === "mixed",
      });
      ocrUri = path
        .relative(config.artifactRoot, ocr.outputPath)
        .replaceAll(path.sep, "/");
      const ocrPdf = await readFile(ocr.outputPath);
      parsed = await parsePdfDocument(ocrPdf, metadata);
      if (
        (parsed.imageOnlyPageNumbers?.length ?? 0) >= parsed.normalized.pages.length ||
        parsed.normalized.pages.every((page) => !page.text)
      ) {
        throw new DocumentIngestionError(
          "OCR 完成但没有生成可读取的文字层。",
          "OCR_FAILED",
        );
      }
      normalized = {
        ...parsed.normalized,
        extractionMethod: "ocr",
        metadata: {
          ...parsed.normalized.metadata,
          ocrEngine: ocr.engine,
          ocrVersion: ocr.version,
          ocrLanguages: ocr.languages,
          ocrConfidence: ocr.confidence,
        },
      };
      ocrMetadata = {
        engine: ocr.engine,
        version: ocr.version,
        languages: ocr.languages,
        confidence: ocr.confidence,
      };
    }

    normalized.metadata = documentMetadata(normalized, input, sourceIdentifier);
    const artifact = await writeNormalizedArtifact(document.id, normalized, config);
    const status: DocumentProcessingStatus = "succeeded";

    await prisma.document.update({
      where: { id: document.id },
      data: {
        status,
        errorMessage: null,
        parserVersion: "document-ingestion-v2",
        normalizationVersion: normalized.schemaVersion,
        normalizedUri: artifact.relativeUri,
        normalizedContentHash: artifact.contentHash,
        extractionMethod: normalized.extractionMethod,
        ocrEngine: ocrMetadata.engine,
        ocrVersion: ocrMetadata.version,
        ocrLanguages: ocrMetadata.languages,
        ocrConfidence: ocrMetadata.confidence,
        metadata: {
          ...normalized.metadata,
          ocrUri,
          imageOnlyPageNumbers: parsed.imageOnlyPageNumbers ?? [],
          pdfPageClassification: parsed.pdfPageClassification,
        },
      },
    });

    return {
      created: !isRetryable,
      documentId: document.id,
      status,
      extractionMethod: normalized.extractionMethod,
      normalizedUri: artifact.relativeUri,
      imageOnlyPageNumbers: parsed.imageOnlyPageNumbers,
    };
  } catch (error) {
    const ingestionError = asIngestionError(error);
    await prisma.document.update({
      where: { id: document.id },
      data: {
        status: statusForError(ingestionError),
        errorMessage: ingestionError.message,
        parserVersion: "document-ingestion-v2",
      },
    });
    throw ingestionError;
  }
}
