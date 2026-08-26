## 为什么

Change 2.1 已建立 KnowledgeBase、Document、DocumentChunk 和 Embedding 的数据基础，但系统还不能把法律资料导入为可追踪、可切片的规范化文本。尤其是扫描版 PDF，如果只检测并标记而不执行 OCR，后续 Change 2.3 的结构切片和 Change 2.4 的 RAG 都无法使用这类资料。

本 Change 实现多格式文档导入、内容提取、OCR、规范化和处理状态管理，确保文字型 PDF 与纯图片型 PDF 都能进入后续知识库流程，同时保留原始文件和页码来源信息。

## 变更内容

- 支持 PDF、DOCX、DOC、HTML 和 TXT 文件导入。
- 区分文字型 PDF、已带 OCR 文本层的 PDF 和纯图片型 PDF。
- 对纯图片型 PDF 自动调用本地 OCR 流程，首选 `OCRmyPDF + Tesseract`，并保留可替换 OCR 适配器边界。
- 保留原始文件只读不覆盖，生成独立的 OCR/规范化派生文件。
- 输出带页码、章节、段落、表格和来源定位信息的规范化文档结构。
- 记录解析方式、OCR 语言、工具版本、内容哈希、处理状态和失败原因。
- 支持重复检测和同一来源的新版本导入。
- 为 Change 2.3 的法律结构切片提供稳定的规范化文档输入。

## 能力

### 新增能力

- `document-ingestion`：多格式文档解析、OCR、规范化、去重、版本识别和来源追踪。

### 修改能力

- `knowledge-base`：补充 Document 的规范化产物定位、提取方式和 OCR 处理元数据。

## 影响

- 受影响代码：新增 `lib/documents/ingestion/` 解析与导入服务、文档导入脚本、测试和开发文档。
- 受影响数据：扩展 `Document` 的规范化产物与提取元数据字段；不修改 User、Conversation、Message 或既有知识库归属关系。
- 外部运行时依赖：OCRmyPDF、Tesseract 及中文语言包；DOC 文件转换需要可用的 LibreOffice headless 或等价转换器。
- Node 依赖：根据实际解析器选择增加 PDF、DOCX、HTML 解析依赖；TXT 使用 Node 内置能力。
- 环境变量：增加原始文件根目录、派生文件根目录、OCR 语言和处理超时等配置说明。
- 外部服务：本阶段不调用云端 OCR，不上传法律原文到第三方服务。

## 非目标

- 不实现法律法规、案例或合同模板的语义结构切片；该能力属于 Change 2.3。
- 不生成 Embedding，不实现向量检索、混合检索、Reranking 或 RAG Prompt；这些属于 Change 2.4 及之后。
- 不实现完整知识库管理界面、批量上传 UI、任务队列和权限管理 UI；本阶段提供可复用服务与导入任务。
- 不修改原始文件，不把 OCR 结果覆盖回原始 PDF。
- 不接入云端 OCR 或要求 API Key。
- 不承诺 OCR 对印章、手写体、复杂表格和低清晰度扫描件的无误识别；此类结果需要状态标记和后续质量校验。
