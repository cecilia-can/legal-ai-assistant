## Purpose

Define delete confirmation UX and client-side idempotency for conversation deletion.

## Requirements

### Requirement: 删除会话确认与防竞态
系统 SHALL 在用户删除会话前展示确认对话框，并在 store 层防止重复 DELETE 请求；API 保持「删不存在 → 404」语义不变。

#### Scenario: 确认后执行删除
- **WHEN** 用户在确认对话框点击「确定删除」
- **THEN** 系统调用 `deleteConversation`，成功后关闭对话框并从 UI 移除该会话

#### Scenario: 取消不发起请求
- **WHEN** 用户取消确认对话框
- **THEN** 不调用 DELETE API，会话列表不变

#### Scenario: 进行中忽略重复 delete action
- **WHEN** `deletingId` 已等于目标会话 id
- **THEN** `deleteConversation` 不再发起新的 DELETE

#### Scenario: 404 按幂等成功处理
- **WHEN** DELETE 返回 404
- **THEN** 客户端从本地列表移除该会话（若存在），且不向用户展示「会话不存在。」错误
