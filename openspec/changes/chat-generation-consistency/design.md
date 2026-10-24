## Context

当前系统在浏览器收到 SSE `done` 后，调用会话消息 API，以事务批量创建 user 与 assistant 消息。`/api/chat` 只读历史并调用模型。该分工无法持久化生成中的任务；浏览器刷新、断流或重复请求时，服务端无法判断本轮是否已创建、是否完成，以及是否应重试。

本 Change 涉及 Prisma 数据模型、聊天 API、SSE 协议、AI 客户端、服务层和客户端状态。现有 `Conversation` 与 `Message` 是真实对话内容的唯一来源；用户级会话归属校验必须继续生效。

## Goals / Non-Goals

**Goals:**

- 在服务端持久化一次 AI 生成的生命周期，并将其与 user/assistant 消息关联。
- 保证一次请求的初始记录原子创建，并通过请求 ID 防止重复创建。
- 保证同一会话在任一时刻最多运行一轮生成。
- 明确定义 SSE 正常完成、取消、超时和失败的终态。
- 使旧回复在重新生成失败或取消时仍然可用。

**Non-Goals:**

- 不引入 Redis、消息队列或跨实例分布式限流。
- 不实现恢复已被服务端进程终止的上游流，也不承诺浏览器重新连接到原 SSE。
- 不改变不同会话可并行生成的行为。
- 不在本 Change 实现回复版本历史的用户界面。

## Decisions

### 以 ChatRun 表表示一次生成

新增 `ChatRun`，持有 `conversationId`、`userMessageId`、`assistantMessageId`、`clientRequestId`、`status`、`failureReason`、`startedAt` 和 `completedAt`。`Message` 继续仅保存可展示的对话内容。

选择独立表而非向 `Message` 增加大量运行字段，因为取消、请求 ID、错误原因和模型运行时间属于“一轮调用”而不是静态消息；该设计也为未来回复版本保留扩展位置。

### 服务端在生成前原子创建初始记录

`POST /api/chat` 验证归属、请求 ID 与会话可生成状态后，使用一个 Prisma 事务创建 user 消息、空 assistant 消息和 `ChatRun(generating)`，再开始调用模型。终态时更新已有 assistant 内容和 ChatRun，不再由浏览器另行提交整轮消息。

选择先创建占位记录而非在流结束后整体创建，以保证断开后仍可查询任务。流式 token 不逐 token 写库，服务端在终态写入完整已接收文本，以避免高频数据库更新。

### 请求 ID 唯一性与会话级串行

`@@unique([conversationId, clientRequestId])` 是同一次客户端请求的幂等边界。服务端遇到唯一冲突时查询并返回现有任务，不启动第二次模型调用。

同一会话的运行中任务由事务内检查与数据库并发保护共同保证；实现可采用对 Conversation 行的 PostgreSQL 行锁，再检查 `ChatRun.status = generating`。不同会话不加锁。

仅依赖前端禁用发送会在多标签页、重试或直接调用 API 时失效；仅检查而不加锁会产生两个并发请求同时通过检查的竞态。

### 终态与 SSE 成功语义

`done` 是成功的唯一 SSE 终态。客户端或服务端读流结束但未收到 `done` 时，任务不得标为 completed。用户主动停止为 `cancelled`；超时、上游异常及非预期断流为 `failed`，并保存受控错误码。请求取消信号必须传递至模型 SDK，并设置首 token 与整轮超时。

### 安全的重新生成

重新生成创建新的 ChatRun 和候选 assistant 消息。旧回复和后续消息在候选回复成功前不删除；成功后再由服务端单一事务完成替换或分支截断。

## Risks / Trade-offs

- [长流在服务端进程重启时无法继续] → 将任务标为 failed，并保留用户问题和已收到内容。
- [会话行锁降低同一会话吞吐] → 该限制符合单线程对话语义；不同会话不受影响。
- [空 assistant 占位可能被历史查询读到] → 查询与前端展示须识别 generating/failed 状态，避免将空内容作为已完成回答。
- [上游取消传播受部署平台限制] → 仍配置业务总超时，并将断开视为可持久化终态。

## Migration Plan

1. 新增 ChatRun 模型、外键、状态索引和请求 ID 唯一约束的 Prisma migration。
2. 部署可兼容读取旧 Message 数据的代码；旧消息没有 ChatRun 时按已完成历史展示。
3. 切换 `/api/chat` 为服务端创建初始记录和服务端终态写入。
4. 移除前端生成结束后调用批量消息保存 API 的路径，保留现有消息 CRUD 用于非聊天场景。
5. 若需回滚，停止新建 ChatRun 并恢复旧写入路径；已创建的 ChatRun 与 Message 不需删除。

## Open Questions

- 首 token、流空闲和整轮超时的具体数值应根据 DeepSeek 配额及真实监控数据确定。
- 重新生成成功后，是物理删除旧分支，还是保留版本记录，需在实现前确定产品行为。
