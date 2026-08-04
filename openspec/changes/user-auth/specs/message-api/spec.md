## MODIFIED Requirements

### Requirement: 会话消息 API 鉴权
`GET` / `POST` / `DELETE` `/api/conversations/[id]/messages/**` Route Handler MUST 在调用 messageService 前校验 session，并将 `session.user.id` 传入 service 层。

未登录 MUST 返回 401；非 owner MUST 返回 404。

所有 GET Handler MUST 声明 `export const dynamic = "force-dynamic"`。

#### Scenario: 未登录加载消息
- **WHEN** 无 session GET `/api/conversations/[id]/messages`
- **THEN** 返回 HTTP 401

#### Scenario: owner 加载消息成功
- **WHEN** 已登录 owner GET 其会话消息
- **THEN** 返回 HTTP 200 与 envelope 包裹的消息列表

#### Scenario: 非 owner POST 消息
- **WHEN** 已登录用户 POST 到他人 conversationId
- **THEN** 返回 HTTP 404
