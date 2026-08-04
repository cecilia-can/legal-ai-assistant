## ADDED Requirements

### Requirement: User 数据模型
系统 SHALL 在 Prisma Schema 中新增 Auth.js 标准 `User` 模型。

`User` MUST 至少包含：`id`、`name`（可选）、`email`（唯一）、`emailVerified`、`image`（可选）、`password`（Credentials 哈希，可选于 OAuth-only 用户）、`createdAt`、`updatedAt`。

#### Scenario: 创建 Credentials 用户
- **WHEN** 注册流程创建用户
- **THEN** 数据库持久化 `email` 与 `password` 哈希，`email` 唯一

### Requirement: Auth.js 关联表
系统 SHALL 新增 `Account`、`Session`、`VerificationToken` 模型，符合 Auth.js Prisma Adapter 规范。

本阶段 session 策略为 JWT，`Session` 表 MAY 暂不被写入，但 schema MUST 存在以便 Change 1.9.1 启用 OAuth / database session。

#### Scenario: Migration 创建 Auth 表
- **WHEN** 应用 `add_user_auth` migration
- **THEN** 数据库存在 `User`、`Account`、`Session`、`VerificationToken` 表

### Requirement: Conversation 用户归属
`Conversation` 模型 MUST 增加必填字段 `userId`，外键引用 `User.id`。

MUST 包含复合索引 `@@index([userId, updatedAt])`。

删除 User 时 Conversation 的处理 MUST 通过 `onDelete` 策略明确（建议 Cascade 或 Restrict——实现时在 migration 中固定一种）。

#### Scenario: 创建会话绑定当前用户
- **WHEN** 已登录用户 POST 创建会话
- **THEN** 新 `Conversation.userId` 等于 `session.user.id`

#### Scenario: 按用户查询会话列表
- **WHEN** 已登录用户请求会话列表
- **THEN** 仅返回 `userId` 匹配的会话

## MODIFIED Requirements

### Requirement: Conversation data model
The system SHALL define a `Conversation` model in Prisma for storing chat sessions.

The `Conversation` model MUST include:

- `id`: unique string identifier generated with `cuid()`
- `userId`: required foreign key referencing `User.id`
- `title`: string title with default value `"New Chat"`
- `createdAt`: creation timestamp generated automatically
- `updatedAt`: update timestamp maintained automatically
- `messages`: relation to associated `Message` records
- `user`: relation to owning `User`

#### Scenario: Create conversation with defaults
- **WHEN** an authenticated user creates a new `Conversation` without an explicit title
- **THEN** the database stores the record with an auto-generated `id`, the caller's `userId`, a default `title` of `"New Chat"`, and generated timestamps

#### Scenario: Update conversation timestamp
- **WHEN** an existing `Conversation` record is updated
- **THEN** the `updatedAt` field is refreshed automatically
