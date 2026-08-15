## 1. 依赖与导入契约

- [x] 1.1 确认并记录 PDF、DOCX、DOC、HTML、TXT 的解析器选型及其 Node/Python/系统依赖。
- [x] 1.2 确认本地 OCR 运行链：OCRmyPDF、Tesseract、中文语言包和 PDF 渲染器；提供依赖探测与清晰错误信息。
- [x] 1.3 定义 `NormalizedDocument v1`、页、区块、来源定位、OCR 置信度和提取方式的 TypeScript 类型。
- [x] 1.4 定义 `Document` 状态迁移、重复检测、版本识别和导入错误分类。

## 2. Document 数据与派生产物

- [x] 2.1 扩展 `prisma/schema.prisma`，增加 `normalizedUri`、`normalizedContentHash`、`extractionMethod`、OCR 元数据和必要索引。
- [x] 2.2 创建 Prisma migration，确保不重置数据库且不影响现有 User、Conversation、Message 和 KnowledgeBase 数据。
- [x] 2.3 实现原始文件只读、派生文件独立写入和稳定 URI 解析，避免覆盖原始文件。

## 3. 多格式解析

- [x] 3.1 创建 `lib/documents/ingestion/` 统一导入服务、适配器接口和规范化输出器。
- [x] 3.2 实现 TXT、HTML、DOCX 解析，保留标题、段落、表格和可用来源信息。
- [x] 3.3 实现 DOC 转换适配器，优先使用 LibreOffice headless 转换后复用 DOCX 解析；缺失或失败时进入 `manual_review`。
- [x] 3.4 实现 PDF 文本层提取、按页输出和文字覆盖率检测。
- [x] 3.5 区分文字型 PDF、已带 OCR 文本层 PDF 和纯图片型 PDF，并记录检测结果。

## 4. OCR 能力

- [x] 4.1 实现 OCRmyPDF + Tesseract 的本地 OCR 适配器，通过受控子进程执行并校验退出码、超时和输出文件。
- [x] 4.2 对纯图片型 PDF 执行 OCR，默认支持 `chi_sim+eng`，生成独立的可搜索派生 PDF。
- [x] 4.3 从 OCR 派生 PDF 提取页级文字和可用区块信息，标记 `extractionMethod: ocr` 及 OCR 工具元数据。
- [x] 4.4 覆盖 OCR 工具缺失、语言包缺失、超时、低质量输出和非法 PDF 等失败路径。
- [x] 4.5 保留 OCR 适配器边界，记录未来替换 PaddleOCR 等引擎所需的接口约束。

## 5. 导入任务与数据一致性

- [x] 5.1 实现内容哈希、稳定来源标识、重复检测和内容变化版本识别。
- [x] 5.2 实现 `pending → processing → succeeded/failed/manual_review` 及 OCR 专用状态的持久化更新。
- [x] 5.3 创建 `scripts/ingest-document.ts`，支持指定 KnowledgeBase 和本地文件执行可重复导入。
- [x] 5.4 在导入入口执行 KnowledgeBase 归属校验，禁止仅依赖客户端 owner ID。
- [x] 5.5 生成并持久化规范化 JSON，供 Change 2.3 读取；不在本阶段创建 DocumentChunk。

## 6. 测试与文档

- [ ] 6.1 准备文字型 PDF、纯图片 PDF、已带 OCR 文本层 PDF、中文 DOCX、HTML、TXT 和 DOC 样本。
- [x] 6.2 编写解析、OCR、页码来源、哈希去重、版本识别和失败状态测试。
- [x] 6.3 验证原始文件不会被覆盖，派生文件 URI 与哈希可追踪。
- [x] 6.4 更新文档导入/OCR 本地安装与手工验收文档，说明法律原文不上传云端。
- [x] 6.5 运行 `npm run lint`、Prisma migration/generate 和导入脚本验证。

## 7. 结构化质量增强

- [x] 7.1 扩展规范化 block，提供唯一定位、章节路径、条款编号和可用来源页。
- [x] 7.2 直接读取 DOCX OOXML 的段落、样式、编号和表格，不再把 DOCX 伪造为第 1 页。
- [x] 7.3 增强 HTML、TXT、PDF 的唯一定位与基础法律结构识别。
- [x] 7.4 提供已成功导入文件的显式重新处理入口，并以真实司法解释 DOCX 验证结构化输出。
