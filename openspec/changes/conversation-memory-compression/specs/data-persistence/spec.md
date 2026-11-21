## ADDED Requirements

### Requirement: 会话记忆与压缩任务持久化
系统 SHALL 在 PostgreSQL/Prisma 中持久化 `ConversationMemory` 与可重试的会话记忆压缩任务，并将它们关联到唯一的会话。

`ConversationMemory` MUST 对同一 `conversationId` 保持唯一性；压缩任务 MUST 保存状态、尝试次数、来源消息范围、错误详情与时间戳。会话删除 MUST 级联删除这些派生数据。

#### Scenario: 同一会话只保留一条当前记忆
- **WHEN** 系统为同一会话连续写入两次有效记忆
- **THEN** 数据库保留一条当前记忆并通过 revision 区分更新顺序

#### Scenario: 压缩失败可诊断且可重试
- **WHEN** 摘要模型或校验导致压缩任务失败
- **THEN** 任务记录失败状态、尝试次数和可诊断错误，且原始消息和上一有效记忆保持不变

### Requirement: 会话回溯数据隔离与索引
系统 SHALL 持久化会话回溯片段及其向量，并为按 `conversationId` 查询、模型版本过滤和向量相似度检索建立必要索引。

回溯片段 MUST 通过会话归属间接受用户权限约束；服务层查询 MUST 同时验证 `conversationId` 与用户身份。

#### Scenario: 回溯查询使用会话范围索引
- **WHEN** 系统为当前会话查询相关回溯片段
- **THEN** 查询按 `conversationId` 和索引模型范围过滤，再执行向量相似度排序
