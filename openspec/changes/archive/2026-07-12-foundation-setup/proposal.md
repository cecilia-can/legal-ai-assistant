## Why

法律 AI 助手项目已经完成 Next.js 脚手架初始化，但还缺少可持久化聊天数据的基础设施和稳定的代码组织边界。Change 1.1 需要先建立数据库、Prisma Client 和基础目录结构，为后续会话管理、AI 对话、消息持久化和法律知识库能力打底。

## What Changes

- 在 Prisma Schema 中定义聊天会话和消息的基础数据模型。
- 通过 PostgreSQL `DATABASE_URL` 配置数据库连接。
- 提供可复用的 Prisma Client 单例入口，供 Route Handlers、Server Actions 和服务层使用。
- 建立 `components/`、`lib/`、`types/` 等基础目录结构，为后续 ChatBot 功能分层。
- 提供 `.env.example`，说明本地开发所需环境变量。
- 明确项目早期的共享聊天类型和命名规范。

## Capabilities

### New Capabilities

- `data-persistence`: 定义 PostgreSQL/Prisma 数据持久化能力，包括 `Conversation`、`Message`、数据库连接和迁移验证。
- `project-structure`: 定义项目基础目录、共享类型文件和环境变量模板规范。

### Modified Capabilities

- 无。当前项目尚无已归档的主 spec，本变更只新增能力。

## Impact

- Affected code: `prisma/schema.prisma`、`prisma.config.ts`、`lib/db.ts`、`types/chat.ts`、`.env.example`。
- Affected directories: `components/chat/`、`components/layout/`、`components/ui/`、`lib/ai/`、`lib/hooks/`、`lib/services/`、`types/`。
- Dependencies: 复用当前已安装的 `prisma`、`@prisma/client` 和 `dotenv`，不要求新增 npm 依赖。
- Systems: 需要可用 PostgreSQL 数据库，供本地迁移和 Prisma Client 生成验证使用。
