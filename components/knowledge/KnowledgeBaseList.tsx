"use client";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { ArrowUpRight, BookOpen, LockKeyhole, Globe2, Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import type { KnowledgeBaseDto } from "@/lib/knowledge/contracts";
import { KnowledgeShell, Empty, LoadState, Notice, RefreshButton, inputClass, knowledgeFetch, panelClass, useKnowledge } from "./KnowledgeUi";

export function KnowledgeBaseList() {
  const { data, error, refresh } = useKnowledge<KnowledgeBaseDto[]>("/api/knowledge-bases");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function create(event: FormEvent) {
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      await knowledgeFetch("/api/knowledge-bases", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
      setName(""); refresh();
    } catch (e) { setMessage(e instanceof Error ? e.message : "创建失败。"); }
    finally { setBusy(false); }
  }
  return <KnowledgeShell title="让每一份资料都有据可查" description="集中管理法律文档，逐步检查解析正文、切片质量与索引进度。系统资料可阅读，私有知识库由你管理。">
    <section className={`${panelClass} mb-8 flex flex-col justify-between gap-5 sm:flex-row sm:items-center`}>
      <div><h2 className="font-semibold">新建私有知识库</h2><p className="mt-1 text-sm text-muted">按法律领域或项目整理你的资料。</p></div>
      <form onSubmit={create} className="flex flex-wrap gap-2"><label className="sr-only" htmlFor="kb-name">知识库名称</label><input id="kb-name" required maxLength={100} value={name} onChange={(e) => setName(e.target.value)} placeholder="例如：劳动争议资料" className={`${inputClass} flex-1`} /><Button type="submit" disabled={busy || !name.trim()}><Plus size={16} className="mr-1" />{busy ? "创建中…" : "创建"}</Button></form>
    </section>
    {message && <Notice error>{message}</Notice>}
    <div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-semibold">全部知识库 <span className="ml-2 text-sm font-normal text-muted">{data?.length ?? "—"}</span></h2><RefreshButton onClick={refresh} /></div>
    {!data ? <LoadState error={error} refresh={refresh} /> : !data.length ? <Empty title="还没有知识库" text="先创建一个私有知识库，再上传第一份文档。" /> : <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{data.map((kb) => <Link href={`/knowledge-bases/${kb.id}`} key={kb.id} className={`${panelClass} group transition hover:border-primary/40 hover:shadow-sm`}>
      <div className="mb-6 flex items-center justify-between"><BookOpen size={24} className="text-primary" /><ArrowUpRight size={18} className="text-muted group-hover:text-primary" /></div><h3 className="break-words text-lg font-semibold">{kb.name}</h3><div className="mt-3 flex items-center gap-2 text-xs text-muted">{kb.writable ? <LockKeyhole size={13} /> : <Globe2 size={13} />}{kb.writable ? "私有 · 可管理" : "系统 · 只读"}</div><p className="mt-6 border-t border-border pt-4 text-sm text-muted">{kb.documentCount} 份文档</p>
    </Link>)}</div>}
  </KnowledgeShell>;
}
