## ADDED Requirements

### Requirement: Message 分页索引
系统 SHALL 为消息按会话分页查询提供数据库索引支持。

Prisma `Message` 模型 MUST 包含 `@@index([conversationId, createdAt])`（或等价复合索引），并通过 Prisma Migrate 落地。

#### Scenario: 迁移后索引可用
- **WHEN** 开发者应用本 Change 相关 migration
- **THEN** 数据库中存在支持按 `conversationId` + `createdAt` 查询的索引

#### Scenario: 无破坏性数据变更
- **WHEN** 应用仅增加该索引的 migration
- **THEN** 既有 `Conversation` / `Message` 行数据保持可读可写，无需 reset 数据库
