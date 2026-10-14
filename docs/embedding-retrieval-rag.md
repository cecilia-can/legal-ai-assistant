# Embedding、向量检索与 RAG

本阶段只处理 `DocumentChunkSet.status = active` 的切片。每个向量以 `chunkId + model + contentHash` 唯一标识；相同输入重复运行不会重复调用模型或写入重复记录。默认模型为 `text-embedding-3-small`，维度为 1536。更换模型或维度前，必须新增对应迁移和 pgvector 索引，不能混用不同维度的向量。

## 配置

将以下服务端变量写入本机 `.env`，不要提交真实密钥，也不要使用 `NEXT_PUBLIC_` 前缀：

- `EMBEDDING_API_KEY`：Embedding 服务凭证，必填。
- `EMBEDDING_BASE_URL`：兼容 OpenAI Embeddings API 的地址，默认 `https://api.openai.com/v1`。
- `EMBEDDING_MODEL`、`EMBEDDING_DIMENSIONS`：模型与固定维度，默认分别为 `text-embedding-3-small` 和 `1536`。
- `EMBEDDING_BATCH_SIZE`、`EMBEDDING_MAX_RETRIES`：批大小和暂时性失败的重试上限。
- `RAG_ENABLED`：只有设置为 `true` 时聊天路由才会调用检索；默认关闭以保持未配置向量服务时的既有聊天行为。
- `RAG_TOP_K`、`RAG_MIN_SIMILARITY`、`RAG_MAX_CHUNK_CHARACTERS`、`RAG_MAX_CONTEXT_CHARACTERS`：检索和上下文的边界。

## 迁移与向量化

先在目标数据库运行 `npx prisma migrate deploy`，再运行 `npx prisma generate`。迁移只增加 `EmbeddingTask` 与默认模型的 HNSW 部分索引，不会重置、删除或回填原有用户、会话、文档和切片数据。

通过以下命令处理已授权范围内缺少向量的活动切片：

```powershell
npm run embed:documents -- --user-id <userId> --knowledge-base <knowledgeBaseId>
```

可用 `--document <documentId>` 收窄为一个文档。任务会记录进度、失败项和状态；重新执行会跳过已存在同一内容哈希与模型的向量，只尝试缺失或失败项。

## 检索与来源

系统知识库对已认证用户可读；私有知识库只对 owner 可读。检索在服务端强制这些条件，再过滤活动切片集、模型和维度。所有向量值、筛选条件和数量均通过参数化 SQL 传递。

聊天只接受服务端按会话身份检索到的资料。上下文为有限长度的 `[来源N]` 证据包，包含文档标题、章节和页码；模型被要求仅在证据支持时回答并引用标签。没有足够资料时不得伪造来源，应明确说明知识库无法确认。

运行 `npm run verify:embedding-rag` 可验证向量格式和来源上下文构建的核心场景。

## 本地验证记录（2026-10-12）

- `npm run verify:embedding-rag`：通过。
- `npx prisma validate`：通过。
- `npx prisma generate`：已生成客户端。
- `npm run lint`、`npm run build`：通过。
- 数据库迁移：已在健康的 `legal-ai-postgres` pgvector 容器中以单一事务成功执行，并已记录至 `_prisma_migrations`。已确认 `EmbeddingTask` 表、三个任务索引与 `Embedding_text_embedding_3_small_hnsw_idx` HNSW 索引存在。
- 注意：更早的 `20260903090000_add_document_chunk_sets` 留有一条已回滚的历史迁移记录；Prisma 7 schema engine 会因此返回空错误，即使该迁移随后已有成功记录。后续迁移前应先修复该历史记录或升级/排查 Prisma engine，再恢复使用 `prisma migrate deploy` 自动执行。
