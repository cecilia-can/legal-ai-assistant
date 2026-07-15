---
name: learning-digest
description: 复盘当前对话，提取并结构化知识点，去重合并进项目知识库，并补充可向外延伸的相关知识。用于用户说“复盘一下”“总结知识点”“沉淀一下”“做个学习复盘”“digest”等主动触发场景。
disable-model-invocation: true
license: MIT
metadata:
  author: legal-ai-assistant
  version: "1.0"
---

# 学习复盘与知识沉淀（learning-digest）

把当前聊天窗口里的技术问答，复盘成**结构化知识点**，去重后**追加/合并**进项目知识库 `docs/learning/`，并为每个知识点补充**可向外延伸**的相关内容。知识库按 roadmap 的 **Change** 分文件组织，呼应 `docs/roadmap.md` 中“学习优先：重点记录每个阶段的学习心得和架构决策，形成知识库”。

触发示例：

- “复盘一下”
- “总结/沉淀知识点”
- “做个学习复盘”
- “digest”

---

## 核心规则

- 面向用户的说明和知识库正文使用**中文**；文件名、标签、代码标识符使用英文。
- 只复盘**当前对话上下文**里真实出现过的问答，不凭空虚构问题。
- 知识点分为「✅ 确定」「⚠️ 需查证」两档；关键结论用 `WebSearch` 联网核实后再标注 🔗 来源。
- 再次触发时**必须去重**：同标题知识点做合并更新，而不是重复追加。
- 不修改 `docs/learning/` 以外的项目代码。
- 不提交 `.env`、凭证或密钥。

---

## 总流程

```text
识别当前 Change
→ 提取问题与知识点
→ 结构化 + 联网核实延伸内容
→ 读取目标知识库文件、去重合并
→ 更新 INDEX.md
→ 报告增量 + 列出“我的疑问”
```

---

## 1. 识别当前 Change（决定写入哪个文件）

按优先级判断当前处于哪个开发阶段：

1. 读 git 分支名：`git branch --show-current`，形如 `feature_<slug>_<YYMMDD>` → 取 `<slug>`。
2. 看 `openspec/changes/` 下未归档（非 `archive/`）的 active change 目录名。
3. 对照 `docs/roadmap.md` 找到对应的 Change 编号与标题。

得到目标文件：`docs/learning/<change-number>-<slug>.md`，例如 `docs/learning/1.2-ui-components.md`。

**无法唯一确定目标文件时，一律先用 `AskQuestion` 询问用户，不要静默写入。** 具体：

- **有歧义**（分支与 active change 指向不同 Change、或匹配到多个）→ 列出候选 Change 让用户选。
- **完全无信息**（不在 feature 分支、也没有 active change）→ 询问用户写入哪个 Change，并提供「写入 `docs/learning/general.md`」作为其中一个选项。

只有在用户明确选择后才写入；用户选 `general.md` 时才落到通用文件。

---

## 2. 提取问题与知识点

通读当前对话，提取：

- 用户**真实问过的问题**（合并重复/追问，保留核心疑问）。
- 每个问题对应的**结论**与**原理**。
- 过程中暴露的**易错点 / 踩过的坑 / 纠正过的误解**。
- 明确**还没搞懂或存疑**的点 → 进入“我的疑问”清单。

只保留有沉淀价值的技术点；寒暄、纯操作指令不入库。

---

## 3. 结构化每条知识点

每条知识点使用统一模板（写入知识库文件）：

```markdown
### [知识点标题]

- **来源问题**：<当时的核心问题，一句话>
- **结论**：<一句话核心答案>
- **原理 / 为什么**：<简要解释，2-4 句>
- **易错点 / 坑**：<可选，没有则省略>
- **延伸**：
  - <相关可拓展方向 1> ✅
  - <相关可拓展方向 2> ⚠️需查证
  - 🔗 <参考来源链接>
- **标签**：#<tag1> #<tag2>
- **状态**：#待复习
- **日期**：YYYY-MM-DD
```

标注约定：`✅` 确定、`⚠️需查证` 不确定、`🔗` 来源链接、`#待复习` / `#已掌握` 复习状态。

### 关于“延伸”（本 Skill 的重点）

- 只延伸**强相关**的 1 层内容，不要漫无边际发散。
- 关键结论（尤其是版本相关、API 相关）先用 `WebSearch` 核实，再写入并附 🔗 来源；未核实的标 `⚠️需查证`。
- 延伸方向优先服务于后续 Change（帮用户为下个阶段打基础）。

### 填好的示例（对照这个颗粒度）

```markdown
### App Router 下用 ReadableStream 实现流式响应

- **来源问题**：Next.js 的 Route Handler 里怎么把 AI 的流式输出返回给前端？
- **结论**：在 Route Handler 中返回一个 `Response(stream)`，其中 `stream` 是 `ReadableStream`，前端用 `response.body.getReader()` 逐块读取。
- **原理 / 为什么**：App Router 的 Route Handler 基于 Web 标准的 `Request`/`Response`，原生支持流式 body；无需像旧版 API Routes 那样手动 `res.write()`。
- **易错点 / 坑**：别忘了设 `Content-Type: text/event-stream` 并禁用缓冲；`export const dynamic = "force-dynamic"` 避免被静态化。
- **延伸**：
  - Vercel AI SDK 的 `streamText` 已封装好这套流程，可直接用 ✅
  - 前端可用 `EventSource`（SSE）替代手动 reader，但不支持 POST ⚠️需查证
  - 🔗 https://nextjs.org/docs/app/building-your-application/routing/route-handlers#streaming
- **标签**：#nextjs #streaming #app-router
- **状态**：#待复习
- **日期**：2026-07-15
```

---

## 4. 去重合并进知识库

同一个 Change 可以分多次沉淀，写入同一个文件。**每次触发都新建一个带日期的「沉淀批次」小节，追加到文件末尾**，本次的新知识点归入该批次，保证"下一次接在上一次后面"的时间顺序。

1. 读取目标文件 `docs/learning/<change-number>-<slug>.md`（不存在则新建，用第 6 节的文件模板）。
2. 对每条待写入的知识点，按 `###` 标题匹配文件中已有条目：
   - **标题为新** → 归入本次批次小节。
   - **标题相同（含语义等价，措辞略有出入也算同一条）** → **在原位合并更新**：补充新的延伸/来源/易错点、更新日期；不在新批次里重复整条。
3. 在文件末尾追加本次批次小节 `## 沉淀 YYYY-MM-DD（第 N 次）`（N 为该文件已有批次数 +1），把本次的新条目放进去。
4. **不要为了归类而移动或重排已有条目**，历史批次保持原有顺序不动。

---

## 5. 更新 INDEX.md

更新 `docs/learning/INDEX.md`：登记/刷新本 Change 文件的条目数、最近更新日期，保证一眼看到各阶段积累量。

---

## 6. 文件模板

新建单个 Change 知识库文件时的结构（`##` 为沉淀批次，`###` 为知识点）：

```markdown
# 学习知识库：<Change 编号> <Change 标题>

> Phase：<Phase 编号与名称>　|　分支：`feature_<slug>_<YYMMDD>`

## 沉淀 <YYYY-MM-DD>（第 1 次）

### <知识点标题>
<知识点条目，见第 3 节模板>

## 我的疑问（待解决）

- [ ] <存疑问题>
```

后续每次沉淀，在「我的疑问」小节**之前**追加新的 `## 沉淀 <日期>（第 N 次）` 批次；「我的疑问」始终保持在文件末尾。

---

## 7. 报告增量

复盘完成后，向用户报告：

```text
本次复盘写入 docs/learning/<file>.md（沉淀第 N 次）：
- 本批次新增 X 条；原位合并更新 Y 条已有知识点
- 联网核实 M 条关键结论
- 我的疑问（待解决）：
  1. ...
  2. ...
```

---

## 暂停 / 询问条件

- 无法唯一确定当前 Change 时（含完全无信息的情况），一律用 `AskQuestion` 确认写入哪个文件，不静默兜底。
- 当前对话没有可沉淀的技术知识点时，如实说明、不硬凑。
