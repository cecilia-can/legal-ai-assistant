## Context

项目已经完成 Phase 1 的用户认证和数据隔离。当前 Prisma Schema 使用 Prisma 7 的 `prisma-client` generator、自定义输出目录和 `@prisma/adapter-pg`，数据库为 PostgreSQL。`docker-compose.yml` 已使用 `pgvector/pgvector:pg17` 镜像，但尚未在数据库迁移中显式启用 `vector` 扩展，也没有知识库相关模型。

Phase 2 的文档来源包括法律法规、法律解读、案例和合同模板，原始文件位于项目外部的资料目录。后续导入流程需要同时支持系统公共资料和用户私有资料，并且每个检索结果必须能够追溯到文档、切片、页码或法条编号。

本 Change 只建立数据与数据库基础设施。多格式解析属于 Change 2.2，法律结构切片属于 Change 2.3，实际 Embedding 和向量检索属于 Change 2.4。

## Goals / Non-Goals

**Goals:**

- 建立可支撑系统公共知识库和用户私有知识库的归属边界。
- 建立 `KnowledgeBase`、`Document`、`DocumentChunk` 和 `Embedding` 的稳定关系。
- 为文档来源、版本、解析状态、切片定位和向量模型版本提供持久化字段。
- 在 PostgreSQL 中启用 pgvector，并保留后续使用原生向量查询和索引的能力。
- 通过 Prisma migration 管理数据库结构，能够在空数据库和已有 Phase 1 数据库上安全执行。
- 遵循当前 Prisma 7 generator、数据库适配器和命名约定。

**Non-Goals:**

- 不实现 PDF、DOC、DOCX、HTML 或 TXT 解析。
- 不实现 DOC 转换、OCR、正文清洗或重复页眉页脚清理。
- 不实现法律法规、案例或合同模板的结构识别和切片算法。
- 不批量调用 Embedding 模型，不导入当前 Raw Data 文件。
- 不实现相似度检索、混合检索、Reranking 或 RAG Prompt。
- 不实现知识库管理界面、上传界面或后台任务队列。
- 不修改现有 User、Conversation、Message 的业务行为。

## Decisions

### 1. 在现有 PostgreSQL 上使用 pgvector

**Decision:** 继续使用项目现有 PostgreSQL，在 Prisma migration 中执行 `CREATE EXTENSION IF NOT EXISTS vector`。不额外引入独立向量数据库。

**Rationale:** 项目已经使用 PostgreSQL，Docker 镜像已经是 pgvector 版本。统一关系数据和向量数据可以复用连接、备份、权限和迁移体系，适合当前单应用和学习型 MVP。

**Alternatives considered:**

- 独立部署 Pinecone、Milvus 或 Qdrant：会增加服务、权限、部署和数据同步复杂度，当前阶段没有必要。
- 先不启用 pgvector、只保存 JSON 向量：无法验证后续真实向量查询和索引路径，不采用。

### 2. 使用 KnowledgeBase 作为归属边界

**Decision:** `Document` 必须归属于一个 `KnowledgeBase`；`KnowledgeBase` 保存范围和所有者信息。系统公共知识库使用系统范围且不绑定普通用户，用户私有知识库绑定 `ownerId`。

建议使用以下语义：

```text
KnowledgeBase
  id
  name
  scope: system | user
  ownerId: nullable

Document
  knowledgeBaseId: required
  uploadedByUserId: nullable
```

**Rationale:** 不能把系统公共法律资料错误地归属于某一个用户。将知识库作为边界，可以在保留多用户隔离的同时支持公共法律法规库、用户私有资料库和未来的团队知识库。

**Alternatives considered:**

- 只在 Document 上增加 `userId`：无法自然表达系统公共资料，也容易在后续共享知识库时重新迁移。
- 只使用全局文档、不保存归属：不符合 Phase 1 已建立的数据隔离原则，不采用。

### 3. 将 DocumentChunk 作为一等实体

**Decision:** 单独建立 `DocumentChunk`，而不是把向量直接挂在 `Document` 上。切片保存正文、顺序、章节路径和来源定位信息。

**Rationale:** Embedding 是对切片生成的，不是对整个法律文档生成的。独立切片实体可以支持重新切片、多个 Embedding 模型、来源引用和后续重排。

### 4. 支持同一切片的多个 Embedding 版本

**Decision:** `Embedding` 独立于 `DocumentChunk`，至少保存 `model`、`dimensions`、`contentHash` 和创建时间，并通过组合唯一约束避免同一切片和同一模型的重复记录。

**Rationale:** Embedding 模型可能升级，或者后续需要比较不同模型。将模型信息写入记录可以安全地重新嵌入，而不覆盖历史数据。

### 5. 向量列使用 Prisma Unsupported 类型并保留原生 SQL 边界

**Decision:** 关系元数据使用 Prisma 管理；pgvector 的向量列和后续向量索引使用 Prisma migration 中的原生 SQL，并在 Prisma Schema 中以 `Unsupported` 类型表达。

**Rationale:** Prisma 对 pgvector 的类型和索引表达能力有限。使用原生 SQL 可以准确执行扩展、向量列和后续 HNSW/IVFFlat 索引，同时仍保留 Prisma 对其他字段和关系的类型安全。

本 Change 不固定最终 Embedding 模型，但必须保存向量维度。具体向量索引参数和模型选择推迟到 Change 2.4，避免在切片和模型尚未确定时锁定错误的索引配置。

### 6. 软删除和状态字段先用于可观测性，不实现完整回收站

**Decision:** Document 和 Embedding 保存处理状态、错误信息、版本和时间字段；本 Change 不实现完整的软删除、审计日志或回收站。

**Rationale:** 后续导入任务需要区分待处理、成功、失败和需要重新处理的记录。完整的文档生命周期和回收站属于知识库管理阶段，当前只预留可扩展字段。

## Data Model Sketch

```text
User (existing)
  └── KnowledgeBase (ownerId nullable for system scope)
        └── Document
              └── DocumentChunk
                    └── Embedding (model + dimensions + vector)
```

关键关系与约束：

- KnowledgeBase 删除时级联删除其 Document、DocumentChunk 和 Embedding。
- Document 删除时级联删除其 DocumentChunk 和 Embedding。
- DocumentChunk 的 `(documentId, ordinal)` 唯一，保证同一文档内切片顺序稳定。
- Embedding 的 `(chunkId, model, contentHash)` 唯一，避免同一切片内容和同一模型重复生成向量，同时允许内容变更后保留新的向量版本。
- 所有业务数据通过 KnowledgeBase 归属范围进行查询，服务层不得仅依赖客户端传入的 ID。

## Risks / Trade-offs

- [Risk] Prisma 对 pgvector 的支持不完整 → 用原生 SQL migration 管理扩展、向量列和索引，并增加迁移验证。
- [Risk] Embedding 维度尚未最终确定 → 记录模型和维度，向量索引参数推迟到 Change 2.4。
- [Risk] 系统公共资料与用户私有资料的权限边界实现不完整 → 在 KnowledgeBase 层保存 scope/ownerId，并要求后续服务层按知识库范围校验。
- [Risk] 级联删除可能删除大量知识库数据 → 本阶段只验证开发环境，管理界面阶段再增加确认、软删除或异步删除策略。
- [Trade-off] 暂不实现向量检索 → 先保证数据模型可迁移和可扩展，避免在切片策略和模型选择前固化检索实现。

## Migration Plan

1. 确认当前本地数据库使用 `pgvector/pgvector:pg17` 或已安装 `vector` 扩展的 PostgreSQL。
2. 更新 Prisma Schema，增加知识库相关模型和关系。
3. 创建 Prisma migration，显式执行 `CREATE EXTENSION IF NOT EXISTS vector`。
4. 在迁移中创建 pgvector 向量列；向量索引待 Change 2.4 根据模型维度和查询策略创建。
5. 运行 `npx prisma migrate dev` 和 `npx prisma generate`。
6. 执行基础读写验证，确认已有 User、Conversation 和 Message 数据不受影响。

**Rollback:** 本地开发阶段如果迁移未应用，可删除未应用迁移并恢复 Schema；如果迁移已应用，应通过反向 migration 删除新增表和扩展。不得使用数据库 reset 处理包含真实用户数据的环境。

## Open Questions

- 系统公共知识库的默认名称和初始化方式是否在 Change 2.2 决定。
- Change 2.4 最终采用的 Embedding 模型、维度和向量索引类型需要在生成向量前确定。
- 原始文件的存储路径由导入 Change 决定；本 Change 只保存稳定的来源标识，不把项目外部绝对路径作为业务归属依据。
