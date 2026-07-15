---
name: start-new-change
description: 启动 roadmap 中的新 Change：从 main 创建新分支，展示本阶段任务，等待用户确认后生成 OpenSpec 文档，再等待第二次确认后进入实现。适用于用户说“开始新阶段”“开始 Change 1.2”“进入下一阶段”等场景。
license: MIT
compatibility: Requires openspec CLI, git, and docs/roadmap.md.
metadata:
  author: legal-ai-assistant
  version: "1.2"
---

# 启动新 Change

用于从 `docs/roadmap.md` 启动一个新的开发 Change，并把分支创建、任务说明、OpenSpec 文档生成、实现确认、归档和提交提示串成固定流程。

触发示例：

- “开始新阶段”
- “开始 Change 1.2”
- “进入下一阶段”
- “新建任务分支并开始 spec”

---

## 核心规则

- 在用户第一次确认前，不创建 OpenSpec 文档。
- 在用户第二次确认前，不写实现代码。
- 不超出 `docs/roadmap.md`、已有 `openspec/specs/` 和归档 change 中定义的范围。
- 不提交 `.env`、凭证或任何密钥文件。
- 新分支总是从最新 `main` 创建。
- 面向用户的说明、OpenSpec 文档正文、设计说明和任务描述必须使用中文。
- 分支名、OpenSpec change 名、文件名、代码标识符使用英文。
- OpenSpec 固定结构标记保留英文，例如 `## ADDED Requirements`、`### Requirement:`、`#### Scenario:`、`WHEN`、`THEN`。
- 如果前置条件不满足，必须暂停并说明阻塞原因。

---

## 命名规则

| 项目 | 格式 | 示例 |
|------|------|------|
| Git 分支 | `feature_<change_slug>_<YYMMDD>` | `feature_ui_components_260713` |
| OpenSpec change | kebab-case | `ui-components` |
| 归档目录 | `YYYY-MM-DD-<change-slug>` | `2026-07-13-ui-components` |

从 roadmap 的 Change 标题推导英文 slug。Git 分支使用 snake_case，OpenSpec change 使用 kebab-case。

---

## 总流程

```text
识别 Change
→ 前置检查
→ 从 main 创建分支
→ 展示阶段任务
→ 等待确认 1
→ 生成 OpenSpec 文档
→ 展示 spec 摘要
→ 等待确认 2
→ 按 tasks 实现
→ 验证
→ 提示用户手动沉淀知识
→ 归档
→ 提示 commit / push / PR
```

---

## 1. 识别目标 Change

1. 读取 `docs/roadmap.md`。
2. 如果用户明确指定 Change，例如“开始 Change 1.2”，使用该 Change。
3. 如果用户只说“开始新阶段”，根据以下信息推断下一个 Change：
   - `openspec/changes/archive/` 中已完成的 Change
   - `openspec/changes/` 中未归档的 active Change
   - roadmap 中的依赖顺序
4. 如果存在歧义，使用 `AskQuestion` 让用户选择。

需要准备的阶段摘要：

- Phase 编号和名称
- Change 编号和标题
- 时间估算
- 目标
- 工作内容
- 交付物
- 前置依赖
- 明确不做的内容
- 环境、依赖、数据库或外部服务影响

---

## 2. 前置检查

检查当前 git 状态：

```bash
git status --short
git branch --show-current
```

要求：

- 如果当前不在 `main`，先切回 `main`。
- 如果 `main` 有未提交改动，暂停并询问用户如何处理。
- 确认前置 Change 已完成、归档或已合并。
- 判断本 Change 是否可能需要：
  - 新 npm 依赖
  - 新环境变量
  - Prisma migration
  - 外部服务配置

若发现阻塞，暂停并说明原因。

---

## 3. 从 main 创建分支

始终从最新 `main` 创建分支：

```bash
git switch main
git pull origin main
git switch -c feature_<change_slug>_<YYMMDD>
```

切换后调用 `SetActiveBranch` 同步当前活动分支。

向用户说明：

```text
已创建并切换到分支 feature_<change_slug>_<YYMMDD>，基于最新 main。
```

---

## 4. 展示阶段任务，等待确认 1

在生成 OpenSpec 文档前，必须先向用户展示中文摘要：

```markdown
## 即将开始：<Change 编号> <Change 标题>

**Phase:** ...
**OpenSpec change:** `<kebab-case-slug>`
**Git 分支:** `feature_<change_slug>_<YYMMDD>`

### 目标
...

### 本阶段工作内容
1. ...
2. ...

### 交付物
- ...

### 依赖
- ...

### 明确不做
- ...

### 环境 / 技术前置
- ...
```

然后暂停，询问：

```text
请确认是否开始本 Change 并生成 OpenSpec 文档。回复「确认开始」继续。
```

未收到确认前，不运行 `openspec new change`，不写任何 OpenSpec artifact。

---

## 5. 生成 OpenSpec 文档

用户回复“确认开始”后，按照 OpenSpec 流程生成文档：

```bash
openspec new change "<kebab-case-slug>"
openspec status --change "<slug>" --json
```

按依赖顺序创建：

- `proposal.md`
- `design.md`
- `specs/<capability>/spec.md`
- `tasks.md`

写作要求：

- 文档正文必须中文。
- `proposal.md`、`design.md`、`tasks.md` 的标题和内容尽量中文。
- spec 文件保留 OpenSpec 必需英文结构标记，但 Requirement 名称、Scenario 名称、正文、任务描述都使用中文。
- 每个 capability 一个 spec 文件。
- 每个 requirement 至少有一个 `#### Scenario:`。
- tasks 必须使用 `- [ ]` checkbox 格式，方便 apply 阶段解析。

生成后运行：

```bash
openspec status --change "<slug>"
```

确认显示 `4/4 artifacts complete`。

---

## 6. 展示 spec 摘要，等待确认 2

OpenSpec 文档完成后，必须暂停并展示摘要：

```markdown
## OpenSpec 文档已生成

- proposal.md：...
- design.md：...
- specs：...
- tasks：N 项任务

### 关键设计决策
- ...

请确认 spec 是否符合预期。回复「确认 spec，开始实现」后我将按 tasks 执行。
```

未收到第二次确认前，不实现代码。

---

## 7. 实现

用户回复“确认 spec，开始实现”后，按 `openspec-apply-change` 工作流执行：

```bash
openspec instructions apply --change "<slug>" --json
```

执行要求：

- 先读取所有 context files。
- 按 `tasks.md` 顺序逐项实现。
- 每完成一项，立即把 `- [ ]` 改成 `- [x]`。
- 遇到需求不清、scope 变化、数据库重置、外部服务问题或破坏性操作时暂停询问。

---

## 8. 验证

根据 Change 类型选择验证方式：

| Change 类型 | 验证方式 |
|-------------|----------|
| 基础设施 / 数据库 | `npx prisma migrate dev`、`npx prisma generate` |
| UI 组件 | `npm run dev`，并在 `http://localhost:3000` 视觉验收 |
| API 路由 | 启动 dev server 后测试接口 |
| 所有 Change | `npm run lint`、`npm run build` |

将验证结果简要报告给用户。

---

## 9. 手动知识沉淀提示

验证完成且 tasks 全部完成后，归档前必须暂停并提示用户手动触发 `learning-digest` 做本 Change 的知识沉淀。

提醒模板：

```text
本 Change 的实现和验证已完成。建议先手动触发 learning-digest 沉淀本阶段知识点。

如需沉淀，请回复「复盘一下」或「沉淀知识点」。
如不需要，请回复「跳过沉淀，继续归档」。
```

规则：

- 只提示用户手动触发，不自动调用 `learning-digest`。
- 用户未回复沉淀或明确跳过前，不继续归档。
- 用户完成沉淀后，再继续执行归档流程。

---

## 10. 归档

所有 tasks 完成后，按 `openspec-archive-change` 工作流归档：

1. 确认 artifacts 完整。
2. 确认 tasks 全部完成。
3. 将 delta specs 同步到 `openspec/specs/<capability>/spec.md`。
4. 将 active change 移动到 `openspec/changes/archive/YYYY-MM-DD-<slug>/`。

---

## 11. 提交和 PR 提示

归档完成后，提醒用户提交：

```bash
git status
git add .
git commit -m "feat: <变更说明>"
```

推送：

```bash
git push -u origin feature_<change_slug>_<YYMMDD>
```

PR 可通过 GitHub 页面创建，或使用：

```bash
gh pr create --title "feat: <Change 标题>" --body "$(cat <<'EOF'
## Summary
- ...

## Test plan
- [ ] npm run lint
- [ ] npm run build
- [ ] npm run dev

EOF
)"
```

---

## 暂停条件

遇到以下情况必须暂停：

- 前置 Change 未完成
- `main` 上有未提交改动
- 用户尚未完成第一次或第二次确认
- 用户尚未完成或明确跳过知识沉淀提示
- 实现范围与 roadmap 或 spec 不一致
- 需要数据库 reset 或其他破坏性操作
- OpenSpec CLI 不可用
- 需要用户提供外部服务密钥或配置

---

## 输出模板

分支创建后：

```text
已切换到分支 feature_<slug>_<date>。
以下是 <Change 编号> 的任务摘要，请确认后开始生成 OpenSpec 文档。
```

spec 完成后：

```text
OpenSpec 文档已生成（4/4）。请 review 后回复「确认 spec，开始实现」。
```

实现完成后：

```text
Change <slug> 实现完成，已归档。
已在归档前提示用户手动沉淀知识。
建议下一步：commit → push → 创建 PR → merge 到 main。
```
