## 1. 统一响应信封（服务端）



- [x] 1.1 完善 `lib/api/api-response.ts`：定义 `ApiResponse<T>`、`API_SUCCESS_CODE`、`API_SUCCESS_MESSAGE`，实现 envelope 版 `jsonSuccess` / `jsonError`。

- [x] 1.2 更新 `app/api/conversations/route.ts`：`GET` / `POST` 全部通过 envelope 辅助函数返回。

- [x] 1.3 更新 `app/api/conversations/[id]/route.ts`：`PATCH` / `DELETE` 全部通过 envelope 辅助函数返回；DELETE 成功时 `data` 为 `null`。

- [x] 1.4 移除所有 `{ error: "..." }` 与 `{ ok: true }` 直出响应。



## 2. 前端 store 适配



- [x] 2.1 在 `lib/stores/conversationStore.ts` 新增 envelope 解析辅助（读取 `code` / `message` / `data`）。

- [x] 2.2 更新 `fetchConversations`：从 `data` 数组解析会话列表。

- [x] 2.3 更新 `createConversation` / `updateConversationTitle`：从 `data` 解析单个 `ConversationJson`。

- [x] 2.4 更新 `deleteConversation`：成功时接受 `data: null`；失败与 404 幂等逻辑改读 envelope `message`。

- [x] 2.5 移除对 `{ error?: string }` 直出格式的依赖。



## 3. 验证



- [x] 3.1 运行 `npm run lint`。

- [x] 3.2 运行 `npm run build`。

- [x] 3.3 手动验证：GET 列表、POST 创建、PATCH 更新、DELETE 删除、400/404/500 错误响应均为 envelope 格式。

- [x] 3.4 验证 store 在成功/失败/404 幂等删除场景下 UI 行为与改前一致。



## 4. 文档与归档



- [x] 4.1 归档前将 delta specs 同步到 `openspec/specs/api-response/spec.md`（新建）及 `conversation-api`、`conversation-state` 主 spec。

- [x] 4.2 建议用户触发 `learning-digest` 沉淀 envelope 相关知识点。（用户选择跳过）
