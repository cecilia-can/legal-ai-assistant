## ADDED Requirements

### Requirement: 服务端生成任务持久化
系统 SHALL 为每一轮服务端发起的 AI 回复创建可持久化的生成任务，并将其关联到所属会话、用户消息和助手消息。

生成任务 MUST 记录请求 ID、状态、开始时间和终止时间；状态 MUST 为 `generating`、`completed`、`cancelled` 或 `failed` 之一。失败任务 MUST 记录可安全展示的失败原因代码。

#### Scenario: 原子创建一轮生成
- **WHEN** 已登录用户向其拥有的会话提交合法聊天请求
- **THEN** 服务端在同一事务中创建用户消息、空助手消息和状态为 `generating` 的生成任务，再调用上游模型

#### Scenario: 初始创建失败时回滚
- **WHEN** 创建用户消息、助手消息或生成任务中的任一数据库操作失败
- **THEN** 服务端回滚该事务、不调用上游模型，并且不保留该轮的部分记录

### Requirement: 生成任务终态持久化
系统 SHALL 在生成任务结束时持久化已接收的助手文本及其终态。

系统 MUST 仅在成功完成时将任务设为 `completed`；用户取消 MUST 设为 `cancelled`；超时、上游异常或非预期断流 MUST 设为 `failed`。

#### Scenario: 成功完成更新回复
- **WHEN** 上游模型正常结束且服务端发送 `done`
- **THEN** 服务端保存完整助手文本并将生成任务设为 `completed`

#### Scenario: 用户取消保留已接收文本
- **WHEN** 用户取消正在生成的回复且服务端已接收部分文本
- **THEN** 服务端停止上游调用、保存已接收文本，并将生成任务设为 `cancelled`

#### Scenario: 超时记录失败状态
- **WHEN** 上游调用超过配置的业务超时
- **THEN** 服务端中止上游调用、将生成任务设为 `failed`，并保存超时失败原因
