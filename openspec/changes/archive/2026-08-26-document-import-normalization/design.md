## 设计决策

### 1. 采用统一导入流水线和可替换适配器

导入流程统一为：

```text
原始文件
  ↓
哈希与重复检测
  ↓
格式识别
  ↓
文本层检测 / 解析器 / OCR
  ↓
规范化 Document v1
  ↓
派生文件与 Document 状态更新
  ↓
Change 2.3 读取并切片
```

解析器和 OCR 通过适配器隔离，统一输出 `NormalizedDocument`，避免后续切片逻辑依赖具体文件格式或 OCR 工具。

### 2. OCR 首选 OCRmyPDF + Tesseract

首个本地实现使用 OCRmyPDF 调度 Tesseract：

- Tesseract 负责文字识别，默认语言为 `chi_sim+eng`，可通过配置扩展。
- OCRmyPDF 负责 PDF 页面处理、OCR 文字层生成、临时文件和输出 PDF 校验。
- 原始 PDF 保持只读，OCRmyPDF 输出写入派生文件目录。
- OCR 输出重新进入 PDF 文本提取器，生成统一的页级规范化结构。

不在 TypeScript 中嵌入 Python 运行时；Node 导入服务通过受控子进程调用 OCR CLI，并检查退出码、超时、标准错误和输出文件存在性。未来若需要更强的中文版面或表格识别，可在相同适配器边界替换为 PaddleOCR，不改变 Document 数据契约。

### 3. 解析器选择与格式降级

- TXT：按 UTF-8 优先读取，必要时记录编码探测结果。
- HTML：移除脚本、样式和导航噪声，保留标题、正文、表格和来源链接。
- DOCX：提取段落、标题、表格和文档关系信息。
- DOC：优先调用 LibreOffice headless 转换为 DOCX 或中间格式后复用 DOCX 解析；转换器不可用时记录 `manual_review`，不伪造正文。
- PDF：先提取文字层并按页保存；如果文本覆盖率不足或页面无文字，则判定为 `image_only` 并进入 OCR。

### 4. 规范化文档格式

规范化产物使用版本化 JSON 文件，示意如下：

```json
{
  "schemaVersion": "document-normalized-v1",
  "sourceType": "pdf",
  "extractionMethod": "native | ocr",
  "pages": [
    {
      "pageNumber": 1,
      "text": "...",
      "blocks": [{"text": "...", "bbox": null, "confidence": null}]
    }
  ],
  "metadata": {"title": "...", "sourceUri": "..."}
}
```

`Document` 记录派生产物 URI、规范化哈希、解析方式、解析器版本和 OCR 元数据；完整正文保存在派生文件中，避免把长文档塞入 Json 字段。页码和可用的区块坐标保留给 Change 2.3 做法律结构切片和引用。

### 5. 原始文件与派生文件分离

原始文件从配置的只读资料根目录读取，导入流程不得覆盖或移动原始文件。OCR PDF 和规范化 JSON 写入独立的派生文件根目录，并通过稳定的相对 URI 关联 Document。生产环境替换存储介质时，只替换存储适配器，不改变业务字段语义。

### 6. 处理状态与失败策略

状态至少包括：`pending`、`processing`、`ocr_processing`、`succeeded`、`failed`、`manual_review` 和 `ocr_failed`。错误记录必须包含可读原因和工具阶段；OCR 工具缺失、超时、低质量或输出无法解析时不得将记录标记为成功。

同一 Document 不能被并发导入任务覆盖。任务开始前以内容哈希和稳定来源标识做去重；同来源内容哈希变化时创建新版本或更新版本元数据，具体版本序列由 Document 的现有字段承载。

### 7. 导入入口

本 Change 优先提供可重复执行的服务和 CLI 任务，例如：

```text
scripts/ingest-document.ts --knowledge-base <id> --file <path>
```

不在本阶段创建完整上传 UI。未来 Change 2.5 的管理界面可直接调用同一服务，并将同步导入替换为后台任务。

## 数据模型调整

在现有 `Document` 上增加或等价映射以下字段：

- `normalizedUri`：规范化 JSON 派生文件位置。
- `normalizedContentHash`：规范化正文哈希。
- `extractionMethod`：`native` 或 `ocr`。
- `ocrEngine`、`ocrVersion`、`ocrLanguages`：OCR 元数据，可为空。
- `ocrConfidence`：可获得的聚合置信度，可为空。

使用 Prisma migration 增加字段；不得重置数据库，不得修改现有用户、会话和消息数据。

## 风险与取舍

- [风险] OCRmyPDF、Tesseract、语言包和 PDF 渲染器属于外部运行时依赖 → 启动时提供依赖检查，导入时返回明确的 `ocr_failed`，并在文档中记录安装方式。
- [风险] 中文法律文档可能有表格、印章、低清扫描和双栏排版 → 保留页级文本、区块定位和人工检查状态，暂不承诺复杂版面完全还原。
- [风险] OCR 长文档占用 CPU 和磁盘 → 使用临时目录、超时、输出大小检查和逐页失败信息；后台队列延期到后续 Change。
- [风险] DOC 转换器在不同环境表现不一致 → 将 DOC 转换作为外部适配器，转换失败不得伪造成功文本。
- [取舍] 首版不接入 PaddleOCR 或云 OCR → 控制运行时复杂度和数据出境风险；保留 OCR 适配器以便后续替换。

## 验证策略

- 准备至少四类样本：文字型 PDF、纯图片 PDF、带 OCR 文本层 PDF、中文 DOCX/HTML。
- 验证原始文件哈希、派生文件、页码和提取方式可追踪。
- 验证纯图片 PDF 在 OCR 工具可用时产生可搜索文本，在工具缺失或超时时进入失败状态。
- 验证重复导入不产生无关重复 Document，内容变化能识别为新版本。
- 运行 `npm run lint`、必要的类型检查和导入脚本测试；不在没有配置 OCR 工具时伪造成功验收。

## Open Questions

- 是否在本地开发环境通过 Docker 固定 OCRmyPDF、Tesseract、语言包和 LibreOffice 版本，还是要求开发者自行安装。
- 真实法律样本的 OCR 质量阈值和人工复核规则，需要在 Change 2.3 的切片质量校验中进一步确定。
- 生产环境的原始文件与派生文件最终使用本地卷、对象存储还是其他受控存储，留到文档管理阶段决定。
