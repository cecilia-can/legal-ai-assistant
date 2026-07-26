## Purpose

Define the DeepSeek / OpenAI Compatible AI client configuration, streaming completion wrapper, and limited retry behavior.

## Requirements

### Requirement: AI 客户端环境配置
系统 SHALL 通过环境变量配置 DeepSeek / OpenAI Compatible 客户端。

- MUST 读取 `OPENAI_API_KEY`；缺失时流式 API MUST 返回可读错误。
- SHOULD 支持 `OPENAI_BASE_URL`，默认 `https://api.deepseek.com`。
- SHOULD 支持 `OPENAI_MODEL`，默认 `deepseek-chat`。
- `.env.example` MUST 文档化上述变量，且不包含真实密钥。

#### Scenario: 缺少 API Key
- **WHEN** `OPENAI_API_KEY` 未配置且客户端请求 `/api/chat`
- **THEN** 接口在流开始前返回 JSON 错误 envelope，HTTP 状态码为 500，message 说明配置缺失

#### Scenario: 使用 DeepSeek 默认端点
- **WHEN** 仅配置 `OPENAI_API_KEY` 而未设置 `OPENAI_BASE_URL`
- **THEN** AI 客户端使用 `https://api.deepseek.com` 作为 base URL

### Requirement: 流式 Chat Completions 封装
系统 SHALL 在 `lib/ai/client.ts` 提供流式 completion 能力。

- MUST 使用 `openai` npm SDK。
- MUST 支持传入 `{ role, content }[]` 消息数组（role 为 `user` | `assistant`）。
- MUST 返回可迭代的 stream（SDK async iterator 或封装后的 AsyncIterable）。
- 本阶段 MUST NOT 注入法律 System Prompt（留待 Change 1.7）。

#### Scenario: 发起流式 completion
- **WHEN** 调用客户端流式函数并传入合法 messages
- **THEN** 返回来自模型的 stream，可逐 chunk 读取 assistant 文本 delta

### Requirement: 可重试错误处理
AI 客户端 SHALL 对 transient 错误实施有限重试。

- 对 HTTP 429 与 5xx MUST 最多重试 1 次。
- 重试前 SHOULD 有简单固定延迟（如 500ms）。
- 对 401、403、400 等 4xx MUST NOT 重试。

#### Scenario: 429 后重试成功
- **WHEN** 首次请求返回 429 且重试后成功
- **THEN** 客户端返回正常 stream，不向上抛出首次 429

#### Scenario: 401 不重试
- **WHEN** API Key 无效导致 401
- **THEN** 客户端立即失败，不进行重试
