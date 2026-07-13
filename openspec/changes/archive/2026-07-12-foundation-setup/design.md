## Context

项目当前处于 Phase 1 ChatBot 的起点，已由 `create-next-app` 生成 Next.js App Router、React、TypeScript、Tailwind CSS 和 ESLint 基础结构。项目已安装 `prisma`、`@prisma/client` 和 `dotenv`，并存在 `prisma/schema.prisma` 与 `prisma.config.ts`。

当前 Prisma 配置使用 Prisma 7 风格：`prisma.config.ts` 负责从 `DATABASE_URL` 读取 datasource URL，`schema.prisma` 中 datasource 只声明 `provider = "postgresql"`。Prisma Client 生成路径已配置为 `app/generated/prisma`，后续实现需要沿用该路径。

本变更为后续 Change 1.2 UI 组件、Change 1.3 会话管理、Change 1.4 AI API 集成和 Change 1.5 消息持久化提供基础边界。

## Goals / Non-Goals

**Goals:**

- 定义可支撑多会话聊天的 `Conversation` 和 `Message` 数据模型。
- 使用 PostgreSQL 作为 Phase 1 的持久化数据库。
- 提供全局复用的 Prisma Client 单例，避免 Next.js 开发环境热重载时重复创建连接。
- 建立基础目录结构，使后续 UI、hooks、services、AI 客户端和共享类型有明确归属。
- 提供 `.env.example`，让新开发者能快速配置本地环境。

**Non-Goals:**

- 不实现聊天 UI、布局组件或设计系统，这些属于 Change 1.2。
- 不实现会话 CRUD API 或前端状态管理，这些属于 Change 1.3。
- 不集成 OpenAI Compatible API、流式响应或 Prompt 逻辑，这些属于 Change 1.4 及之后。
- 不实现消息分页、检索、RAG、pgvector 或长期记忆能力。
- 不引入认证、用户表、多租户或权限模型。

## Decisions

### 1. 使用 `Conversation` 与 `Message` 作为第一批业务模型

**Decision:** 定义 `Conversation` 和 `Message` 两个模型，`Conversation` 与 `Message` 为一对多关系，删除会话时级联删除其消息。

```prisma
model Conversation {
  id        String    @id @default(cuid())
  title     String    @default("New Chat")
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt
  messages  Message[]
}

model Message {
  id             String       @id @default(cuid())
  conversationId String
  role           String
  content        String       @db.Text
  createdAt      DateTime     @default(now())
  conversation   Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)
}
```

**Rationale:** Phase 1 的核心是 ChatBot，多会话与多消息是最小必要数据结构。先保持模型简单，避免在第一步引入用户、案件、知识库等未来概念。

**Alternatives considered:**

- 单表存储所有聊天记录：查询历史会话和后续会话管理会更混乱，因此不采用。
- 提前加入 `User`、`Case`、`Workspace`：会扩大 Change 1.1 范围，和渐进式交付原则冲突。

### 2. `role` 使用 String 而不是数据库 Enum

**Decision:** `Message.role` 使用 `String`，应用层通过 `MessageRole = "user" | "assistant" | "system"` 约束早期取值。

**Rationale:** ChatBot 早期只需要三种角色，但后续可能加入 `tool`、`developer` 或模型供应商特定角色。String 能减少早期迁移成本。

**Alternatives considered:**

- Prisma Enum：数据库约束更强，但未来扩展角色需要迁移，不适合当前快速演进阶段。

### 3. 消息正文使用 PostgreSQL Text

**Decision:** `Message.content` 使用 `String @db.Text`。

**Rationale:** 法律咨询和 AI 回答可能包含长文本、Markdown 和代码片段，普通 varchar 长度不适合。

### 4. 保持 Prisma Client 生成路径为 `app/generated/prisma`

**Decision:** 沿用当前 `schema.prisma` 的 generator 输出路径 `../app/generated/prisma`，`lib/db.ts` 从该路径导入 `PrismaClient`。

**Rationale:** 这是当前项目脚手架已经生成的配置，也符合本项目使用 Prisma 7 的现状。Change 1.1 不做无关迁移。

**Alternatives considered:**

- 改回传统 `@prisma/client` 默认导入：会与当前 generator 配置不一致，需要额外调整，不适合作为第一步。

### 5. 通过 `lib/db.ts` 暴露 Prisma Client 单例

**Decision:** 在 `lib/db.ts` 中创建并导出 `prisma`，开发环境下通过 `globalThis` 缓存实例。

**Rationale:** Next.js 开发服务器热重载会重复执行模块初始化。如果每次都创建新的 Prisma Client，容易出现数据库连接过多问题。

### 6. 基础目录按功能域预留

**Decision:** 创建以下目录：

```text
components/
  chat/
  layout/
  ui/
lib/
  ai/
  hooks/
  services/
types/
```

**Rationale:** 路线图中的 Change 1.2 到 Change 1.5 已经明确会产生聊天组件、布局组件、hooks、AI 客户端、服务层和共享类型。提前建立目录能减少后续文件归属争议。

## Risks / Trade-offs

- [Risk] 本地没有 PostgreSQL 实例 → 在 `.env.example` 中提供标准连接串示例，开发者可使用本地 PostgreSQL、Docker、Neon 或 Supabase。
- [Risk] Prisma 7 与旧版 Prisma 文档差异较大 → 实现时以当前项目 `prisma.config.ts` 和本地 Next.js/Prisma 文档为准。
- [Risk] `role` 无数据库级枚举约束 → Phase 1 先由 TypeScript 类型和服务层校验约束；如后续稳定可迁移为 Enum。
- [Risk] 级联删除会永久删除消息 → Phase 1 没有审计和回收站需求，先采用硬删除；案件工作空间阶段再评估软删除。
- [Trade-off] 不做复杂索引设计 → 初期数据量小，仅保留必要关系；分页和性能优化放到消息持久化阶段处理。

## Migration Plan

1. 创建 `.env.example`，说明 `DATABASE_URL` 的 PostgreSQL 格式。
2. 开发者复制 `.env.example` 为 `.env`，填入真实数据库连接。
3. 更新 `prisma/schema.prisma`，加入 `Conversation` 和 `Message` 模型。
4. 运行 `npx prisma migrate dev --name init` 创建初始迁移。
5. 运行 `npx prisma generate` 生成 Prisma Client。
6. 通过 `lib/db.ts` 导入 `prisma` 并执行简单查询验证连接。

**Rollback:** 当前无生产数据。若迁移失败，可删除未应用的迁移目录，恢复 `schema.prisma`，并重新运行迁移。

## Open Questions

- 本地 PostgreSQL 运行方式由开发者决定：本机服务、Docker、Neon 或 Supabase 均可。
