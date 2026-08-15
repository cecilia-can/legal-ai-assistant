import path from "node:path";

import type { IngestionConfig } from "./types";

function positiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function ratio(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1 ? parsed : fallback;
}

export function getIngestionConfig(
  overrides: Partial<IngestionConfig> = {},
): IngestionConfig {
  return {
    sourceRoot:
      overrides.sourceRoot ??
      (process.env.DOCUMENT_SOURCE_ROOT || undefined),
    artifactRoot: path.resolve(
      overrides.artifactRoot ??
        process.env.DOCUMENT_ARTIFACT_ROOT ??
        "data/document-artifacts",
    ),
    ocrCommand:
      overrides.ocrCommand ?? process.env.DOCUMENT_OCR_COMMAND ?? "ocrmypdf",
    tesseractCommand:
      overrides.tesseractCommand ??
      process.env.DOCUMENT_TESSERACT_COMMAND ??
      "tesseract",
    officeCommand:
      overrides.officeCommand ??
      process.env.DOCUMENT_OFFICE_COMMAND ??
      "soffice",
    ocrLanguages:
      overrides.ocrLanguages ??
      process.env.DOCUMENT_OCR_LANGUAGES ??
      "chi_sim+eng",
    ocrTimeoutMs:
      overrides.ocrTimeoutMs ??
      positiveInteger(process.env.DOCUMENT_OCR_TIMEOUT_MS, 15 * 60 * 1000),
    pdfTextCoverageThreshold:
      overrides.pdfTextCoverageThreshold ??
      ratio(process.env.DOCUMENT_PDF_TEXT_COVERAGE_THRESHOLD, 0.05),
  };
}
