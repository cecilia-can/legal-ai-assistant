## 背景

Change 1.3 已实现会话 REST API 与 Zustand store，但响应体格式不统一：成功直出 `ConversationJson` 或数组，失败返回 `{ error }`，DELETE 成功返回 `{ ok: true }`。`lib/api/api-response.ts` 已存在初步封装，但尚未输出 envelope 结构。

## 目标 / 非目标

**目标：**

- 为所有 JSON Route Handler 建立统一的 `{ code, message, data }` 响应信封。
- 提供可复用的 `jsonSuccess` / `jsonError`，供现有会话 API 及后续 Change 1.4/1.5 API 使用。
- 更新 `conversationStore` 统一解析 envelope，消除 `{ error }` 分支。

**非目标：**

- 不修改请求体（request body）格式；仅改响应体。
- 不实现流式/SSE 响应的 envelope（Change 1.4 流式接口另行约定）。
- 不引入 Zod 等运行时 schema 校验库。
- 不修改 OpenSpec 主 spec 以外的 UI 组件行为。

## 设计决策

### 1. Envelope 结构

**决策：** 所有 JSON API 响应体 MUST 为：

```json
{
  "code": 0,
  "message": "success",
  "data": ...
}
```

| 字段 | 成功 | 失败 |
|------|------|------|
| `code` | `0` | 与 HTTP 状态码相同（400/404/500 等） |
| `message` | `"success"` | 可读中文错误文案 |
| `data` | 业务数据 | `null` |

**理由：** `code: 0` 表示成功是国内 API 常见约定；失败时 `code` 与 HTTP 对齐，便于日志与调试；保留 HTTP 状态码符合 REST 语义。

### 2. 保留 HTTP 状态码

**决策：** 成功仍返回 `200`/`201` 等；失败仍返回 `400`/`404`/`500` 等，**不**全部改为 HTTP 200。

**理由：** 与 Web 标准、`fetch` 的 `response.ok` 语义一致；前端可同时用 HTTP 状态与 body `code` 判断。

### 3. 辅助函数职责

**决策：** 在 `lib/api/api-response.ts` 提供：

- `ApiResponse<T>` 类型
- `API_SUCCESS_CODE = 0`、`API_SUCCESS_MESSAGE = "success"`
- `jsonSuccess<T>(data: T, init?: { status?: number })`
- `jsonError(message: string, status: number)`

**理由：** 集中构造 envelope，Route Handler 只关注业务数据与错误文案。

### 4. 各接口 `data` 形状

**决策：**

| 接口 | HTTP | `data` |
|------|------|--------|
| `GET /api/conversations` | 200 | `ConversationJson[]` |
| `POST /api/conversations` | 201 | `ConversationJson` |
| `PATCH /api/conversations/[id]` | 200 | `ConversationJson` |
| `DELETE /api/conversations/[id]` | 200 | `null` |

**理由：** DELETE 无业务返回值，`data: null` 即可；不再使用 `{ ok: true }`。

### 5. 前端解析策略

**决策：** 在 `conversationStore.ts` 中：

- 新增/扩展 API 解析辅助，读取 envelope 的 `message` 作为错误文案。
- 成功时从 `data` 取业务对象/数组，再经 `parseConversationJson` 转换日期。
- 404 幂等删除等行为逻辑不变，仅改响应解析来源。

**理由：** store 是 API 边界；UI 层无需感知 envelope。

### 6. 与 `conversation-response.ts` 的分工

**决策：** `conversation-response.ts` 继续负责 `ConversationJson` ↔ `Conversation` 转换；envelope 逻辑只在 `api-response.ts`（服务端）与 store（客户端）。

**理由：** 业务序列化与传输信封分离，后续消息 API 可复用同一 envelope。

## 风险 / 权衡

- [风险] 破坏性变更导致旧客户端解析失败 → 本会话内同步改 store，无外部消费者。
- [风险] 后续新 API 忘记使用 envelope → spec 与 code review 约束；辅助函数降低遗漏概率。

## 迁移计划

1. 完善 `lib/api/api-response.ts` envelope 实现。
2. 改 `app/api/conversations/route.ts` 与 `[id]/route.ts`。
3. 改 `conversationStore.ts` 解析逻辑。
4. `npm run lint` + `npm run build` + 手动验证 CRUD。

## 开放问题

- 无。流式 API 的 envelope 留待 Change 1.4 单独设计。
