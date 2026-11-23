"use client";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { labels, type DocumentDetailDto, type PageResult, type ProcessingAction } from "@/lib/knowledge/contracts";
import { DocumentStages, Empty, KnowledgeShell, LoadState, Notice, Pager, RefreshButton, Status, inputClass, knowledgeFetch, panelClass, useKnowledge } from "./KnowledgeUi";
import { OcrReviewWorkspace } from "./OcrReviewEditor";

const pollDetail = (data: DocumentDetailDto) => Boolean(data.activeTask);
type Chunk = { id: string; ordinal: number; text: string; sectionPath: string | null; locator: unknown; pageFrom: number | null; pageTo: number | null };
type NormalizedPage = { pageNumber: number | null; text: string };
export function QualityIssues({ issues }: { issues: unknown }) {
  if (!Array.isArray(issues) || !issues.length) return <p className="text-sm text-muted">未发现需要提示的质量问题。</p>;
  const grouped = new Map<string, { severity: "blocking" | "warning"; message: string; count: number }>();
  for (const issue of issues) {
    const item = issue && typeof issue === "object" ? issue as Record<string, unknown> : {};
    const severity = item.severity === "blocking" ? "blocking" : "warning";
    const message = typeof item.message === "string" ? item.message : "请检查原文与切片边界。";
    const key = JSON.stringify([severity, message]);
    const existing = grouped.get(key);
    if (existing) existing.count += 1;
    else grouped.set(key, { severity, message, count: 1 });
  }
  return <><p className="mb-3 text-sm text-muted">共 {issues.length} 条提示，合并为 {grouped.size} 类。</p><ul className="space-y-2 text-sm leading-6">{[...grouped.values()].map((item) => <li key={JSON.stringify([item.severity, item.message])} className={item.severity === "blocking" ? "text-destructive" : "text-muted"}>{item.severity === "blocking" ? "无法启用：" : "需复核："}{item.message}{item.count > 1 && <span className="ml-2 whitespace-nowrap">（{item.count} 条）</span>}</li>)}</ul></>;
}
function ContentPreview({ base, tab, setId }: { base: string; tab: string; setId: string }) {
  const [page, setPage] = useState(1);
  const suffix = tab === "normalized" ? "normalized" : "chunks";
  const query = new URLSearchParams({ page: String(page), pageSize: tab === "normalized" ? "1" : "10", ...(setId ? { chunkSetId: setId } : {}) });
  const { data, error, refresh } = useKnowledge<PageResult<Chunk | NormalizedPage>>(`${base}/${suffix}?${query}`);
  if (!data) return <LoadState error={error} refresh={refresh} />;
  if (!data.items.length) return <Empty title={tab === "normalized" ? "暂无规范化正文" : "暂无切片"} text="完成对应处理后即可在这里预览。" />;
  return <><div className="space-y-4">{data.items.map((item, index) => <article key={"id" in item ? item.id : index} className={`${panelClass} overflow-hidden`}>
    <div className="mb-4 flex flex-wrap items-center gap-3 text-xs text-muted">{"ordinal" in item ? <><span>切片 {item.ordinal + 1}</span><span>{item.sectionPath || "无章节定位"}</span><span>{item.pageFrom ? `第 ${item.pageFrom}${item.pageTo && item.pageTo !== item.pageFrom ? `–${item.pageTo}` : ""} 页` : "无物理页码"}</span></> : <span>{item.pageNumber ? `第 ${item.pageNumber} 页` : "正文（来源无物理页码）"}</span>}</div>
    <p className="whitespace-pre-wrap break-words text-sm leading-7">{item.text}</p>
  </article>)}</div><Pager page={page} pageSize={data.pageSize} total={data.total} onPage={setPage} /></>;
}
export function KnowledgeDocumentDetail({ knowledgeBaseId: kbId, documentId: id }: { knowledgeBaseId: string; documentId: string }) {
  const base = `/api/knowledge-bases/${kbId}/documents/${id}`;
  const { data, error, refresh } = useKnowledge<DocumentDetailDto>(base, pollDetail);
  const [tab, setTab] = useState("normalized");
  const [selectedSet, setSelectedSet] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [reviewDirty, setReviewDirty] = useState(false);
  const [pendingReviewHash, setPendingReviewHash] = useState<{ previous: string; next: string } | null>(null);
  const [message, setMessage] = useState<{ text: string; error?: boolean }>();
  async function run(action: ProcessingAction) {
    if (reviewDirty && !window.confirm("当前页有未保存的修改，确定继续？")) return;
    setBusy(true); setMessage(undefined);
    try {
      await knowledgeFetch(`${base}/tasks`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
      setMessage({ text: "任务已提交，处理状态会自动更新。" }); if (action === "parse") setPendingReviewHash(null); refresh();
    } catch (e) { setMessage({ text: e instanceof Error ? e.message : "任务提交失败。", error: true }); }
    finally { setBusy(false); }
  }
  async function remove() {
    setBusy(true); setMessage(undefined);
    try { await knowledgeFetch(base, { method: "DELETE" }); window.location.assign(`/knowledge-bases/${kbId}`); }
    catch (e) { setMessage({ text: e instanceof Error ? e.message : "删除失败。", error: true }); setConfirmDelete(false); setBusy(false); }
  }
  async function confirmReview() {
    if (!data?.normalizedContentHash) return;
    setBusy(true); setMessage(undefined);
    try {
      await knowledgeFetch(`${base}/review`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expectedHash: data.normalizedContentHash }) });
      setMessage({ text: "全文审核已确认。现在可以生成切片和索引。" });
      refresh();
    } catch (error) { setMessage({ text: error instanceof Error ? error.message : "确认审核失败。", error: true }); }
    finally { setBusy(false); }
  }
  const setId = selectedSet || data?.chunkSets.find((s) => s.status === "active")?.id || data?.chunkSets[0]?.id || "";
  const currentSet = data?.chunkSets.find((s) => s.id === setId);
  const task = data?.activeTask;
  const awaitingReviewRefresh = Boolean(pendingReviewHash && pendingReviewHash.next !== pendingReviewHash.previous && pendingReviewHash.previous === data?.normalizedContentHash);
  const needsReview = data?.extractionMethod === "ocr" && (data.reviewedNormalizedHash !== data.normalizedContentHash || awaitingReviewRefresh);
  return <KnowledgeShell title={data?.title || data?.originalFilename || "文档详情"} description="核对原文与来源位置，查看处理记录，再决定哪些资料进入检索。" parent={{ href: `/knowledge-bases/${kbId}`, label: "文档列表" }}>
    {message && <Notice error={message.error}>{message.text}</Notice>}
    {!data ? <LoadState error={error} refresh={refresh} /> : <>
      {!task && data.tasks[0]?.status === "failed" && <Notice error>{labels[data.tasks[0].action] || data.tasks[0].action}失败：{data.tasks[0].errorMessage}</Notice>}
      <section className={`${panelClass} mb-6`}><div className="mb-5 flex flex-wrap items-start justify-between gap-4"><div><p className="mb-3 break-all text-sm text-muted">{data.originalFilename} · {data.sourceType.toUpperCase()} · {data.documentVersion || "无版本"}</p><DocumentStages doc={data} /></div><RefreshButton onClick={refresh} /></div>
        <div className="grid gap-4 border-t border-border pt-5 text-sm sm:grid-cols-3"><div><p className="text-xs text-muted">文档分类</p><p className="mt-1">{data.category || "未分类"}</p></div><div><p className="text-xs text-muted">解析版本</p><p className="mt-1 break-all">{data.parserVersion || "尚未解析"}</p></div><div><p className="text-xs text-muted">当前索引模型</p><p className="mt-1 break-all">{data.model}</p></div></div>
        {data.extractionMethod === "ocr" && <p className={`mt-4 text-sm ${needsReview ? "text-amber-700 dark:text-amber-400" : "text-emerald-700 dark:text-emerald-400"}`}>{needsReview ? "OCR 正文待人工审核：请对照原图修改，完成后确认全文审核。" : `OCR 正文已审核${data.reviewedAt ? ` · ${new Date(data.reviewedAt).toLocaleString("zh-CN")}` : ""}。`}</p>}
        {data.sourceUri && <a href={data.sourceUri} target="_blank" rel="noreferrer" className="mt-4 inline-block text-sm text-primary underline">查看来源链接</a>}
        {data.errorMessage && <p role="alert" className="mt-4 text-sm text-destructive">{data.errorMessage}</p>}
        {data.writable ? <><div className="mt-6 flex flex-wrap gap-2"><Button variant="secondary" onClick={() => run("parse")} disabled={busy || Boolean(task) || !data.hasOriginal}>重新解析</Button>{needsReview && <Button onClick={confirmReview} disabled={busy || Boolean(task) || reviewDirty || awaitingReviewRefresh || !data.hasNormalized}>确认全文审核完成</Button>}<Button variant="secondary" onClick={() => run("chunk")} disabled={busy || Boolean(task) || !data.hasNormalized || needsReview || reviewDirty}>生成 / 复用切片</Button><Button onClick={() => run("embed")} disabled={busy || Boolean(task) || !data.chunkCount || needsReview || reviewDirty}>补齐当前模型索引</Button><Button variant="secondary" className="text-destructive" disabled={busy || Boolean(task)} onClick={() => setConfirmDelete(true)}>删除文档</Button></div><p className="mt-3 text-xs leading-6 text-muted">{task ? "文档有活动任务，请等待处理结束后再操作。" : !data.hasOriginal ? "该历史文档没有受控原件，重新解析前请重新上传。" : !data.hasNormalized ? "请先完成解析，再生成切片。" : awaitingReviewRefresh ? "正在同步最新正文，请稍候。" : reviewDirty ? "当前页有未保存修改，请先保存，再确认全文审核。" : needsReview ? "OCR 正文待审核；确认全文后才能切片和索引。" : !data.chunkCount ? "检查正文并生成合格切片后，即可补齐索引。" : "相同策略切片会复用，索引只处理缺失向量。"}</p></> : <p className="mt-5 text-sm text-muted">系统知识库只读。</p>}
      </section>
      {task && <Notice><span className="mr-2 font-medium">{labels[task.action] || task.action}</span><Status value={task.status} /><p className="mt-2">{task.status === "pending" ? "等待后台处理。如长时间排队，请确认已启动知识库 worker。" : `当前阶段：${labels[task.stage] || task.stage}`}{task.total > 0 && ` · 已完成 ${task.completed} / ${task.total}`}</p>{task.status === "pending" && <p className="mt-1 text-xs text-muted">开发环境启动命令：npm run knowledge:worker</p>}</Notice>}
      <div className="mb-5 flex flex-wrap gap-2 border-b border-border pb-3" role="tablist" aria-label="文档内容">{[["normalized", "规范化正文"], ["chunks", "切片与质量"], ["tasks", "处理记录"]].map(([value, text]) => <button type="button" role="tab" aria-selected={tab === value} key={value} onClick={() => { if (reviewDirty && !window.confirm("当前页有未保存的修改，确定离开？")) return; setReviewDirty(false); setTab(value); }} className={`rounded-lg px-4 py-2 text-sm ${tab === value ? "bg-primary text-primary-foreground" : "text-muted hover:bg-surface"}`}>{text}</button>)}</div>
      {tab === "tasks" ? <div className="space-y-3">{!data.tasks.length ? <Empty title="暂无处理记录" text="新提交的解析、切片和索引任务会显示在这里。" /> : data.tasks.map((record) => <article className={panelClass} key={record.id}><div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-3"><span className="font-medium">{labels[record.action] || record.action}</span><Status value={record.status} /></div><span className="text-xs text-muted">{new Date(record.createdAt).toLocaleString("zh-CN")}</span></div><p className="mt-3 text-sm text-muted">执行次数 {record.attempts}{record.total > 0 && ` · 已完成 ${record.completed} / ${record.total}`}</p>{record.errorMessage && <p className="mt-3 text-sm text-destructive">{record.errorMessage}</p>}{Boolean(record.result) && typeof record.result === "object" && record.result !== null && "message" in record.result && <p className="mt-3 text-sm">{String(record.result.message)}</p>}</article>)}</div> : <>
        {tab === "chunks" && <div className="mb-5"><label className="flex flex-wrap items-center gap-3 text-sm">切片集<select className={`${inputClass} max-w-full`} value={setId} onChange={(e) => setSelectedSet(e.target.value)}><option value="" disabled>请选择切片集</option>{data.chunkSets.map((set) => <option value={set.id} key={set.id}>{labels[set.status] || set.status} · {set.strategyVersion} · {set.chunkCount} 段 · {new Date(set.createdAt).toLocaleString("zh-CN")}</option>)}</select></label>{Boolean(currentSet?.qualityIssues) && <div className={`${panelClass} mt-4`}><h3 className="mb-2 text-sm font-medium">质量检查结果</h3><QualityIssues issues={currentSet?.qualityIssues} /></div>}</div>}
        {tab === "normalized" && data.extractionMethod === "ocr" && data.normalizedContentHash ? <OcrReviewWorkspace base={base} expectedHash={data.normalizedContentHash} editable={data.writable && !busy && !task && !awaitingReviewRefresh} dirty={reviewDirty} onDirtyChange={setReviewDirty} onSaved={(hash) => { setPendingReviewHash({ previous: data.normalizedContentHash!, next: hash }); refresh(); }} /> : <ContentPreview key={`${tab}-${setId}-${data.tasks[0]?.completedAt ?? data.updatedAt}`} base={base} tab={tab} setId={setId} />}
      </>}
    </>}
    <ConfirmDialog open={confirmDelete} title="删除这份文档？" description="将移除文档记录、切片、向量和文档级任务，资料将不再参与检索。原件、派生文件及已有聊天回答中的来源快照仍会保留。" confirmLabel="删除文档" isConfirming={busy} onConfirm={remove} onCancel={() => setConfirmDelete(false)} />
  </KnowledgeShell>;
}
