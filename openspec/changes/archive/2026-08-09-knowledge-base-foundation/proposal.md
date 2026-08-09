## Why

Phase 2 需要在现有 PostgreSQL 和 Prisma 数据层之上建立法律知识库的基础数据模型。当前项目只有用户、会话和消息模型，还没有知识库、文档、文档切片或向量记录，后续的多格式导入、法律结构切片和 RAG 检索没有稳定的数据边界。

本 Change 先完成知识库数据模型和 pgvector 基础设施，不在本阶段批量解析文档、切片或生成 Embedding。这样可以先确定文档归属、版本、来源追踪和向量模型元数据，避免在文档处理完成后重做数据库结构。

## What Changes

- 在现有 PostgreSQL 数据库中启用 pgvector 扩展。
- 新增 `KnowledgeBase`、`Document`、`DocumentChunk` 和 `Embedding` 数据模型。
- 建立 `KnowledgeBase → Document → DocumentChunk → Embedding` 关系。
- 为系统公共知识库和用户私有知识库预留明确的范围与归属模型。
- 保存文档哈希、来源、分类、版本、解析状态和切片追踪信息。
- 保存 Embedding 模型、向量维度和版本，支持未来重新嵌入。
- 添加 Prisma migration、生成客户端并完成数据库基础验证。

## Capabilities

### New Capabilities

- `knowledge-base`: 定义知识库、文档、文档切片、向量记录、归属范围和基础数据库能力。

### Modified Capabilities

- 无。本 Change 为 Phase 2 新增知识库基础能力，不改变现有聊天、认证或消息能力。

## Impact

- Affected code: `prisma/schema.prisma`、`prisma/migrations/*`，必要时更新 `docker-compose.yml` 或数据库初始化脚本。
- Affected data: 新增知识库相关表和 pgvector 扩展，不修改现有用户、会话和消息数据。
- Dependencies: 复用当前已安装的 Prisma 7、`@prisma/client`、`@prisma/adapter-pg` 和 PostgreSQL。
- Systems: 本地开发数据库继续使用已有的 `pgvector/pgvector:pg17` Docker 镜像。
- External services: 本阶段不调用 Embedding 服务，不要求配置新的 API Key。
