## ADDED Requirements

### Requirement: 会话级结构化记忆
系统 SHALL 为每个会话持久化至多一条当前有效的结构化记忆，且原始 `Message` 记录 MUST 保持完整、可独立读取。

记忆 MUST 包含 `schemaVersion`、`summary`、`topics`、`conclusions`、`openQuestions`、`coveredUntilMessageId`、`sourceMessageIds`、`revision` 与时间戳。记忆 MAY 包含 `case` 块；其中事实 MUST 标记为 `user_stated`、`document_supported` 或 `uncertain`，并带有来源消息标识。

#### Scenario: 普通法律问答建立通用记忆
- **WHEN** 会话的早期普通法律问答被压缩
- **THEN** 系统保存通用主题、已讨论结论和待解决问题，且不要求创建 `case` 块

#### Scenario: 个案事实保留来源与状态
- **WHEN** 被压缩消息中包含用户陈述的案件事实
- **THEN** 记忆中的事实标记为 `user_stated` 或 `uncertain`，并关联至少一条来源消息 ID

### Requirement: 摘要输出校验与版本保护
系统 SHALL 使用运行时 schema 校验模型生成的记忆 JSON，且仅在校验通过、来源范围连续并且版本未冲突时覆盖当前有效记忆。

校验失败、解析失败或并发冲突时，系统 MUST 保留上一有效记忆和原始消息，并记录可诊断的失败状态。

#### Scenario: 合法摘要替换旧记忆
- **WHEN** 增量摘要输出满足 schema 且覆盖游标连续
- **THEN** 系统以新内容和递增 revision 原子更新会话记忆

#### Scenario: 非法摘要不污染记忆
- **WHEN** 摘要模型返回非 JSON、缺失必填字段或含非法事实状态
- **THEN** 系统不更新当前有效记忆，且原始消息仍可用于后续重试或重建

### Requirement: 增量压缩任务
系统 SHALL 仅压缩尚未被当前记忆覆盖、且即将退出近期原文上下文的连续历史消息。

压缩输入 MUST 包含上一有效记忆（若存在）和待压缩消息；压缩输出 MUST 推进 `coveredUntilMessageId`。系统 MUST 将压缩任务及其状态持久化，不能依赖请求结束后的非持久化后台 Promise。

#### Scenario: 软阈值触发持久化压缩任务
- **WHEN** 预估上下文输入达到配置输入预算的软阈值且存在可压缩历史
- **THEN** 系统创建一项可重试的压缩任务，并保留近期原文消息不进入该任务

#### Scenario: 硬预算前同步压缩
- **WHEN** 当前请求无法在硬输入预算内容纳必要的系统规则、最新用户消息和近期历史
- **THEN** 系统先完成或复用有效的压缩结果，再发起聊天模型调用

### Requirement: 记忆失效与重建
删除会话时，系统 MUST 级联删除其会话记忆和压缩任务。删除被记忆引用的消息时，系统 MUST 将受影响记忆标记为待重建或删除，且不得继续将其作为有效上下文使用。

#### Scenario: 删除会话清理派生记忆
- **WHEN** 用户删除自己拥有的会话
- **THEN** 该会话的原始消息、会话记忆、压缩任务和回溯数据均不再可访问

#### Scenario: 删除摘要来源消息
- **WHEN** 用户删除一条被当前会话记忆引用的消息
- **THEN** 系统在下一次上下文构建前不再使用该记忆，直到其从剩余原文重建成功
