## MODIFIED Requirements

### Requirement: 流式 Chat Completions 封装
系统 SHALL 在 `lib/ai/client.ts` 提供流式 completion 能力。

- MUST 使用 `openai` npm SDK。
- MUST 支持传入 `{ role, content }[]` 消息数组，其中 `role` 为 `system` | `user` | `assistant`。
- MUST 返回可迭代的 stream（SDK async iterator 或封装后的 AsyncIterable）。
- 调用方（Route Handler + context 层）MUST 在传入前完成 System Prompt 注入与历史裁剪；客户端 MUST NOT 直接传入 `system` 消息。
- 流式请求 MUST 设置 `stream_options: { include_usage: true }`，以便 Route Handler 在流结束时读取官方 Token 统计。

#### Scenario: 流式响应包含 usage chunk
- **WHEN** 调用流式 completion 且上游支持 include_usage
- **THEN** stream 在结束前 MUST 出现至少一个含非空 `usage` 字段的 chunk，供调用方记录 `prompt_tokens` 与 `completion_tokens`

#### Scenario: 发起含 system 的流式 completion
- **WHEN** 调用客户端流式函数并传入以 system 开头、后接 user/assistant 的合法 messages
- **THEN** 返回来自模型的 stream，可逐 chunk 读取 assistant 文本 delta

#### Scenario: 发起仅 user/assistant 的流式 completion
- **WHEN** 调用方未注入 system 而仅传入 user/assistant（绕过 context 层）
- **THEN** 该场景由 Route Handler 保证不发生；若测试直接调用 client，行为由调用方负责
