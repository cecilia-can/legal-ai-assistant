## 1. 数据模型设计

- [x] 1.1 在 `prisma/schema.prisma` 中定义 `KnowledgeBase` 模型，包含 scope、ownerId、名称和时间字段。
- [x] 1.2 定义 `Document` 模型，包含知识库关系、来源标识、文件名、类型、分类、哈希值、处理状态和错误信息。
- [x] 1.3 定义 `DocumentChunk` 模型，包含文档关系、顺序、正文、来源定位元数据和切片策略版本。
- [x] 1.4 定义 `Embedding` 模型，包含切片关系、模型、维度、内容哈希、向量列和时间字段。
- [x] 1.5 配置级联关系、必要的唯一约束和查询索引，确保文档与切片顺序稳定。
- [x] 1.6 保持现有 User、Conversation、Message 模型及其用户归属关系不变。

## 2. pgvector 与 Prisma Migration

- [x] 2.1 确认本地 PostgreSQL 使用 `pgvector/pgvector:pg17` 镜像，并记录启动和验证方式。
- [x] 2.2 创建 Prisma migration，显式执行 `CREATE EXTENSION IF NOT EXISTS vector`。
- [x] 2.3 在 migration 中处理 Prisma 无法直接表达的 pgvector 向量列和必要原生 SQL。
- [x] 2.4 暂不创建依赖最终 Embedding 维度的 HNSW/IVFFlat 索引，并在 migration 或设计文档中说明延期到 Change 2.4 的原因。
- [x] 2.5 运行 migration，确认新表、关系、唯一约束和索引创建成功。

## 3. Prisma Client 与基础验证

- [x] 3.1 运行 `npx prisma generate`，确认现有 `app/generated/prisma` 输出路径不变。
- [x] 3.2 验证现有 `lib/db.ts` 可以继续创建和导出 Prisma Client。
- [x] 3.3 验证可以创建系统公共知识库和用户私有知识库记录。
- [x] 3.4 验证文档、切片和向量元数据可以按关系写入和读取。
- [x] 3.5 验证已有 User、Conversation 和 Message 数据不受迁移影响。

## 4. 文档与质量门槛

- [x] 4.1 更新数据库或开发文档，说明 pgvector 扩展的本地启动和迁移要求。
- [x] 4.2 运行项目 lint，确认 Schema 或相关类型变化没有引入错误。
- [x] 4.3 运行必要的 Prisma migration 和 generate 验证，并记录结果。
- [x] 4.4 明确 Change 2.2、2.3、2.4 的数据依赖和本 Change 的非目标范围。
