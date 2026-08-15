import { execFile } from "node:child_process";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import { DocumentIngestionError } from "./errors";
import type { IngestionConfig } from "./types";

const execFileAsync = promisify(execFile);

interface CommandResult {
  stdout: string;
  stderr: string;
}

async function runCommand(
  command: string,
  args: string[],
  timeout: number,
  env?: NodeJS.ProcessEnv,
): Promise<CommandResult> {
  try {
    return await execFileAsync(command, args, {
      timeout,
      windowsHide: true,
      maxBuffer: 4 * 1024 * 1024,
      env,
    });
  } catch (error) {
    const details = error instanceof Error ? error.message : String(error);
    throw new DocumentIngestionError(
      `OCR 依赖执行失败（${command}）：${details}`,
      "OCR_FAILED",
      error,
    );
  }
}

function environmentWithTesseract(config: IngestionConfig): NodeJS.ProcessEnv {
  if (!path.isAbsolute(config.tesseractCommand)) {
    return process.env;
  }

  const pathKey =
    Object.keys(process.env).find((key) => key.toLowerCase() === "path") ??
    "PATH";
  const currentPath = process.env[pathKey] ?? "";
  const tesseractDirectory = path.dirname(config.tesseractCommand);

  return {
    ...process.env,
    [pathKey]: [tesseractDirectory, currentPath]
      .filter(Boolean)
      .join(path.delimiter),
  };
}

async function readVersion(command: string, timeout: number) {
  const result = await runCommand(command, ["--version"], timeout);
  return (result.stdout || result.stderr).split(/\r?\n/, 1)[0]?.trim() || "unknown";
}

async function assertLanguageData(config: IngestionConfig) {
  const languages = config.ocrLanguages
    .split("+")
    .map((language) => language.trim())
    .filter(Boolean);
  if (languages.length === 0) {
    throw new DocumentIngestionError("OCR_LANGUAGES 不能为空。", "OCR_FAILED");
  }

  const result = await runCommand(
    config.tesseractCommand,
    ["--list-langs"],
    Math.min(config.ocrTimeoutMs, 30_000),
  );
  const available = new Set(
    `${result.stdout}\n${result.stderr}`
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean),
  );
  const missing = languages.filter((language) => !available.has(language));
  if (missing.length > 0) {
    throw new DocumentIngestionError(
      `Tesseract 缺少语言包：${missing.join(", ")}。请安装对应的语言数据。`,
      "OCR_FAILED",
    );
  }
}

export interface OcrResult {
  outputPath: string;
  engine: string;
  version: string;
  languages: string;
  confidence: number | null;
}

export async function runOcr(
  inputPath: string,
  documentId: string,
  config: IngestionConfig,
  options: { skipExistingText?: boolean } = {},
): Promise<OcrResult> {
  const outputRelativePath = path.join("documents", documentId, "ocr.pdf");
  const outputPath = path.join(config.artifactRoot, outputRelativePath);
  await mkdir(path.dirname(outputPath), { recursive: true });

  await assertLanguageData(config);
  const version = await readVersion(config.ocrCommand, Math.min(config.ocrTimeoutMs, 30_000));

  await runCommand(
    config.ocrCommand,
    [
      "-l",
      config.ocrLanguages,
      "--output-type",
      "pdf",
      ...(options.skipExistingText ? ["--skip-text"] : []),
      inputPath,
      outputPath,
    ],
    config.ocrTimeoutMs,
    environmentWithTesseract(config),
  );

  return {
    outputPath,
    engine: "ocrmypdf+tesseract",
    version,
    languages: config.ocrLanguages,
    confidence: null,
  };
}
