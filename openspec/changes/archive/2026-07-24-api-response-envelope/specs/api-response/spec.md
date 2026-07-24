## ADDED Requirements

### Requirement: 统一 JSON 响应信封
系统 SHALL 为所有 JSON Route Handler 响应提供统一信封结构 `{ code, message, data }`。

- 成功响应 MUST 设置 `code` 为 `0`，`message` 为 `"success"`，业务 payload 放在 `data`。
- 失败响应 MUST 设置 `code` 与 HTTP 状态码相同，`message` 为可读错误文案，`data` 为 `null`。
- HTTP 状态码 MUST 与语义一致（成功 2xx，客户端错误 4xx，服务端错误 5xx）；MUST NOT 将所有响应统一为 HTTP 200。

#### Scenario: 成功响应 envelope
- **WHEN** Route Handler 通过 `jsonSuccess` 返回业务数据
- **THEN** 响应体 MUST 为 `{ "code": 0, "message": "success", "data": <payload> }`

#### Scenario: 失败响应 envelope
- **WHEN** Route Handler 通过 `jsonError` 返回错误
- **THEN** 响应体 MUST 为 `{ "code": <httpStatus>, "message": "<可读文案>", "data": null }`，且 HTTP 状态码与 `code` 相同

#### Scenario: 无业务数据的成功响应
- **WHEN** 操作成功但无需要返回的业务对象（如 DELETE）
- **THEN** `data` MUST 为 `null`，且 `code` 仍为 `0`

### Requirement: API 响应辅助函数
系统 SHALL 在 `lib/api/api-response.ts` 提供可复用的响应构造工具。

- MUST 导出 `ApiResponse<T>` 类型。
- MUST 导出 `jsonSuccess<T>(data: T, init?: { status?: number })`。
- MUST 导出 `jsonError(message: string, status: number)`。
- `jsonSuccess` MUST 自动包装 envelope 并设置 `Content-Type: application/json`（通过 `NextResponse.json`）。

#### Scenario: jsonSuccess 默认 200
- **WHEN** 调用 `jsonSuccess(payload)` 且未指定 status
- **THEN** HTTP 状态码为 `200`，body 为 envelope 且 `data` 等于 `payload`

#### Scenario: jsonSuccess 指定 201
- **WHEN** 调用 `jsonSuccess(payload, { status: 201 })`
- **THEN** HTTP 状态码为 `201`，body envelope 中 `code` 仍为 `0`

#### Scenario: jsonError 构造失败 envelope
- **WHEN** 调用 `jsonError("标题不能为空。", 400)`
- **THEN** HTTP 状态码为 `400`，body 为 `{ "code": 400, "message": "标题不能为空。", "data": null }`
