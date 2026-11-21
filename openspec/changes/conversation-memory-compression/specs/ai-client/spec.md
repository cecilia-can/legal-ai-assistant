## ADDED Requirements

### Requirement: 应用输出 token 限制
AI 客户端 SHALL 将应用配置的 `CHAT_MAX_OUTPUT_TOKENS` 作为上游聊天模型调用的最大输出限制，并在配置非法或缺失时使用安全默认值。

#### Scenario: 聊天调用执行输出上限
- **WHEN** 应用将最大输出配置为 8192 token 并发起聊天流
- **THEN** 上游模型调用携带等效的最大输出限制，且本地输入预算按同一数值预留

### Requirement: 结构化摘要模型调用
AI 客户端 SHALL 提供与面向用户聊天调用分离的摘要调用能力，并支持将摘要结果解析为受约束的 JSON。

摘要调用 MUST 接收专用 system 指令和待压缩上下文；它 MUST NOT 将其文本作为用户可见 SSE token 转发。

#### Scenario: 成功返回结构化摘要
- **WHEN** 压缩服务提交合法的摘要请求且模型返回可解析 JSON
- **THEN** 客户端将结构化结果返回给压缩服务进行 schema 校验和持久化

#### Scenario: 摘要调用失败
- **WHEN** 摘要模型调用重试后仍失败
- **THEN** 客户端向压缩服务返回可诊断错误，且不会影响正在进行或已完成的用户聊天 SSE 流
