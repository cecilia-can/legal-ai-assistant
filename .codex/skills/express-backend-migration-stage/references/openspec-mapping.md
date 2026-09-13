# 阶段与 OpenSpec 映射

仅在用户要求使用 OpenSpec、项目流程要求，或当前阶段已有对应 Change 时应用。创建前先检查现有 Change，避免重复。

## 建议名称

| 阶段 | 建议 Change 名称 |
| --- | --- |
| M0 | `express-m0-api-contract-baseline` |
| M1 | `express-m1-service-extraction` |
| M2 | `express-m2-server-foundation` |
| M3 | `express-m3-conversation-message-routes` |
| M4 | `express-m4-chat-sse` |
| M5 | `express-m5-web-cutover` |
| M6 | `express-m6-auth-migration` |
| M7 | `express-m7-production-hardening` |
| M8 | `express-m8-final-cutover` |

如果已有相关 Change，应复用现有上下文，不创建近似重复项。

## 内容映射

- `proposal.md`：原因、目标、范围、排除项、依赖和价值。
- `design.md`：架构、认证边界、数据流、错误映射、兼容和回滚。
- `specs/<capability>/spec.md`：外部行为、API/SSE 契约、安全和验收场景。
- `tasks.md`：按依赖排序的实现、测试、文档、部署和回滚任务。

## 规则

1. 读取已有 Change 的实际产物，不根据名称猜测状态。
2. 阶段任务书确认前，不创建或修改 OpenSpec。
3. 需求写入 spec；设计选择写入 design；范围变化写入 proposal；实施工作写入 tasks。
4. 未验证的任务不得标记完成。
5. 不自动归档 Change；归档需要用户明确请求并确认验收完成。
6. 代码与 OpenSpec 冲突时先报告差异，不静默选择一方。
