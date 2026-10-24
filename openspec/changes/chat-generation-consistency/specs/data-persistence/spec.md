## ADDED Requirements

### Requirement: 生成任务数据模型
系统 SHALL 在 Prisma 数据模型中定义与 Conversation、Message 关联的生成任务模型。

该模型 MUST 包含会话关联、用户消息关联、助手消息关联、客户端请求 ID、状态、失败原因、开始时间和完成时间，并为按会话查询状态及幂等请求查询提供索引或唯一约束。

#### Scenario: 应用迁移后查询生成任务
- **WHEN** 开发者应用本 Change 的 Prisma migration
- **THEN** 数据库可以按会话查询生成任务，并拒绝同一会话与请求 ID 的重复任务记录
