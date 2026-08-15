import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { DocumentIngestionError } from "./errors";
import type { IngestionConfig, NormalizedDocument } from "./types";

export async function assertReadableFile(filePath: string, config: IngestionConfig) {
  const resolved = path.resolve(filePath);
  if (config.sourceRoot) {
    const sourceRoot = path.resolve(config.sourceRoot);
    const relative = path.relative(sourceRoot, resolved);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      throw new DocumentIngestionError(
        `文件必须位于 DOCUMENT_SOURCE_ROOT 内：${sourceRoot}`,
        "INVALID_INPUT",
      );
    }
  }

  const fileStat = await stat(resolved).catch(() => null);
  if (!fileStat?.isFile()) {
    throw new DocumentIngestionError(`文件不存在或不可读：${resolved}`, "INVALID_INPUT");
  }

  return resolved;
}

export async function sha256File(filePath: string) {
  const hash = createHash("sha256");
  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(filePath);
    stream.on("data", (chunk: string | Buffer) => hash.update(chunk));
    stream.once("error", reject);
    stream.once("end", () => resolve());
  });
  return hash.digest("hex");
}

export function sha256Text(text: string) {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

export async function writeNormalizedArtifact(
  documentId: string,
  normalized: NormalizedDocument,
  config: IngestionConfig,
) {
  const relativeUri = path.join("documents", documentId, "normalized.json");
  const absolutePath = path.join(config.artifactRoot, relativeUri);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  const body = `${JSON.stringify(normalized, null, 2)}\n`;
  await writeFile(absolutePath, body, "utf8");

  return {
    absolutePath,
    relativeUri: relativeUri.replaceAll(path.sep, "/"),
    contentHash: sha256Text(body),
  };
}

export async function readNormalizedArtifact(filePath: string) {
  const body = await readFile(filePath, "utf8");
  return JSON.parse(body) as NormalizedDocument;
}
