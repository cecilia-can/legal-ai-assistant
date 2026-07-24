## 为什么

Change 1.3 的会话 API 目前成功时直出业务 JSON、失败时返回 `{ error: "..." }`，前后端缺少统一的响应信封结构。随着 Change 1.4/1.5 将新增更多 Route Handler，需要在实现新接口前统一 `{ data, code, message }` 约定，避免各 API 各自为政、前端 store 重复编写解析逻辑。

## 变更内容

- 新增 `lib/api/api-response.ts`，提供统一的 `ApiResponse<T>` 类型与 `jsonSuccess` / `jsonError` 辅助函数。
- **BREAKING**：所有现有 JSON API 成功/失败响应 MUST 包装为 `{ code, message, data }`。
- 成功时 `code` 为 `0`，`message` 为 `"success"`，业务数据放在 `data`。
- 失败时 `code` 与 HTTP 状态码一致（如 400/404/500），`message` 为可读错误文案，`data` 为 `null`；HTTP 状态码仍保留。
- 更新 `app/api/conversations/` 全部路由以使用统一 envelope。
- 更新 `lib/stores/conversationStore.ts`，从 envelope 的 `data` / `message` 解析响应。
- 删除旧的 `{ error: "..." }` 与 `{ ok: true }` 直出格式。

## 能力范围

### 新增能力

- `api-response`: 定义全项目 JSON API 的统一响应信封结构、成功/失败语义与辅助函数行为。

### 修改能力

- `conversation-api`: 会话 CRUD 各接口的成功/失败响应格式改为 envelope。
- `conversation-state`: store 从 envelope 解析业务数据与错误信息，替代旧的 `{ error }` / 直出 JSON。

## 影响范围

- 影响代码：`lib/api/api-response.ts`、`lib/api/conversation-response.ts`（类型引用，无 envelope 逻辑）、`app/api/conversations/`、`lib/stores/conversationStore.ts`。
- 影响体验：无 UI 行为变化；仅 API 与 store 数据解析层变更。
- 依赖影响：不新增 npm 依赖；不修改 Prisma schema；不新增 migration。
- 系统影响：本 Change 为 **破坏性 API 变更**；当前仅本项目前端消费这些接口，同步改 store 即可。
