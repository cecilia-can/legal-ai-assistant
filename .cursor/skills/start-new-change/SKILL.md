---
name: start-new-change
description: Start a new roadmap Change with branch setup, task briefing, dual confirmation gates, OpenSpec artifact generation, and post-completion commit/PR guidance. Use when the user says they are starting a new phase, entering the next Change, or wants to begin a new task from the roadmap.
license: MIT
compatibility: Requires openspec CLI, git, and docs/roadmap.md.
metadata:
  author: legal-ai-assistant
  version: "1.0"
---

# Start New Change

Kick off a new roadmap Change with branch preparation, scope briefing, dual confirmation gates, OpenSpec planning artifacts, and post-completion git guidance.

**Trigger phrases (examples):**
- "开始新阶段"
- "开始 Change 1.2"
- "进入下一阶段"
- "新建任务分支并开始 spec"
- "start new change"

---

## Guardrails

- **Do NOT** create OpenSpec artifacts before **Confirmation 1**.
- **Do NOT** write implementation code before **Confirmation 2**.
- **Do NOT** guess scope beyond `docs/roadmap.md` and archived changes.
- **Do NOT** commit `.env` or other secret files.
- **Always** create the git branch from an up-to-date `main`.
- **Always** use Chinese for planning summaries shown to the user; use English for branch names, change slugs, and code identifiers.
- If prerequisites are missing, **STOP** and explain what is blocked.

---

## Naming Conventions

| Item | Format | Example |
|------|--------|---------|
| Git branch | `feature_<change_slug>_<YYMMDD>` | `feature_ui_components_260713` |
| OpenSpec change | kebab-case slug | `ui-components` |
| Archive folder | `YYYY-MM-DD-<change-slug>` | `2026-07-13-ui-components` |

Derive `<change_slug>` from the roadmap Change title (English, snake_case). Derive OpenSpec change slug from the same title (kebab-case).

---

## Workflow Overview

```
Identify Change → Pre-checks → Create branch → Brief user → [Confirm 1]
  → Generate OpenSpec artifacts → Brief specs → [Confirm 2]
  → Implement (openspec-apply-change) → Verify → Archive → Commit/PR hints
```

---

## Step 1: Identify the Target Change

1. Read `docs/roadmap.md` for Phase / Change definitions.
2. If the user named a Change explicitly, use that Change.
3. Otherwise, infer the **next** Change by checking:
   - `openspec/changes/archive/` for completed changes
   - `openspec/changes/` for active (non-archived) changes
   - Roadmap dependency order (e.g. 1.2 requires 1.1)
4. If ambiguous, use **AskQuestion** to let the user pick among eligible Changes.

Extract and prepare a briefing with:
- Phase number and name
- Change number and title
- Time estimate
- Goal
- Work items (from roadmap)
- Deliverables (files / directories)
- Dependencies (prior Changes)
- Non-Goals (infer from roadmap scope boundaries and later Changes)

---

## Step 2: Pre-flight Checks

Before creating a branch, verify:

### Git state
```bash
git status --short
git branch --show-current
```

- If there are uncommitted changes on `main`, warn the user and ask whether to commit, stash, or discard before continuing.
- If not on `main`, switch to `main` first (unless user explicitly overrides).

### Prerequisites
- Confirm dependency Changes are implemented and archived (or merged).
- Check whether this Change needs:
  - New npm dependencies
  - New environment variables (update `.env.example` during implementation)
  - Database schema changes / Prisma migrations
  - External services (Neon, OpenAI API, etc.)

If blocked, **STOP** and list what must be resolved first.

---

## Step 3: Create Git Branch (before Confirmation 1)

Always branch from up-to-date `main`:

```bash
git switch main
git pull origin main
git switch -c feature_<change_slug>_<YYMMDD>
```

After switching, call **SetActiveBranch** with the new branch name.

Announce:
> 已创建并切换到分支 `feature_<change_slug>_<YYMMDD>`，基于最新 `main`。

---

## Step 4: Present Change Briefing → Confirmation 1

Show the user a structured summary in Chinese:

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
- Change X.X（已完成 / 未完成）

### 明确不做（Non-Goals）
- ...

### 环境 / 技术前置
- ...
```

**STOP.** Ask the user to confirm before generating specs:

> 请确认是否开始本 Change 并生成 OpenSpec 文档。回复「确认开始」继续。

**Do NOT** run `openspec new change` or write any artifact until the user confirms.

---

## Step 5: Generate OpenSpec Artifacts (after Confirmation 1)

Follow the **openspec-propose** skill workflow:

1. `openspec new change "<kebab-case-slug>"`
2. `openspec status --change "<slug>" --json`
3. Create artifacts in dependency order:
   - `proposal.md`
   - `design.md`
   - `specs/<capability>/spec.md` (one per capability)
   - `tasks.md`
4. Re-run `openspec status --change "<slug>"` until **4/4 artifacts complete**.

Use `docs/roadmap.md`, `docs/vision.md`, and existing `openspec/specs/` as context. Planning documents MUST be written in Chinese.

After generation, summarize:
- Change name and location
- Capabilities added or modified
- Task count
- Key design decisions

---

## Step 6: Present Spec Summary → Confirmation 2

Show a concise spec summary and **STOP**:

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

**Do NOT** implement code until the user confirms.

---

## Step 7: Implement (after Confirmation 2)

Follow the **openspec-apply-change** skill:

1. `openspec instructions apply --change "<slug>" --json`
2. Read all context files
3. Implement pending tasks one by one
4. Mark each task `- [x]` in `tasks.md` immediately after completion
5. Pause on blockers, scope changes, or unclear requirements

If implementation reveals a design issue, suggest updating artifacts before continuing.

---

## Step 8: Verify

Run checks appropriate to the Change type:

| Change type | Verification |
|-------------|-------------|
| Infrastructure / DB | `npx prisma migrate dev`, `npx prisma generate`, import `lib/db.ts` |
| UI components | `npm run dev`, visual check at `http://localhost:3000` |
| API routes | `npm run dev`, manual or scripted endpoint test |
| All | `npm run lint` |

Report verification results to the user.

---

## Step 9: Archive (when all tasks complete)

Follow the **openspec-archive-change** skill:

1. Confirm all artifacts and tasks are done
2. Sync delta specs to `openspec/specs/<capability>/spec.md`
3. Move change to `openspec/changes/archive/YYYY-MM-DD-<slug>/`

---

## Step 10: Commit and PR Guidance

After implementation and archive, remind the user:

### Commit
```bash
git status
git add .
git commit -m "feat: <brief description in Chinese or English per team convention>"
```

Suggested commit prefix:
- `feat:` — new capability
- `fix:` — bug fix
- `chore:` — tooling / config only

**Never commit:** `.env`, credentials, generated secrets.

### Push
```bash
git push -u origin feature_<change_slug>_<YYMMDD>
```

### Pull Request
```bash
gh pr create --title "feat: <Change title>" --body "$(cat <<'EOF'
## Summary
- ...

## Test plan
- [ ] npm run dev
- [ ] npm run lint
- [ ] ...

EOF
)"
```

Or create the PR manually on GitHub.

---

## Pause Conditions

**STOP and ask the user** when:

- Prerequisites are not met (dependency Change incomplete)
- Uncommitted changes block a clean branch from `main`
- User has not given Confirmation 1 or Confirmation 2
- Implementation scope differs from roadmap (suggest artifact update)
- Database reset or other destructive action is required
- OpenSpec CLI is unavailable

---

## Output Templates

### On branch created (before Confirm 1)
```
已切换到分支 feature_<slug>_<date>。
以下是 <Change 编号> 的任务摘要，请确认后开始生成 OpenSpec 文档。
```

### On specs ready (before Confirm 2)
```
OpenSpec 文档已生成（4/4）。请 review 后回复「确认 spec，开始实现」。
```

### On completion
```
Change <slug> 实现完成，已归档。
建议下一步：commit → push → 创建 PR → merge 到 main。
```
