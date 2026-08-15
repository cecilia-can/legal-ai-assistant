# 文档导入与 OCR 验收

## 本地依赖

Change 2.2 使用 Node 解析 TXT、HTML、DOCX 和 PDF 文本层；纯图片型 PDF 需要额外安装：

- OCRmyPDF
- Tesseract OCR
- Tesseract 中文语言包 `chi_sim` 和英文语言包 `eng`
- PDF 渲染依赖（按 OCRmyPDF 官方安装方式配置）
- `soffice` / LibreOffice（仅导入旧版 DOC 时需要）

导入任务不会把原始法律文件上传到云端。缺少 OCR 依赖时，文档状态应为 `ocr_failed`；缺少 DOC 转换器时，状态应为 `manual_review`。

## 配置

复制 `.env.example` 中的文档导入配置到本地环境：

```text
DOCUMENT_SOURCE_ROOT=D:/legal-sources
DOCUMENT_ARTIFACT_ROOT=data/document-artifacts
DOCUMENT_OCR_LANGUAGES=chi_sim+eng
DOCUMENT_OCR_TIMEOUT_MS=900000
```

`DOCUMENT_SOURCE_ROOT` 用于限制导入文件必须位于只读资料目录内。派生 OCR PDF 和规范化 JSON 写入 `DOCUMENT_ARTIFACT_ROOT`，不会覆盖原始文件。

## 运行基础验证

```bash
npx tsx scripts/verify-document-ingestion.ts
```

该验证覆盖：

- TXT 段落规范化
- HTML 噪声清理和表格保留
- 文字型 PDF 文本层提取
- 无文字层 PDF 的 `image_only` 判定
- 规范化 JSON 写入、哈希和读回
- OCR 依赖缺失时的 `OCR_FAILED`

## 导入文档

```bash
npm run ingest:document -- --knowledge-base <knowledge-base-id> --user-id <user-id> --file <path>
```

支持 `.pdf`、`.docx`、`.doc`、`.html`、`.htm` 和 `.txt`。同一 KnowledgeBase 下，稳定来源标识和内容哈希相同的文件不会重复创建 Document。

纯图片型 PDF 会先生成独立的 OCR PDF，再生成 `document-normalized-v1` JSON。混合 PDF（部分文字页、部分扫描图片页）会自动使用 OCRmyPDF 的 `--skip-text`，保留已有文字层并仅处理图片页。成功后，Document 的 `extractionMethod` 为 `ocr`，并保存 OCR 工具版本、语言和派生产物 URI。

## 手工验收矩阵

| 样本 | 预期提取方式 | 预期结果 |
|---|---|---|
| 文字型 PDF | native | 直接读取页级文字，不调用 OCR |
| 已带 OCR 文本层 PDF | native | 读取已有文字层 |
| 纯图片型 PDF | ocr | 生成 OCR 派生 PDF 和规范化 JSON |
| OCR 工具缺失 | ocr | `ocr_failed`，原文件保留 |
| DOC 且无 soffice | conversion | `manual_review`，不伪造正文 |
| DOCX / HTML / TXT | native | 输出统一规范化结构 |

## 质量边界

印章、手写体、低清晰度扫描、复杂双栏和复杂表格的识别质量需要在真实法律样本上复核。Change 2.2 保存页码、区块和可用置信度；法律条款识别和结构切片由 Change 2.3 负责。
## 结构化输出（v2）

`normalized.json` 的 `schemaVersion` 已升级为 `document-normalized-v2`。每个 block 都具有唯一 `locator`；PDF block 还保留 `sourcePage`。在可识别时，解析器会补充 `sectionPath` 和 `articleNumber`。
`metadata.originalFilename` 保留原始文件名。

JSON 中显示的 `\n` 是字符串换行的标准转义。HTML 段落内部的视觉换行会归一为空格；若输出中仍出现 `�`，表示原始文件本身含有 Unicode 替换字符，系统会保留它而不会猜测原文字符。修复源文件后，请使用 `--reprocess` 重新处理。

- DOCX/DOC：直接读取 Word OOXML 的段落、样式、编号与表格；不伪造物理页码，`pageNumber` 为 `null`。
- HTML：保留标题、段落、列表和表格，并以 `heading:1`、`paragraph:2`、`table:1` 等作为定位器。
- TXT：以段落的原始行号定位，例如 `line:12-18`。
- PDF：保留实际页码，并以 `page:2:block:1` 定位。

已成功导入的同一文件如需使用当前解析器重新生成输出，可在导入命令后添加 `--reprocess`。原始文件不会被修改。
