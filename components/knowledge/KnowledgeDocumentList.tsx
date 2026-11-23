"use client";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { FileUp, ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/Button";
import type { DocumentDto, PageResult } from "@/lib/knowledge/contracts";
import { DocumentStages, Empty, KnowledgeShell, LoadState, Notice, Pager, RefreshButton, inputClass, knowledgeFetch, panelClass, useKnowledge } from "./KnowledgeUi";

type List = PageResult<DocumentDto> & { knowledgeBase: { name: string; writable: boolean } };
const pollList = (data: List) => data.items.some((doc) => Boolean(doc.activeTask));
export function KnowledgeDocumentList({ knowledgeBaseId: id }: { knowledgeBaseId: string }) {
  const [filters, setFilters] = useState({ category: "", sourceType: "", status: "", documentVersion: "" });
  const [applied, setApplied] = useState(filters);
  const [page, setPage] = useState(1);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error?: boolean }>();
  const params = new URLSearchParams({ ...applied, page: String(page) });
  const base = `/api/knowledge-bases/${id}/documents`;
  const { data, error, refresh } = useKnowledge<List>(`${base}?${params}`, pollList);
  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!file) return;
    const formElement = event.currentTarget;
    setBusy(true); setMessage(undefined);
    try {
      const form = new FormData(); form.set("file", file);
      const result = await knowledgeFetch<{ duplicate: boolean }>(base, { method: "POST", body: form });
      setMessage({ text: result.duplicate ? "已找到相同文档，没有重复创建。可进入详情查看或重新处理。" : "文件已接收，正在排队解析。进入文档详情可查看处理结果。" });
      setFile(null); formElement.reset(); refresh();
    } catch (e) { setMessage({ text: e instanceof Error ? e.message : "上传失败。", error: true }); }
    finally { setBusy(false); }
  }
  return <KnowledgeShell title={data?.knowledgeBase.name ?? "文档管理"} description="从原始资料到可引用的证据：上传后自动解析，确认正文后再生成切片与索引。">
    {data?.knowledgeBase.writable ? <section className={`${panelClass} mb-6`}><div className="flex items-center gap-3"><FileUp className="text-primary" size={22} /><h2 className="font-semibold">导入文档</h2></div><p className="mt-2 text-sm text-muted">支持 PDF、DOCX、DOC、HTML、TXT。默认单文件最大 20 MiB；扫描版与旧版 Word 需要对应解析依赖。</p><form onSubmit={upload} className="mt-4 flex flex-wrap items-center gap-3"><label htmlFor="document-file" className="sr-only">选择文档</label><input id="document-file" type="file" accept=".pdf,.docx,.doc,.html,.txt" required className="min-w-0 flex-1 text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-primary/10 file:px-3 file:py-2 file:text-primary" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /><Button type="submit" disabled={busy || !file}>{busy ? "上传中…" : "上传并解析"}</Button></form></section> : data && <Notice>这是系统知识库，可查看资料与处理结果。上传、重新处理和删除仅对你自己的私有知识库开放。</Notice>}
    {message && <Notice error={message.error}>{message.text}</Notice>}
    <form className={`${panelClass} mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5`} onSubmit={(event) => { event.preventDefault(); setApplied(filters); setPage(1); }}>
      <label className="flex flex-col gap-2 text-xs text-muted">分类<input value={filters.category} onChange={(e) => setFilters({ ...filters, category: e.target.value })} className={inputClass} placeholder="全部分类" /></label>
      <label className="flex flex-col gap-2 text-xs text-muted">来源类型<select value={filters.sourceType} onChange={(e) => setFilters({ ...filters, sourceType: e.target.value })} className={inputClass}><option value="">全部类型</option>{["pdf", "docx", "doc", "html", "txt"].map((s) => <option key={s}>{s}</option>)}</select></label>
      <label className="flex flex-col gap-2 text-xs text-muted">解析状态<select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })} className={inputClass}><option value="">全部状态</option><option value="pending">待解析</option><option value="succeeded">已完成</option><option value="failed">失败</option><option value="ocr_failed">OCR 失败</option><option value="manual_review">待人工检查</option><option value="processing">解析中</option><option value="ocr_processing">OCR 处理中</option></select></label>
      <label className="flex flex-col gap-2 text-xs text-muted">文档版本<input value={filters.documentVersion} onChange={(e) => setFilters({ ...filters, documentVersion: e.target.value })} className={inputClass} placeholder="例如 v1" /></label>
      <div className="flex items-end gap-2"><Button type="submit" variant="secondary">筛选</Button><Button type="button" variant="secondary" onClick={() => { const empty = { category: "", sourceType: "", status: "", documentVersion: "" }; setFilters(empty); setApplied(empty); setPage(1); }}>重置</Button></div>
    </form>
    <div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-semibold">文档 <span className="ml-2 text-sm font-normal text-muted">{data?.total ?? "—"}</span></h2><RefreshButton onClick={refresh} /></div>
    {!data ? <LoadState error={error} refresh={refresh} /> : !data.items.length ? <Empty title="暂无符合条件的文档" text={data.knowledgeBase.writable ? "上传第一份资料，或调整筛选条件。" : "当前暂无符合条件的系统资料，可调整筛选或查看其他知识库。"} /> : <div className="space-y-3">{data.items.map((doc) => <Link key={doc.id} href={`/knowledge-bases/${id}/documents/${doc.id}`} className={`${panelClass} block transition hover:border-primary/40`}><div className="mb-4 flex items-start justify-between gap-4"><div className="min-w-0"><h3 className="break-words font-medium">{doc.title || doc.originalFilename}</h3><p className="mt-2 text-xs text-muted">{doc.sourceType.toUpperCase()} · {doc.category || "未分类"} · {doc.documentVersion || "未标注版本"}</p></div><ArrowUpRight size={18} className="shrink-0 text-muted" /></div><DocumentStages doc={doc} />{doc.activeTask && <p className="mt-3 text-xs text-primary">{doc.activeTask.status === "pending" ? "任务排队中" : "任务处理中"} · 打开详情查看进度</p>}</Link>)}</div>}
    {data && <Pager page={page} pageSize={data.pageSize} total={data.total} onPage={setPage} />}
  </KnowledgeShell>;
}
