## MODIFIED Requirements

### Requirement: conversationStore API 错误处理
`conversationStore` 在解析 API 响应时 SHALL 区分 HTTP 401 与其他错误。

收到 401 MUST 触发登出或重定向至 `/login`，MUST NOT 仅设置 `error` 红字。

fetch 请求 SHOULD 使用 `credentials: "include"` 以携带 session cookie。

#### Scenario: session 过期加载列表
- **WHEN** `fetchConversations` 收到 401
- **THEN** 用户被引导至登录页，而非侧栏显示「无法加载会话列表」

#### Scenario: 网络错误仍可重试
- **WHEN** `fetchConversations` 收到 500
- **THEN** store 设置 `error` 且 InlineError 可提供重试
